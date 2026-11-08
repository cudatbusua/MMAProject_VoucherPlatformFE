import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types, ClientSession } from 'mongoose';
import { Database } from '../database/database.module';
import { CampaignStatus } from '../database/schemas';
import { CreateOrderDto } from './orders.dto';

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      void this.maintenance().catch(() => this.logger.error('Maintenance failed; will retry.'));
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async maintenance() {
    if (this.busy) return;
    this.busy = true;
    try {
      const expired = await this.db.orders
        .find({ status: 'PENDING', expiresAt: { $lte: new Date() } })
        .limit(500);
      for (const order of expired) await this.cancel(String(order.customerId), String(order._id));
      await this.db.campaigns.updateMany(
        {
          status: CampaignStatus.APPROVED,
          saleStartAt: { $lte: new Date() },
          saleEndAt: { $gt: new Date() },
        },
        { $set: { status: CampaignStatus.PUBLISHED } },
      );
      await this.db.campaigns.updateMany(
        {
          status: { $in: [CampaignStatus.APPROVED, CampaignStatus.PUBLISHED, CampaignStatus.PAUSED] },
          saleEndAt: { $lte: new Date() },
        },
        { $set: { status: CampaignStatus.ENDED } },
      );
      await this.db.vouchers.updateMany(
        { status: 'ACTIVE', expiresAt: { $lte: new Date() } },
        { $set: { status: 'EXPIRED' } },
      );
    } finally {
      this.busy = false;
    }
  }
  async create(customerId: string, dto: CreateOrderDto) {
    // Quota row exists before the transaction so concurrent first purchases never lose the unique-key race.
    try {
      await this.db.quotas.updateOne(
        { userId: customerId, campaignId: dto.campaignId },
        { $setOnInsert: { reserved: 0, purchased: 0 } },
        { upsert: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const old = await this.db.orders.findOne({ customerId, idempotencyKey: dto.idempotencyKey });
    if (old) return this.assertSameCheckout(old, dto);
    try {
      return await this.db.connection.transaction(async (session) => {
        const replay = await this.db.orders
          .findOne({ customerId, idempotencyKey: dto.idempotencyKey })
          .session(session);
        if (replay) return this.assertSameCheckout(replay, dto);
        const c = await this.db.campaigns
          .findOne({
            _id: dto.campaignId,
            status: { $in: [CampaignStatus.APPROVED, CampaignStatus.PUBLISHED] },
            saleStartAt: { $lte: new Date() },
            saleEndAt: { $gt: new Date() },
          })
          .session(session);
        if (!c || !(await this.db.brands.exists({ _id: c.brandId, status: 'APPROVED' }).session(session)))
          throw new BadRequestException('Chiến dịch không mở bán.');
        if (!(await this.db.stores.exists({ _id: { $in: c.storeIds }, active: true }).session(session)))
          throw new BadRequestException('Không có cửa hàng đang áp dụng.');
        const stock = await this.db.campaigns.updateOne(
          {
            _id: c._id,
            $expr: {
              $gte: [
                { $subtract: ['$totalQuantity', { $add: ['$soldQuantity', '$reservedQuantity'] }] },
                dto.quantity,
              ],
            },
          },
          { $inc: { reservedQuantity: dto.quantity } },
          { session },
        );
        if (!stock.modifiedCount) throw new BadRequestException('Không đủ tồn kho.');
        const quota = await this.db.quotas.updateOne(
          {
            userId: customerId,
            campaignId: c._id,
            $expr: { $lte: [{ $add: ['$purchased', '$reserved', dto.quantity] }, c.limitPerUser] },
          },
          { $inc: { reserved: dto.quantity } },
          { session },
        );
        if (!quota.modifiedCount) throw new BadRequestException('Vượt giới hạn mua mỗi người.');
        const [order] = await this.db.orders.create(
          [
            {
              customerId,
              campaignId: c._id,
              quantity: dto.quantity,
              unitPrice: c.salePrice,
              totalAmount: c.salePrice * dto.quantity,
              expiresAt: new Date(Date.now() + 15 * 60000),
              idempotencyKey: dto.idempotencyKey,
              snapshot: {
                title: c.title,
                brandId: c.brandId,
                salePrice: c.salePrice,
                faceValue: c.faceValue,
                voucherType: c.voucherType,
                discountType: c.discountType,
                discountValue: c.discountValue,
                maxDiscount: c.maxDiscount,
                comboItems: c.comboItems,
                storeIds: c.storeIds,
                voucherExpireAt: c.voucherExpireAt,
              },
            },
          ],
          { session },
        );
        return order;
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const replay = await this.db.orders.findOne({ customerId, idempotencyKey: dto.idempotencyKey });
        if (replay) return this.assertSameCheckout(replay, dto);
      }
      throw error;
    }
  }
  private assertSameCheckout<T extends { campaignId: Types.ObjectId; quantity: number }>(
    order: T,
    dto: CreateOrderDto,
  ) {
    if (String(order.campaignId) !== dto.campaignId || order.quantity !== dto.quantity)
      throw new BadRequestException('Idempotency key đã được dùng cho đơn khác.');
    return order;
  }
  async find(customerId: string, id: string) {
    const order = await this.db.orders.findOne({ _id: id, customerId });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    if (order.status === 'PENDING' && order.expiresAt <= new Date()) return this.cancel(customerId, id);
    return order;
  }
  private async release(
    order: { campaignId: Types.ObjectId; customerId: Types.ObjectId; quantity: number },
    session: ClientSession,
  ) {
    await this.db.campaigns.updateOne(
      { _id: order.campaignId, reservedQuantity: { $gte: order.quantity } },
      { $inc: { reservedQuantity: -order.quantity } },
      { session },
    );
    await this.db.quotas.updateOne(
      { userId: order.customerId, campaignId: order.campaignId },
      { $inc: { reserved: -order.quantity } },
      { session },
    );
  }
  async cancel(customerId: string, id: string) {
    return this.db.connection.transaction(async (session) => {
      const order = await this.db.orders.findOne({ _id: id, customerId }).session(session);
      if (!order) throw new NotFoundException();
      if (order.status === 'CANCELLED') return order;
      if (order.status !== 'PENDING') throw new BadRequestException('Đơn đã thanh toán không thể hủy.');
      order.status = 'CANCELLED';
      await order.save({ session });
      await this.release(order, session);
      return order;
    });
  }
  async simulate(customerId: string, id: string, success: boolean) {
    if (
      this.config.get('PAYMENT_MODE') !== 'demo' ||
      this.config.get('DEMO_PAYMENT_ENABLED') !== 'true' ||
      this.config.get('NODE_ENV') === 'production'
    )
      throw new ForbiddenException('Thanh toán demo đã tắt.');
    if (!success) return this.cancel(customerId, id);
    const result = await this.db.connection.transaction(async (session) => {
      const order = await this.db.orders.findOne({ _id: id, customerId }).session(session);
      if (!order) throw new NotFoundException();
      if (order.status === 'FULFILLED') return { expired: false, order };
      if (order.status !== 'PENDING') throw new BadRequestException('Đơn đã hủy.');
      if (order.expiresAt <= new Date()) {
        order.status = 'CANCELLED';
        await order.save({ session });
        await this.release(order, session);
        return { expired: true, order };
      }
      // Fixed server-generated event and unique indexes make repeated confirmations idempotent.
      await this.db.payments.create(
        [
          {
            orderId: order._id,
            eventId: 'DEMO:' + order._id,
            amount: order.totalAmount,
            provider: 'DEMO',
            status: 'SUCCESS',
          },
        ],
        { session },
      );
      await this.db.vouchers.create(
        [
          {
            ...order.snapshot,
            customerId: order.customerId,
            campaignId: order.campaignId,
            orderId: order._id,
            itemIndex: 0,
            formatVersion: 2,
            usageLimit: order.quantity,
            usedCount: 0,
            remainingUses: order.quantity,
            totalPrice: order.totalAmount,
            expiresAt: order.snapshot.voucherExpireAt,
            status: 'ACTIVE',
          },
        ],
        { session, ordered: true },
      );
      await this.db.campaigns.updateOne(
        { _id: order.campaignId },
        { $inc: { reservedQuantity: -order.quantity, soldQuantity: order.quantity } },
        { session },
      );
      await this.db.quotas.updateOne(
        { userId: order.customerId, campaignId: order.campaignId },
        { $inc: { reserved: -order.quantity, purchased: order.quantity } },
        { session },
      );
      order.status = 'FULFILLED';
      await order.save({ session });
      return { expired: false, order };
    });
    if (result.expired) throw new BadRequestException('Đơn đã hết thời gian giữ chỗ.');
    return {
      mode: 'DEMO',
      message: 'Thanh toán giả lập thành công, không phát sinh giao dịch tiền thật.',
      order: result.order,
    };
  }
}
