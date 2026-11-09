import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Principal, Public, Roles } from '../auth/security';
import { ObjectIdPipe } from '../common/http';
import { Database } from '../database/database.module';
import { CampaignStatus, Role } from '../database/schemas';
import {
  CreateBrandDto,
  CampaignDto,
  DocumentDto,
  ReasonDto,
  SearchDto,
  StaffDto,
  StoreDto,
  UpdateCampaignDto,
  UpdateStoreDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';
import { DocumentsService, MAX_DOCUMENT_BYTES, UploadedFileLike } from './documents.service';
import { LicenseType } from './rules';

@ApiTags('Brands & stores')
@ApiBearerAuth()
@Controller('brands')
export class BrandController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly db: Database,
    private readonly documents: DocumentsService,
  ) {}
  @Roles(Role.ADMIN) @Post() create(@CurrentUser() user: Principal, @Body() dto: CreateBrandDto) {
    return this.catalog.createBrand(user, dto);
  }
  @Roles(Role.BRAND_OWNER, Role.BRAND_MANAGER) @Get('me') async mine(@CurrentUser() user: Principal) {
    if (user.role === Role.BRAND_OWNER) return this.db.brands.find({ ownerId: user.userId });
    const manager = await this.db.users.findById(user.userId);
    return this.db.brands.find({ _id: { $in: manager!.brandIds } });
  }
  @Roles(Role.BRAND_OWNER, Role.BRAND_MANAGER, Role.ADMIN) @Get(':id/reports/overview') async report(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    await this.catalog.brandAccess(id, user);
    const campaignIds = await this.db.campaigns.find({ brandId: id }).distinct('_id');
    const orderIds = await this.db.orders
      .find({ campaignId: { $in: campaignIds }, status: 'FULFILLED' })
      .distinct('_id');
    const gross = await this.db.payments.aggregate([
      { $match: { orderId: { $in: orderIds } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const voucherIds = await this.db.vouchers.find({ brandId: id }).distinct('_id');
    const refunds = await this.db.refunds.aggregate([
      { $match: { voucherId: { $in: voucherIds }, status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const tickets = await this.db.orders.aggregate([
      { $match: { _id: { $in: orderIds } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);
    return {
      brandId: id,
      campaigns: campaignIds.length,
      paidOrders: orderIds.length,
      ticketsSold: tickets[0]?.total ?? 0,
      staffOrders: await this.db.orders.countDocuments({
        _id: { $in: orderIds },
        employeeCode: { $exists: true },
      }),
      vouchersIssued: voucherIds.length,
      redemptions: await this.db.redemptions.countDocuments({ voucherId: { $in: voucherIds } }),
      grossRevenue: gross[0]?.total ?? 0,
      refundedAmount: refunds[0]?.total ?? 0,
      netRevenue: (gross[0]?.total ?? 0) - (refunds[0]?.total ?? 0),
      currency: 'VND',
    };
  }
  @Roles(Role.BRAND_OWNER)
  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'number', 'issuer', 'issuedAt'],
      properties: {
        type: { type: 'string', enum: ['BUSINESS_LICENSE', 'FOOD_SAFETY'] },
        number: { type: 'string' },
        issuer: { type: 'string' },
        issuedAt: { type: 'string', format: 'date' },
        expiresAt: { type: 'string', format: 'date' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  uploadDocument(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: DocumentDto,
    @UploadedFile() file?: UploadedFileLike,
  ) {
    return this.documents.upload(id, user, dto, file);
  }
  @Roles(Role.BRAND_OWNER) @Patch(':id/submit') submitBrand(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.documents.submit(id, user);
  }
  @Roles(Role.ADMIN, Role.BRAND_OWNER, Role.BRAND_MANAGER)
  @Get(':id/documents/:type/file')
  async documentFile(
    @Param('id', ObjectIdPipe) id: string,
    @Param('type', new ParseEnumPipe(['BUSINESS_LICENSE', 'FOOD_SAFETY'])) type: LicenseType,
    @CurrentUser() user: Principal,
    @Res() res: Response,
  ) {
    const f = await this.documents.file(id, type, user);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', "inline; filename*=UTF-8''" + encodeURIComponent(f.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(f.buffer);
  }
  @Roles(Role.ADMIN) @Get() all() {
    return this.db.brands.find().sort({ createdAt: -1 }).limit(100);
  }
  @Roles(Role.ADMIN) @Patch(':id/approve') approve(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.brandState(id, user, 'approve');
  }
  @Roles(Role.ADMIN) @Patch(':id/reject') reject(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: ReasonDto,
  ) {
    return this.catalog.brandState(id, user, 'reject', dto.reason);
  }
  @Roles(Role.ADMIN) @Patch(':id/suspend') suspend(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: ReasonDto,
  ) {
    return this.catalog.brandState(id, user, 'suspend', dto.reason);
  }
  @Roles(Role.ADMIN) @Patch(':id/reinstate') reinstate(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.brandState(id, user, 'reinstate');
  }
  @Roles(Role.BRAND_MANAGER) @Post(':id/stores') store(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: StoreDto,
  ) {
    return this.catalog.createStore(id, user, dto);
  }
  @Roles(Role.BRAND_MANAGER, Role.ADMIN) @Get(':id/stores') async stores(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    await this.catalog.brandAccess(id, user);
    return this.db.stores.find({ brandId: id });
  }
  @Roles(Role.BRAND_MANAGER) @Patch('stores/:id') updateStore(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.catalog.updateStore(id, user, dto);
  }
  @Roles(Role.BRAND_MANAGER) @Post(':id/staff') staff(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: StaffDto,
  ) {
    return this.catalog.createStaff(id, user, dto);
  }
  @Roles(Role.BRAND_MANAGER) @Get(':id/staff') async staffList(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    await this.catalog.brandAccess(id, user);
    const ids = await this.db.stores.find({ brandId: id }).distinct('_id');
    return this.db.users.find({ role: Role.STORE_STAFF, storeIds: { $in: ids } });
  }
}
@ApiTags('Campaign management')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly db: Database,
  ) {}
  @Roles(Role.BRAND_MANAGER) @Post('brand/:brandId') create(
    @Param('brandId', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: CampaignDto,
  ) {
    return this.catalog.createCampaign(id, user, dto);
  }
  @Roles(Role.BRAND_MANAGER, Role.ADMIN) @Get('brand/:brandId') async mine(
    @Param('brandId', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    await this.catalog.brandAccess(id, user);
    return this.db.campaigns.find({ brandId: id }).sort({ createdAt: -1 }).limit(100);
  }
  @Roles(Role.ADMIN) @Get('pending') pending() {
    return this.db.campaigns.find({ status: CampaignStatus.PENDING }).limit(100);
  }
  @Roles(Role.BRAND_MANAGER) @Patch(':id') update(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.catalog.updateCampaign(id, user, dto);
  }
  @Roles(Role.BRAND_MANAGER) @Patch(':id/submit') submit(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.transition(id, user, 'submit');
  }
  @Roles(Role.BRAND_MANAGER) @Patch(':id/withdraw') withdraw(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.transition(id, user, 'withdraw');
  }
  @Roles(Role.BRAND_MANAGER) @Patch(':id/pause') pause(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.transition(id, user, 'pause');
  }
  @Roles(Role.BRAND_MANAGER) @Patch(':id/resume') resume(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.transition(id, user, 'resume');
  }
  @Roles(Role.ADMIN) @Patch(':id/approve') approve(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    return this.catalog.transition(id, user, 'approve');
  }
  @Roles(Role.ADMIN) @Patch(':id/reject') reject(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: ReasonDto,
  ) {
    return this.catalog.transition(id, user, 'reject', dto.reason);
  }
  @Roles(Role.BRAND_OWNER, Role.BRAND_MANAGER, Role.ADMIN) @Get(':id/stock') async stock(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
  ) {
    const c = await this.catalog.campaignAccess(id, user);
    return {
      total: c.totalQuantity,
      sold: c.soldQuantity,
      reserved: c.reservedQuantity,
      available: c.totalQuantity - c.soldQuantity - c.reservedQuantity,
    };
  }
}
@ApiTags('Public catalog')
@Controller()
export class SearchController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly db: Database,
  ) {}
  @Public() @Get('categories') async categories() {
    return this.db.campaigns.distinct('category', {
      status: { $in: [CampaignStatus.APPROVED, CampaignStatus.PUBLISHED] },
    });
  }
  @Public() @Get('vouchers') search(@Query() dto: SearchDto) {
    return this.catalog.search(dto);
  }
  @Public() @Get('vouchers/:id') detail(@Param('id', ObjectIdPipe) id: string) {
    return this.catalog.detail(id);
  }
}
