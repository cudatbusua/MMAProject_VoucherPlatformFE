import type { Campaign, Voucher, VoucherType } from '../types';

export function money(v: number) {
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

function pad(n: number) {
  return n < 10 ? '0' + n : String(n);
}

export function dateTime(iso: string) {
  const d = new Date(iso);
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ' + date(iso);
}

export function date(iso: string) {
  const d = new Date(iso);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

export const typeLabel: Record<VoucherType, string> = {
  DISCOUNT: 'Giảm giá',
  PREPAID: 'Trả trước',
  COMBO: 'Combo',
};

export function benefit(v: Pick<Campaign | Voucher, 'voucherType' | 'faceValue' | 'discountType' | 'discountValue' | 'maxDiscount' | 'comboItems'>) {
  if (v.voucherType === 'DISCOUNT') {
    if (v.discountType === 'PERCENT')
      return 'Giảm ' + v.discountValue + '% (tối đa ' + money(v.maxDiscount ?? 0) + ')';
    return 'Giảm ' + money(v.discountValue ?? 0);
  }
  if (v.voucherType === 'COMBO') return 'Combo: ' + (v.comboItems ?? '');
  return 'Mệnh giá ' + money(v.faceValue);
}

export function percentOff(salePrice: number, faceValue: number) {
  return Math.round((1 - salePrice / faceValue) * 100);
}
