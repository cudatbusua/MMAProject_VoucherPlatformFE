import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { Types } from 'mongoose';
import { Principal } from '../auth/security';
import { digest, randomToken } from '../common/crypto';
import { Database } from '../database/database.module';
import { Voucher, VoucherType } from '../database/schemas';
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
    return { ...voucher.toJSON(), stores, redemption: await this.db.redemptions.findOne({ voucherId: id }) };
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
            { _id: voucherId, customerId, status: 'ACTIVE', expiresAt: { $gt: new Date() } },
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
  async redeem(user: Principal, dto: RedeemDto) {
    if (!!dto.qrPayload === !!dto.otpCode) throw new BadRequestException('Gửi đúng một mã QR hoặc OTP.');
    if (user.activeStoreId !== dto.storeId)
      throw new ForbiddenException('Vui lòng chọn đúng cửa hàng làm việc.');
    return this.db.connection.transaction(async (session) => {
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
      const token = await this.db.tokens.findOneAndUpdate(
        { ...lookup, used: false, expiresAt: { $gt: new Date() } },
        { $set: { used: true } },
        { session },
      );
      if (!token) throw new BadRequestException('Mã không hợp lệ, đã dùng hoặc hết hạn.');
      const voucher = await this.db.vouchers.findOneAndUpdate(
        { _id: token.voucherId, status: 'ACTIVE', storeIds: dto.storeId, expiresAt: { $gt: new Date() } },
        { $set: { status: 'USED', usedAt: new Date() } },
        { session, returnDocument: 'after' },
      );
      if (!voucher)
        throw new BadRequestException('Voucher đã dùng, không áp dụng tại cửa hàng hoặc không còn khả dụng.');
      let discountAmount: number;
      if (voucher.voucherType === VoucherType.DISCOUNT) {
        discountAmount =
          voucher.discountType === 'PERCENT'
            ? Math.min(Math.floor((dto.billAmount * voucher.discountValue!) / 100), voucher.maxDiscount!)
            : voucher.discountValue!;
      } else {
        discountAmount = voucher.faceValue;
      }
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
          },
        ],
        { session },
      );
      await this.db.audits.create(
        [{ actorId: user.userId, action: 'VOUCHER_REDEEMED', resourceId: voucher._id }],
        { session },
      );
      return {
        message: 'Sử dụng voucher thành công.',
        voucher,
        redemption,
        amountDue: dto.billAmount - discountAmount,
      };
    });
  }
  async requestRefund(customerId: string, dto: RefundDto) {
    return this.db.connection.transaction(async (session) => {
      const voucher = await this.db.vouchers
        .findOne({
          _id: dto.voucherItemId,
          customerId,
          status: 'ACTIVE',
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
          $set: { customerId, amount: voucher.salePrice, reason: dto.reason, status: 'REQUESTED' },
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
      if (!voucher) throw new BadRequestException('Trạng thái voucher không phù hợp.');
      voucher.status = approve ? 'REFUNDED' : voucher.expiresAt > new Date() ? 'ACTIVE' : 'EXPIRED';
      await voucher.save({ session });
      refund.status = approve ? 'COMPLETED' : 'REJECTED';
      refund.reference = reference;
      refund.reviewedBy = new Types.ObjectId(user.userId);
      await refund.save({ session });
      if (approve) {
        await this.db.campaigns.updateOne(
          { _id: voucher.campaignId, saleEndAt: { $gt: new Date() }, soldQuantity: { $gte: 1 } },
          { $inc: { soldQuantity: -1 } },
          { session },
        );
        await this.db.quotas.updateOne(
          { userId: voucher.customerId, campaignId: voucher.campaignId, purchased: { $gte: 1 } },
          { $inc: { purchased: -1 } },
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
