import { BadRequestException } from '@nestjs/common';
import { VoucherType } from '../database/schemas';

export const DAY = 86400000;
export interface CampaignRules {
  voucherType: VoucherType;
  salePrice: number;
  faceValue: number;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  comboItems?: string;
  saleStartAt: Date | string;
  saleEndAt: Date | string;
  voucherExpireAt: Date | string;
}
export function validateCampaign(c: CampaignRules) {
  if (
    !Number.isSafeInteger(c.salePrice) ||
    !Number.isSafeInteger(c.faceValue) ||
    c.salePrice <= 0 ||
    c.salePrice >= c.faceValue
  )
    throw new BadRequestException('Giá bán phải lớn hơn 0 và nhỏ hơn giá trị voucher.');
  if (c.voucherType === VoucherType.COMBO && !c.comboItems?.trim())
    throw new BadRequestException('Combo cần nội dung gói.');
  if (c.voucherType === VoucherType.DISCOUNT) {
    if (!c.discountType || !c.discountValue || c.discountValue <= 0)
      throw new BadRequestException('Cần kiểu giảm và giá trị giảm.');
    if (c.discountType === 'PERCENT' && (c.discountValue > 100 || !c.maxDiscount || c.maxDiscount <= 0))
      throw new BadRequestException('Phần trăm phải từ 1 đến 100 và có mức giảm tối đa.');
  }
  const [start, end, expiry] = [c.saleStartAt, c.saleEndAt, c.voucherExpireAt].map((v) =>
    new Date(v).getTime(),
  );
  if (![start, end, expiry].every(Number.isFinite) || start >= end)
    throw new BadRequestException('Thời gian bán không hợp lệ.');
  if (expiry < end + 10 * DAY)
    throw new BadRequestException('Hạn sử dụng phải sau ngày kết thúc bán ít nhất 10 ngày.');
}
