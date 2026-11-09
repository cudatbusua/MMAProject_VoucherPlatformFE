import { BadRequestException } from '@nestjs/common';
import { VoucherType } from '../database/schemas';

export const DAY = 86400000;
/** Prices are whole thousands of VND so counter payments never involve odd change. */
export const PRICE_STEP = 1000;
/** Sale price may not go below 30% of the voucher value (max 70% off). */
export const MIN_SALE_RATIO = 0.3;
/** Employee discount is configured per campaign in this range. */
export const MAX_STAFF_DISCOUNT_PERCENT = 50;
/** Employee price may not go below 50% of the sale price. */
export const MIN_STAFF_PRICE_RATIO = 0.5;

export interface CampaignRules {
  voucherType: VoucherType;
  salePrice: number;
  faceValue: number;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  comboItems?: string;
  staffDiscountPercent?: number;
  saleStartAt: Date | string;
  saleEndAt: Date | string;
  voucherExpireAt: Date | string;
}

const money = (v: number) => v.toLocaleString('vi-VN') + 'đ';
const isPrice = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= PRICE_STEP && v % PRICE_STEP === 0;

/** Employee unit price: rounded down to a whole thousand. */
export function staffUnitPrice(salePrice: number, percent: number) {
  return Math.floor((salePrice * (100 - percent)) / 100 / PRICE_STEP) * PRICE_STEP;
}

export function validateCampaign(c: CampaignRules) {
  if (!isPrice(c.salePrice) || !isPrice(c.faceValue))
    throw new BadRequestException('Giá bán và giá trị voucher phải là bội số của 1.000đ, tối thiểu 1.000đ.');
  if (c.salePrice >= c.faceValue) throw new BadRequestException('Giá bán phải nhỏ hơn giá trị voucher.');
  if (c.salePrice * 10 < c.faceValue * MIN_SALE_RATIO * 10)
    throw new BadRequestException(
      'Giá bán tối thiểu bằng 30% giá trị voucher (giảm tối đa 70%): tối thiểu ' +
        money(Math.ceil((c.faceValue * MIN_SALE_RATIO) / PRICE_STEP) * PRICE_STEP) +
        '.',
    );
  if (c.voucherType === VoucherType.COMBO && !c.comboItems?.trim())
    throw new BadRequestException('Combo cần nội dung gói.');
  if (c.voucherType === VoucherType.DISCOUNT) {
    if (c.discountType !== 'AMOUNT' && c.discountType !== 'PERCENT')
      throw new BadRequestException('Cần kiểu giảm và giá trị giảm.');
    if (!Number.isSafeInteger(c.discountValue) || !c.discountValue || c.discountValue <= 0)
      throw new BadRequestException('Cần kiểu giảm và giá trị giảm.');
    if (c.discountType === 'AMOUNT' && c.discountValue !== c.faceValue)
      throw new BadRequestException('Giảm theo số tiền: giá trị voucher phải bằng đúng số tiền giảm.');
    if (c.discountType === 'PERCENT') {
      if (c.discountValue > 100 || !c.maxDiscount || c.maxDiscount <= 0)
        throw new BadRequestException('Phần trăm phải từ 1 đến 100 và có mức giảm tối đa.');
      if (c.maxDiscount !== c.faceValue)
        throw new BadRequestException('Giảm theo %: giá trị voucher phải bằng mức giảm tối đa.');
    }
  }
  const pct = c.staffDiscountPercent ?? 0;
  if (!Number.isInteger(pct) || pct < 0 || pct > MAX_STAFF_DISCOUNT_PERCENT)
    throw new BadRequestException('Ưu đãi nhân viên từ 0% đến ' + MAX_STAFF_DISCOUNT_PERCENT + '%.');
  if (pct > 0) {
    const staffPrice = staffUnitPrice(c.salePrice, pct);
    if (staffPrice < PRICE_STEP || staffPrice < c.salePrice * MIN_STAFF_PRICE_RATIO)
      throw new BadRequestException(
        'Giá nhân viên (' + money(staffPrice) + ') phải từ 1.000đ và không thấp hơn 50% giá bán.',
      );
  }
  const [start, end, expiry] = [c.saleStartAt, c.saleEndAt, c.voucherExpireAt].map((v) =>
    new Date(v).getTime(),
  );
  if (![start, end, expiry].every(Number.isFinite) || start >= end)
    throw new BadRequestException('Thời gian bán không hợp lệ.');
  if (expiry < end + 10 * DAY)
    throw new BadRequestException('Hạn sử dụng phải sau ngày kết thúc bán ít nhất 10 ngày.');
}

/** Once tickets are sold/reserved, buyers' benefits may not be reduced by an edit. */
export function assertBenefitsNotReduced(before: CampaignRules, after: CampaignRules) {
  const reduced =
    after.voucherType !== before.voucherType ||
    after.faceValue < before.faceValue ||
    (before.voucherType === VoucherType.DISCOUNT &&
      (after.discountType !== before.discountType ||
        (after.discountValue ?? 0) < (before.discountValue ?? 0) ||
        (after.maxDiscount ?? 0) < (before.maxDiscount ?? 0)));
  if (reduced)
    throw new BadRequestException(
      'Chiến dịch đã có vé bán/giữ chỗ: không được đổi loại hoặc giảm giá trị, quyền lợi. Hãy tạo chiến dịch mới.',
    );
}

export const LICENSE_TYPES = ['BUSINESS_LICENSE', 'FOOD_SAFETY'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];
export const LICENSE_LABEL: Record<LicenseType, string> = {
  BUSINESS_LICENSE: 'Giấy phép kinh doanh',
  FOOD_SAFETY: 'Chứng nhận an toàn thực phẩm',
};
/** Food-safety certificate must stay valid at least this long when submitting for review. */
export const FOOD_SAFETY_MIN_VALID_DAYS = 30;

interface LicenseLike {
  type: string;
  issuedAt: Date;
  expiresAt?: Date;
}
/** Returns the first problem with a brand's legal documents, or null when complete and valid. */
export function documentProblem(docs: LicenseLike[], minFoodSafetyDays: number): string | null {
  for (const type of LICENSE_TYPES) {
    const d = docs.find((x) => x.type === type);
    if (!d) return 'Thiếu ' + LICENSE_LABEL[type] + '.';
    if (new Date(d.issuedAt).getTime() > Date.now() + DAY)
      return LICENSE_LABEL[type] + ': ngày cấp không được ở tương lai.';
    if (d.expiresAt && new Date(d.expiresAt).getTime() <= Date.now())
      return LICENSE_LABEL[type] + ' đã hết hạn.';
  }
  const food = docs.find((x) => x.type === 'FOOD_SAFETY')!;
  if (!food.expiresAt) return 'Chứng nhận an toàn thực phẩm cần ngày hết hạn.';
  if (new Date(food.expiresAt).getTime() < Date.now() + minFoodSafetyDays * DAY)
    return 'Chứng nhận an toàn thực phẩm phải còn hạn ít nhất ' + minFoodSafetyDays + ' ngày.';
  return null;
}
