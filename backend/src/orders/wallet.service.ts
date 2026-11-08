import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { HydratedDocument, Types } from 'mongoose';
import { Principal } from '../auth/security';
import { digest, randomToken } from '../common/crypto';
import { Database } from '../database/database.module';
import { Redemption, Voucher, VoucherType } from '../database/schemas';
import { DAY } from '../catalog/rules';
import { RedeemDto, RefundDto } from './orders.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly db: Database,
    private readonly config: ConfigService,
  ) {}
  private hash(value: string) {
    return digest('redeem:' + value, this.config.getOrThrow('OTP_SECRET'));
  }
  async list(customerId: string, status?: string) {
    if (status && !['ACTIVE', 'USED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED'].includes(status))
      throw new BadRequestException('Trạng thái không hợp lệ.');
    await this.db.vouchers.updateMany(
      { customerId, status: 'ACTIVE', expiresAt: { $lte: new Date() } },
      { $set: { status: 'EXPIRED' } },
    );
    return this.db.vouchers
      .find({ customerId, ...(status ? { status: status as Voucher['status'] } : {}) })
      .sort({ createdAt: -1 })
      .limit(200);
  }
  async detail(customerId: string, id: string) {
    const voucher = await this.db.vouchers.findOne({ _id: id, customerId });
    if (!voucher) throw new NotFoundException();
    if (voucher.status === 'ACTIVE' && voucher.expiresAt <= new Date()) {
      voucher.status = 'EXPIRED';
      await voucher.save();
    }
    const stores = await this.db.stores.find({ _id: { $in: voucher.storeIds }, active: true });
    return {
      ...voucher.toJSON(),
      stores,
      redemptions: await this.db.redemptions.find({ voucherId: id }).sort({ sequence: 1 }),
    };
  }
  async token(customerId: string, voucherId: string) {
    // Serializes with refund and redeem via a write to the voucher document.
    for (let attempt = 0; attempt < 5; attempt++) {
      const qrPayload = randomToken();
      const otpCode = randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 60000);
      try {
        await this.db.connection.transaction(async (session) => {
          const voucher = await this.db.vouchers.findOneAndUpdate(
            {
              _id: voucherId,
              customerId,
              status: 'ACTIVE',
              remainingUses: { $gt: 0 },
              expiresAt: { $gt: new Date() },
            },
            { $inc: { __v: 1 } },
            { session },
          );
          if (!voucher) throw new BadRequestException('Voucher không còn khả dụng.');
          await this.db.tokens.findOneAndUpdate(
            { voucherId },
            {
              $set: {
                customerId,
                tokenHash: this.hash(qrPayload),
                otpHash: this.hash(otpCode),
                expiresAt,
                used: false,
              },
            },
            { upsert: true, session },
          );
        });
        return { qrPayload, otpCode, expiresAt, ttlSeconds: 60 };
      } catch (error) {
        if ((error as { code?: number }).code !== 11000 || attempt === 4) throw error;
      }
    }
    throw new BadRequestException('Không tạo được mã. Vui lòng thử lại.');
  }
  private async redeemResult(log: HydratedDocument<Redemption>, requestHash: string, replayed: boolean) {
    if (log.requestHash !== requestHash)
      throw new BadRequestException('Idempotency key đã dùng cho lượt xác nhận khác.');
    const voucher = await this.db.vouchers.findById(log.voucherId);
    return {
      message: 'Sử dụng một lượt thành công.',
      voucher,
      redemption: log,
      remainingUses: log.remainingAfter,
      replayed,
      amountDue: log.billAmount - log.discountAmount,
    };
  }
  async redeem(user: Principal, dto: RedeemDto) {
    if (!!dto.qrPayload === !!dto.otpCode) throw new BadRequestException('Gửi đúng một mã QR hoặc OTP.');
    if (user.activeStoreId !== dto.storeId)
      throw new ForbiddenException('Vui lòng chọn đúng cửa hàng làm việc.');
    const requestHash = this.hash(
      JSON.stringify([dto.storeId, dto.billAmount, dto.qrPayload ?? null, dto.otpCode ?? null]),
    );
    const replay = await this.db.redemptions
      .findOne({ staffId: user.userId, idempotencyKey: dto.idempotencyKey })
      .select('+requestHash');
    if (replay) return this.redeemResult(replay, requestHash, true);
    try {
      const log = await this.db.connection.transaction(async (session) => {
        const previous = await this.db.redemptions
          .findOne({ staffId: user.userId, idempotencyKey: dto.idempotencyKey })
          .select('+requestHash')
          .session(session);
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new BadRequestException('Idempotency key đã dùng cho lượt khác.');
          return previous;
        }
        const staff = await this.db.users
          .exists({ _id: user.userId, active: true, storeIds: dto.storeId })
          .session(session);
        const store = await this.db.stores.findOne({ _id: dto.storeId, active: true }).session(session);
        if (
          !staff ||
          !store ||
          !(await this.db.brands.exists({ _id: store.brandId, status: 'APPROVED' }).session(session))
        )
          throw new ForbiddenException('Không có quyền tại cửa hàng này.');
        const lookup = dto.qrPayload
          ? { tokenHash: this.hash(dto.qrPayload) }
          : { otpHash: this.hash(dto.otpCode!) };
        const token = await this.db.tokens
          .findOne({ ...lookup, used: false, expiresAt: { $gt: new Date() } })
          .session(session);
        if (!token) throw new BadRequestException('Mã không hợp lệ hoặc hết hạn.');
        const original = await this.db.vouchers.findById(token.voucherId).session(session);
        if (original && String(original.customerId) === user.userId)
          throw new ForbiddenException(
            'Không được tự xác nhận voucher của mình. Nhờ nhân viên khác thực hiện.',
          );
        const voucher = await this.db.vouchers.findOneAndUpdate(
          {
            _id: token.voucherId,
            status: 'ACTIVE',
            storeIds: dto.storeId,
            remainingUses: { $gt: 0 },
            expiresAt: { $gt: new Date() },
            $expr: { $lt: ['$usedCount', '$usageLimit'] },
          },
          { $inc: { usedCount: 1, remainingUses: -1 }, $set: { usedAt: new Date() } },
          { session, returnDocument: 'after' },
        );
        if (!voucher)
          throw new BadRequestException(
            'Voucher hết lượt, không áp dụng tại cửa hàng hoặc không còn khả dụng.',
          );
        if (voucher.remainingUses === 0) {
          voucher.status = 'USED';
          await voucher.save({ session });
          await this.db.tokens.updateOne({ _id: token._id }, { $set: { used: true } }, { session });
        }
        let discountAmount =
          voucher.voucherType === VoucherType.DISCOUNT
            ? voucher.discountType === 'PERCENT'
              ? Math.min(Math.floor((dto.billAmount * voucher.discountValue!) / 100), voucher.maxDiscount!)
              : voucher.discountValue!
            : voucher.faceValue;
        discountAmount = Math.min(dto.billAmount, discountAmount);
        const [redemption] = await this.db.redemptions.create(
          [
            {
              voucherId: voucher._id,
              staffId: user.userId,
              storeId: dto.storeId,
              billAmount: dto.billAmount,
              discountAmount,
              method: dto.qrPayload ? 'QR' : 'OTP',
              sequence: voucher.usedCount,
              remainingAfter: voucher.remainingUses,
              idempotencyKey: dto.idempotencyKey,
              requestHash,
            },
          ],
          { session },
        );
        await this.db.audits.create(
          [
            {
              actorId: user.userId,
              action: 'VOUCHER_USE_CONSUMED',
              resourceId: voucher._id,
              detail: 'Lượt ' + voucher.usedCount + '/' + voucher.usageLimit,
            },
          ],
          { session },
        );
        return redemption;
      });
      return this.redeemResult(log, requestHash, false);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const existing = await this.db.redemptions
          .findOne({ staffId: user.userId, idempotencyKey: dto.idempotencyKey })
          .select('+requestHash');
        if (existing) return this.redeemResult(existing, requestHash, true);
      }
      throw error;
    }
  }
  async requestRefund(customerId: string, dto: RefundDto) {
    return this.db.connection.transaction(async (session) => {
      const voucher = await this.db.vouchers
        .findOne({
          _id: dto.voucherItemId,
          customerId,
          status: 'ACTIVE',
          usedCount: 0,
          createdAt: { $gte: new Date(Date.now() - 7 * DAY) },
          expiresAt: { $gte: new Date(Date.now() + 3 * DAY) },
        })
        .session(session);
      if (!voucher)
        throw new BadRequestException(
          'Chỉ hoàn voucher chưa dùng, trong 7 ngày từ khi thanh toán và còn ít nhất 3 ngày sử dụng.',
        );
      voucher.status = 'REFUND_PENDING';
      await voucher.save({ session });
      await this.db.tokens.deleteOne({ voucherId: voucher._id }, { session });
      // Rejected requests may be retried while still eligible; there is always only one request per voucher.
      const refund = await this.db.refunds.findOneAndUpdate(
        { voucherId: voucher._id },
        {
          $set: { customerId, amount: voucher.totalPrice, reason: dto.reason, status: 'REQUESTED' },
          $unset: { reviewedBy: 1, reference: 1 },
        },
        { upsert: true, session, returnDocument: 'after' },
      );
      return refund;
    });
  }
  async reviewRefund(id: string, user: Principal, approve: boolean, reference: string) {
    return this.db.connection.transaction(async (session) => {
      const refund = await this.db.refunds.findOne({ _id: id, status: 'REQUESTED' }).session(session);
      if (!refund) throw new BadRequestException('Yêu cầu đã xử lý hoặc không tồn tại.');
      const voucher = await this.db.vouchers
        .findOne({ _id: refund.voucherId, status: 'REFUND_PENDING' })
        .session(session);
      if (!voucher || voucher.usedCount !== 0)
        throw new BadRequestException('Trạng thái voucher không phù hợp.');
      voucher.status = approve ? 'REFUNDED' : voucher.expiresAt > new Date() ? 'ACTIVE' : 'EXPIRED';
      if (approve) voucher.remainingUses = 0;
      await voucher.save({ session });
      refund.status = approve ? 'COMPLETED' : 'REJECTED';
      refund.reference = reference;
      refund.reviewedBy = new Types.ObjectId(user.userId);
      await refund.save({ session });
      if (approve) {
        await this.db.campaigns.updateOne(
          {
            _id: voucher.campaignId,
            saleEndAt: { $gt: new Date() },
            soldQuantity: { $gte: voucher.usageLimit },
          },
          { $inc: { soldQuantity: -voucher.usageLimit } },
          { session },
        );
        await this.db.quotas.updateOne(
          {
            userId: voucher.customerId,
            campaignId: voucher.campaignId,
            purchased: { $gte: voucher.usageLimit },
          },
          { $inc: { purchased: -voucher.usageLimit } },
          { session },
        );
      }
      await this.db.audits.create(
        [
          {
            actorId: user.userId,
            action: approve ? 'REFUND_COMPLETED' : 'REFUND_REJECTED',
            resourceId: id,
            detail: reference,
          },
        ],
        { session },
      );
      return {
        refund,
        message: approve
          ? 'Đã xác nhận hoàn tiền thủ công/demo; API không chuyển tiền.'
          : 'Đã từ chối hoàn tiền.',
      };
    });
  }
}
