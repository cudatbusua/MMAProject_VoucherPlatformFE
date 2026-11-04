import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Principal } from '../auth/security';
import { hashPassword } from '../common/crypto';
import { Database } from '../database/database.module';
import { CampaignStatus, Role } from '../database/schemas';
import {
  BrandDto,
  CampaignDto,
  SearchDto,
  StaffDto,
  StoreDto,
  UpdateCampaignDto,
  UpdateStoreDto,
} from './catalog.dto';
import { validateCampaign } from './rules';

@Injectable()
export class CatalogService {
  constructor(private readonly db: Database) {}
  async brandAccess(id: string, user: Principal) {
    const brand = await this.db.brands.findById(id);
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu.');
    if (user.role !== Role.ADMIN && String(brand.ownerId) !== user.userId)
      throw new ForbiddenException('Không thuộc thương hiệu của bạn.');
    return brand;
  }
  createBrand(user: Principal, dto: BrandDto) {
    return this.db.brands.create({ ...dto, ownerId: user.userId });
  }
  async brandState(
    id: string,
    user: Principal,
    state: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
    reason?: string,
  ) {
    return this.db.connection.transaction(async (session) => {
      const brand = await this.db.brands.findById(id).session(session);
      if (!brand) throw new NotFoundException();
      if (state === 'REJECTED' && brand.status !== 'PENDING')
        throw new BadRequestException('Chỉ từ chối thương hiệu đang chờ duyệt.');
      brand.status = state;
      brand.reason = reason;
      await brand.save({ session });
      await this.db.audits.create(
        [{ actorId: user.userId, action: 'BRAND_' + state, resourceId: id, detail: reason }],
        { session },
      );
      return brand;
    });
  }
  async createStore(brandId: string, user: Principal, dto: StoreDto) {
    await this.brandAccess(brandId, user);
    return this.db.stores.create({
      brandId,
      name: dto.name,
      address: dto.address,
      location: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
    });
  }
  async updateStore(id: string, user: Principal, dto: UpdateStoreDto) {
    const store = await this.db.stores.findById(id);
    if (!store) throw new NotFoundException();
    await this.brandAccess(String(store.brandId), user);
    if (dto.name !== undefined) store.name = dto.name;
    if (dto.address !== undefined) store.address = dto.address;
    if (dto.active !== undefined) store.active = dto.active;
    if (dto.latitude !== undefined || dto.longitude !== undefined)
      store.location = {
        type: 'Point',
        coordinates: [
          dto.longitude ?? store.location.coordinates[0],
          dto.latitude ?? store.location.coordinates[1],
        ],
      };
    return store.save();
  }
  async createStaff(brandId: string, user: Principal, dto: StaffDto) {
    await this.brandAccess(brandId, user);
    if (
      (await this.db.stores.countDocuments({ _id: { $in: dto.storeIds }, brandId, active: true })) !==
      dto.storeIds.length
    )
      throw new BadRequestException('Cửa hàng không thuộc thương hiệu hoặc đã đóng.');
    return this.db.users.create({
      email: dto.email,
      fullName: dto.fullName,
      role: Role.STORE_STAFF,
      passwordHash: await hashPassword(dto.password),
      storeIds: dto.storeIds,
    });
  }
  async storesValid(brandId: string, ids: string[]) {
    if (
      !ids.length ||
      (await this.db.stores.countDocuments({ _id: { $in: ids }, brandId, active: true })) !== ids.length
    )
      throw new BadRequestException('Phải chọn cửa hàng đang hoạt động thuộc thương hiệu.');
  }
  async createCampaign(brandId: string, user: Principal, dto: CampaignDto) {
    await this.brandAccess(brandId, user);
    validateCampaign(dto);
    await this.storesValid(brandId, dto.storeIds);
    return this.db.campaigns.create({ ...dto, brandId });
  }
  async campaignAccess(id: string, user: Principal) {
    const c = await this.db.campaigns.findById(id);
    if (!c) throw new NotFoundException('Không tìm thấy chiến dịch.');
    await this.brandAccess(String(c.brandId), user);
    return c;
  }
  async updateCampaign(id: string, user: Principal, dto: UpdateCampaignDto) {
    const existing = await this.campaignAccess(id, user);
    if (existing.status === CampaignStatus.ENDED || existing.status === CampaignStatus.PENDING)
      throw new BadRequestException(
        'Rút chiến dịch về nháp trước khi sửa; chiến dịch kết thúc không được sửa.',
      );
    const merged = { ...existing.toObject(), ...dto };
    validateCampaign(merged);
    await this.storesValid(String(existing.brandId), merged.storeIds.map(String));
    if (merged.totalQuantity < existing.soldQuantity + existing.reservedQuantity)
      throw new BadRequestException('Số lượng phát hành thấp hơn số đã bán và giữ chỗ.');
    // Include version + counters in CAS so editing cannot overwrite a concurrent stock change.
    const updated = await this.db.campaigns.findOneAndUpdate(
      {
        _id: id,
        __v: existing.__v,
        soldQuantity: existing.soldQuantity,
        reservedQuantity: existing.reservedQuantity,
      },
      {
        $set: {
          ...dto,
          status: existing.status === CampaignStatus.DRAFT ? CampaignStatus.DRAFT : CampaignStatus.PENDING,
        },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new BadRequestException('Chiến dịch vừa thay đổi. Vui lòng tải lại.');
    return updated;
  }
  async transition(
    id: string,
    user: Principal,
    action: 'submit' | 'withdraw' | 'approve' | 'reject' | 'pause' | 'resume',
    reason?: string,
  ) {
    const c = await this.campaignAccess(id, user);
    const allowed: Record<typeof action, CampaignStatus[]> = {
      submit: [CampaignStatus.DRAFT],
      withdraw: [CampaignStatus.PENDING],
      approve: [CampaignStatus.PENDING],
      reject: [CampaignStatus.PENDING],
      pause: [CampaignStatus.APPROVED, CampaignStatus.PUBLISHED],
      resume: [CampaignStatus.PAUSED],
    };
    if (!allowed[action].includes(c.status))
      throw new BadRequestException('Trạng thái chiến dịch không phù hợp.');
    if (['submit', 'approve', 'resume'].includes(action)) {
      validateCampaign(c);
      if (c.saleEndAt <= new Date()) throw new BadRequestException('Đã hết thời gian bán.');
      if (!(await this.db.brands.exists({ _id: c.brandId, status: 'APPROVED' })))
        throw new BadRequestException('Thương hiệu chưa được duyệt hoặc bị đình chỉ.');
      await this.storesValid(String(c.brandId), c.storeIds.map(String));
    }
    const next =
      action === 'submit'
        ? CampaignStatus.PENDING
        : action === 'withdraw' || action === 'reject'
          ? CampaignStatus.DRAFT
          : action === 'pause'
            ? CampaignStatus.PAUSED
            : c.saleStartAt > new Date()
              ? CampaignStatus.APPROVED
              : CampaignStatus.PUBLISHED;
    const updated = await this.db.campaigns.findOneAndUpdate(
      { _id: id, status: c.status, __v: c.__v },
      {
        $set: {
          status: next,
          ...(action === 'approve' ? { approvedBy: user.userId } : {}),
          ...(action === 'reject' ? { rejectReason: reason } : {}),
        },
        $inc: { __v: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw new BadRequestException('Chiến dịch vừa thay đổi. Vui lòng tải lại.');
    await this.db.audits.create({
      actorId: user.userId,
      action: 'CAMPAIGN_' + action.toUpperCase(),
      resourceId: id,
      detail: reason,
    });
    return updated;
  }
  private async visibleFilter() {
    const brands = await this.db.brands.find({ status: 'APPROVED' }).distinct('_id');
    return {
      brandId: { $in: brands },
      status: { $in: [CampaignStatus.APPROVED, CampaignStatus.PUBLISHED] },
      saleStartAt: { $lte: new Date() },
      saleEndAt: { $gt: new Date() },
    };
  }
  async search(dto: SearchDto) {
    const hasLocation = dto.latitude !== undefined && dto.longitude !== undefined;
    if (
      (dto.latitude !== undefined || dto.longitude !== undefined || dto.radiusKm !== undefined) &&
      !hasLocation
    )
      throw new BadRequestException('Cần cả latitude và longitude để lọc khoảng cách.');
    const filter: Record<string, unknown> = await this.visibleFilter();
    if (dto.brandId) filter.$and = [{ brandId: dto.brandId }];
    if (dto.category) filter.category = dto.category;
    if (dto.q?.trim())
      filter.title = { $regex: dto.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    let distances = new Map<string, number>();
    if (hasLocation) {
      const nearby = await this.db.stores.aggregate<{ _id: Types.ObjectId; distanceMeters: number }>([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [dto.longitude!, dto.latitude!] },
            distanceField: 'distanceMeters',
            spherical: true,
            maxDistance: (dto.radiusKm ?? 10) * 1000,
            query: { active: true },
          },
        },
      ]);
      distances = new Map(nearby.map((s) => [String(s._id), s.distanceMeters / 1000]));
      filter.storeIds = { $in: nearby.map((s) => s._id) };
    } else {
      filter.storeIds = { $in: await this.db.stores.find({ active: true }).distinct('_id') };
    }
    const sort: Record<string, 1 | -1> =
      dto.sort === 'price'
        ? { salePrice: 1, _id: -1 }
        : dto.sort === 'best'
          ? { soldQuantity: -1, _id: -1 }
          : { createdAt: -1, _id: -1 };
    const total = await this.db.campaigns.countDocuments(filter);
    const campaigns = await this.db.campaigns
      .find(filter)
      .sort(sort)
      .skip((dto.page - 1) * dto.limit)
      .limit(dto.limit)
      .populate('brandId', 'name logo');
    return {
      items: campaigns.map((c) => ({
        ...c.toJSON(),
        remainingStock: c.totalQuantity - c.soldQuantity - c.reservedQuantity,
        ...(hasLocation
          ? { distanceKm: Math.min(...c.storeIds.map((s) => distances.get(String(s)) ?? Infinity)) }
          : {}),
      })),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }
  async detail(id: string) {
    const c = await this.db.campaigns
      .findOne({ _id: id, ...(await this.visibleFilter()) })
      .populate('brandId', 'name logo description');
    if (!c) throw new NotFoundException('Voucher không còn mở bán.');
    const stores = await this.db.stores.find({ _id: { $in: c.storeIds }, active: true });
    return { ...c.toJSON(), stores, remainingStock: c.totalQuantity - c.soldQuantity - c.reservedQuantity };
  }
}
