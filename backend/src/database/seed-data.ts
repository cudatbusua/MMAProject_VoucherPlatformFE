import { Database } from './database.module';
import { CampaignStatus, Role, VoucherType } from './schemas';
import { hashPassword } from '../common/crypto';
import { DAY } from '../catalog/rules';

export async function seedData(db: Database, password: string) {
  const hash = await hashPassword(password);
  const admin = await db.users.findOneAndUpdate(
    { email: 'admin@voucher.local' },
    { $setOnInsert: { fullName: 'Quản trị viên', role: Role.ADMIN, active: true, passwordHash: hash } },
    { upsert: true, returnDocument: 'after' },
  );
  const owner = await db.users.findOneAndUpdate(
    { email: 'owner@voucher.local' },
    {
      $setOnInsert: { fullName: 'Chủ thương hiệu', role: Role.BRAND_OWNER, active: true, passwordHash: hash },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const brand = await db.brands.findOneAndUpdate(
    { ownerId: owner._id, name: 'Vouch Coffee — mẫu' },
    {
      $setOnInsert: {
        description: 'Thương hiệu mẫu để kiểm thử; không đại diện cửa hàng kinh doanh thật.',
        status: 'APPROVED',
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const store = await db.stores.findOneAndUpdate(
    { brandId: brand._id, name: 'Vouch Quận 1 — mẫu' },
    {
      $setOnInsert: {
        address: 'Điểm mẫu Quận 1, TP.HCM',
        active: true,
        location: { type: 'Point', coordinates: [106.7, 10.776] },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const secondStore = await db.stores.findOneAndUpdate(
    { brandId: brand._id, name: 'Vouch Bình Thạnh — mẫu' },
    {
      $setOnInsert: {
        address: 'Điểm mẫu Bình Thạnh, TP.HCM',
        active: true,
        location: { type: 'Point', coordinates: [106.72, 10.82] },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const staff = await db.users.findOneAndUpdate(
    { email: 'staff@voucher.local' },
    {
      $setOnInsert: {
        fullName: 'Nhân viên cửa hàng',
        role: Role.STORE_STAFF,
        active: true,
        passwordHash: hash,
        storeIds: [store._id, secondStore._id],
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const definitions = [
    { title: 'Voucher cà phê 50K', voucherType: VoucherType.PREPAID, salePrice: 30000, faceValue: 50000 },
    { title: 'Voucher đồ uống 70K', voucherType: VoucherType.PREPAID, salePrice: 45000, faceValue: 70000 },
    {
      title: 'Combo hai ly trà',
      voucherType: VoucherType.COMBO,
      salePrice: 50000,
      faceValue: 80000,
      comboItems: 'Hai ly trà size M',
    },
    {
      title: 'Combo cà phê và bánh',
      voucherType: VoucherType.COMBO,
      salePrice: 60000,
      faceValue: 90000,
      comboItems: 'Một cà phê và một bánh ngọt',
    },
    {
      title: 'Mã giảm 30% đồ uống',
      voucherType: VoucherType.DISCOUNT,
      salePrice: 30000,
      faceValue: 100000,
      discountType: 'PERCENT' as const,
      discountValue: 30,
      maxDiscount: 100000,
    },
    { title: 'Voucher đồ uống 120K', voucherType: VoucherType.PREPAID, salePrice: 80000, faceValue: 120000 },
    {
      title: 'Voucher nhóm bạn 150K',
      voucherType: VoucherType.PREPAID,
      salePrice: 100000,
      faceValue: 150000,
    },
  ];
  const campaigns = [];
  for (const item of definitions) {
    campaigns.push(
      await db.campaigns.findOneAndUpdate(
        { brandId: brand._id, title: item.title },
        {
          $setOnInsert: {
            ...item,
            category: 'FOOD_DRINK',
            description: 'Dữ liệu mẫu cho project voucher độc lập.',
            totalQuantity: 100,
            soldQuantity: 0,
            reservedQuantity: 0,
            limitPerUser: 5,
            saleStartAt: new Date(Date.now() - DAY),
            saleEndAt: new Date(Date.now() + 30 * DAY),
            voucherExpireAt: new Date(Date.now() + 45 * DAY),
            storeIds: [store._id, secondStore._id],
            status: CampaignStatus.PUBLISHED,
            approvedBy: admin._id,
          },
        },
        { upsert: true, returnDocument: 'after' },
      ),
    );
  }
  return { admin, owner, staff, brand, store, secondStore, campaigns };
}
