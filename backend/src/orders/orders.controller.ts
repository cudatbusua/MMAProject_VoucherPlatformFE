import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Principal, Roles } from '../auth/security';
import { ReasonDto } from '../catalog/catalog.dto';
import { ObjectIdPipe } from '../common/http';
import { Database } from '../database/database.module';
import { Role } from '../database/schemas';
import {
  ConfirmRefundDto,
  CreateOrderDto,
  DemoPaymentDto,
  RedeemDto,
  RefundDto,
  TokenDto,
} from './orders.dto';
import { OrdersService } from './orders.service';
import { WalletService } from './wallet.service';

@ApiTags('Orders — demo payment')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly db: Database,
  ) {}
  @Post() create(@CurrentUser() user: Principal, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.userId, dto);
  }
  @Get('me') async mine(@CurrentUser() user: Principal) {
    await this.orders.maintenance();
    return this.db.orders.find({ customerId: user.userId }).sort({ createdAt: -1 }).limit(200);
  }
  @Get(':id') detail(@CurrentUser() user: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.orders.find(user.userId, id);
  }
  @Post(':id/cancel') cancel(@CurrentUser() user: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.orders.cancel(user.userId, id);
  }
  @Post(':id/pay') async pay(@CurrentUser() user: Principal, @Param('id', ObjectIdPipe) id: string) {
    const order = await this.orders.find(user.userId, id);
    return {
      order,
      mode: 'DEMO',
      message: 'Dùng simulate-payment để xác nhận thanh toán demo. Không có QR chuyển tiền thật.',
    };
  }
  @Post(':id/simulate-payment') simulate(
    @CurrentUser() user: Principal,
    @Param('id', ObjectIdPipe) id: string,
    @Body() dto: DemoPaymentDto,
  ) {
    return this.orders.simulate(user.userId, id, dto.success !== false);
  }
}
@ApiTags('Wallet')
@ApiBearerAuth()
@Roles(Role.CUSTOMER)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'USED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED'],
  })
  @Get()
  list(@CurrentUser() user: Principal, @Query('status') status?: string) {
    return this.wallet.list(user.userId, status);
  }
  @Get(':id') detail(@CurrentUser() user: Principal, @Param('id', ObjectIdPipe) id: string) {
    return this.wallet.detail(user.userId, id);
  }
}
@ApiTags('Redeem QR / OTP')
@ApiBearerAuth()
@Controller('redeem')
export class RedeemController {
  constructor(
    private readonly wallet: WalletService,
    private readonly db: Database,
  ) {}
  @Roles(Role.CUSTOMER) @Throttle({ default: { limit: 10, ttl: 600000 } }) @Post('token') token(
    @CurrentUser() user: Principal,
    @Body() dto: TokenDto,
  ) {
    return this.wallet.token(user.userId, dto.voucherItemId);
  }
  @Roles(Role.STORE_STAFF) @Throttle({ default: { limit: 10, ttl: 60000 } }) @Post() redeem(
    @CurrentUser() user: Principal,
    @Body() dto: RedeemDto,
  ) {
    return this.wallet.redeem(user, dto);
  }
  @Roles(Role.STORE_STAFF) @Get('my-stores') async stores(@CurrentUser() user: Principal) {
    const staff = await this.db.users.findById(user.userId);
    return this.db.stores.find({ _id: { $in: staff!.storeIds }, active: true });
  }
  @Roles(Role.STORE_STAFF) @Get('history/today') history(@CurrentUser() user: Principal) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 3600000);
    if (now.getTime() - start.getTime() >= 86400000) start.setUTCDate(start.getUTCDate() + 1);
    return this.db.redemptions
      .find({ staffId: user.userId, createdAt: { $gte: start } })
      .sort({ createdAt: -1 })
      .limit(200);
  }
}
@ApiTags('Refunds — manual / demo')
@ApiBearerAuth()
@Controller('refunds')
export class RefundController {
  constructor(
    private readonly wallet: WalletService,
    private readonly db: Database,
  ) {}
  @Roles(Role.CUSTOMER) @Post() request(@CurrentUser() user: Principal, @Body() dto: RefundDto) {
    return this.wallet.requestRefund(user.userId, dto);
  }
  @Roles(Role.CUSTOMER) @Get('me') mine(@CurrentUser() user: Principal) {
    return this.db.refunds.find({ customerId: user.userId }).sort({ createdAt: -1 }).limit(200);
  }
  @Roles(Role.ADMIN) @Get('manual-pending') pending() {
    return this.db.refunds.find({ status: 'REQUESTED' }).limit(200);
  }
  @Roles(Role.ADMIN) @Patch(':id/confirm-manual') confirm(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: ConfirmRefundDto,
  ) {
    return this.wallet.reviewRefund(id, user, true, dto.reference);
  }
  @Roles(Role.ADMIN) @Patch(':id/reject') reject(
    @Param('id', ObjectIdPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() dto: ReasonDto,
  ) {
    return this.wallet.reviewRefund(id, user, false, dto.reason);
  }
}
@ApiTags('Admin reports')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class ReportsController {
  constructor(private readonly db: Database) {}
  @Get('orders') orders() {
    return this.db.orders.find().sort({ createdAt: -1 }).limit(200);
  }
  @Get('redemptions') redemptions() {
    return this.db.redemptions.find().sort({ createdAt: -1 }).limit(200);
  }
  @Get('audit-logs') audits() {
    return this.db.audits.find().sort({ createdAt: -1 }).limit(200);
  }
  @Get('reports/overview') async overview() {
    const revenue = await this.db.payments.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]);
    const refunds = await this.db.refunds.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return {
      users: await this.db.users.countDocuments(),
      orders: await this.db.orders.countDocuments(),
      vouchers: await this.db.vouchers.countDocuments(),
      redeemed: await this.db.redemptions.countDocuments(),
      grossRevenue: revenue[0]?.total ?? 0,
      refundedAmount: refunds[0]?.total ?? 0,
      netRevenue: (revenue[0]?.total ?? 0) - (refunds[0]?.total ?? 0),
      currency: 'VND',
      paymentMode: 'DEMO',
    };
  }
}
