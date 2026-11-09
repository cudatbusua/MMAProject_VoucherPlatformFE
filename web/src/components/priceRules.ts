// Mirrors backend/src/catalog/rules.ts so the form explains errors before the request is sent.
// The backend remains the source of truth and re-validates everything.
import type { BrandDocument, VoucherType } from '../types';
import { money } from './format';

export const PRICE_STEP = 1000;
export const MAX_OFF_PERCENT = 70;
export const MAX_STAFF_DISCOUNT_PERCENT = 50;
export const FOOD_SAFETY_MIN_DAYS = 30;
const DAY = 86400000;

export const staffUnitPrice = (salePrice: number, percent: number) =>
  Math.floor((salePrice * (100 - percent)) / 100 / PRICE_STEP) * PRICE_STEP;

export const minSalePrice = (faceValue: number) => Math.ceil((faceValue * 0.3) / PRICE_STEP) * PRICE_STEP;

const isPrice = (v: number) => Number.isSafeInteger(v) && v >= PRICE_STEP && v % PRICE_STEP === 0;

export interface PriceInput {
  voucherType: VoucherType;
  salePrice: number;
  faceValue: number;
  discountType?: 'AMOUNT' | 'PERCENT';
  discountValue?: number;
  maxDiscount?: number;
  staffDiscountPercent: number;
}

/** Field → message for every violated price rule. */
export function priceErrors(p: PriceInput): Partial<Record<keyof PriceInput, string>> {
  const e: Partial<Record<keyof PriceInput, string>> = {};
  if (!isPrice(p.salePrice)) e.salePrice = 'Bội số của 1.000đ, tối thiểu 1.000đ.';
  if (!isPrice(p.faceValue)) e.faceValue = 'Bội số của 1.000đ, tối thiểu 1.000đ.';
  if (!e.salePrice && !e.faceValue) {
    if (p.salePrice >= p.faceValue) e.salePrice = 'Phải nhỏ hơn giá trị voucher.';
    else if (p.salePrice < p.faceValue * 0.3)
      e.salePrice = 'Giảm tối đa 70%: giá bán tối thiểu ' + money(minSalePrice(p.faceValue)) + '.';
  }
  if (p.voucherType === 'DISCOUNT') {
    if (!p.discountValue || p.discountValue < 1) e.discountValue = 'Nhập giá trị giảm.';
    else if (p.discountType === 'PERCENT' && p.discountValue > 100) e.discountValue = 'Từ 1 đến 100%.';
    if (p.discountType === 'PERCENT' && (!p.maxDiscount || !isPrice(p.maxDiscount)))
      e.maxDiscount = 'Bội số của 1.000đ, tối thiểu 1.000đ.';
  }
  const pct = p.staffDiscountPercent;
  if (!Number.isInteger(pct) || pct < 0 || pct > MAX_STAFF_DISCOUNT_PERCENT)
    e.staffDiscountPercent = 'Từ 0 đến ' + MAX_STAFF_DISCOUNT_PERCENT + '%.';
  else if (pct > 0 && !e.salePrice) {
    const sp = staffUnitPrice(p.salePrice, pct);
    if (sp < PRICE_STEP || sp < p.salePrice * 0.5)
      e.staffDiscountPercent = 'Giá nhân viên ' + money(sp) + ' thấp hơn 50% giá bán.';
  }
  return e;
}

/** Same check as backend documentProblem(); minDays = 30 when submitting, 0 when approving. */
export function documentProblem(docs: BrandDocument[], minDays: number): string | null {
  for (const type of ['BUSINESS_LICENSE', 'FOOD_SAFETY'] as const) {
    const label = type === 'FOOD_SAFETY' ? 'Chứng nhận an toàn thực phẩm' : 'Giấy phép kinh doanh';
    const d = docs.find((x) => x.type === type);
    if (!d) return 'Thiếu ' + label + '.';
    if (d.expiresAt && new Date(d.expiresAt).getTime() <= Date.now()) return label + ' đã hết hạn.';
  }
  const food = docs.find((x) => x.type === 'FOOD_SAFETY')!;
  if (!food.expiresAt) return 'Chứng nhận an toàn thực phẩm cần ngày hết hạn.';
  if (new Date(food.expiresAt).getTime() < Date.now() + minDays * DAY)
    return 'Chứng nhận an toàn thực phẩm phải còn hạn ít nhất ' + minDays + ' ngày.';
  return null;
}

export const daysUntil = (iso?: string) =>
  iso ? Math.floor((new Date(iso).getTime() - Date.now()) / DAY) : null;
