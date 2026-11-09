import type { BrandStatus, CampaignStatus, LicenseType, Order, Role, VoucherStatus, VoucherType } from '../types';

export const money = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v)) + 'đ';

export const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

export const shortId = (id?: string) => (id ? '…' + id.slice(-6) : '—');

/** ISO string → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
/** <input type="datetime-local"> value → ISO-8601 with timezone (UTC). */
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  BRAND_OWNER: 'Chủ thương hiệu',
  BRAND_MANAGER: 'Quản lý thương hiệu',
  STORE_STAFF: 'Nhân viên cửa hàng',
  CUSTOMER: 'Khách hàng',
};

export const typeLabel: Record<VoucherType, string> = {
  DISCOUNT: 'Giảm giá',
  PREPAID: 'Trả trước',
  COMBO: 'Combo',
};

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const campaignStatus: Record<CampaignStatus, [string, Tone]> = {
  DRAFT: ['Nháp', 'neutral'],
  PENDING: ['Chờ duyệt', 'warning'],
  APPROVED: ['Đã duyệt', 'info'],
  PUBLISHED: ['Đang bán', 'success'],
  PAUSED: ['Tạm dừng', 'warning'],
  ENDED: ['Kết thúc', 'neutral'],
};

export const brandStatus: Record<BrandStatus, [string, Tone]> = {
  DRAFT: ['Chờ nộp hồ sơ', 'neutral'],
  PENDING: ['Chờ duyệt', 'warning'],
  APPROVED: ['Đã duyệt', 'success'],
  REJECTED: ['Bị trả hồ sơ', 'danger'],
  SUSPENDED: ['Đình chỉ', 'danger'],
};

export function benefit(c: {
  voucherType: VoucherType;
  faceValue: number;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  comboItems?: string;
}) {
  if (c.voucherType === 'DISCOUNT')
    return c.discountType === 'PERCENT'
      ? 'Giảm ' + c.discountValue + '% (tối đa ' + money(c.maxDiscount ?? 0) + ')'
      : 'Giảm ' + money(c.discountValue ?? 0);
  if (c.voucherType === 'COMBO') return 'Combo: ' + (c.comboItems ?? '');
  return 'Mệnh giá ' + money(c.faceValue);
}

export const licenseLabel: Record<LicenseType, string> = {
  BUSINESS_LICENSE: 'Giấy phép kinh doanh',
  FOOD_SAFETY: 'Chứng nhận an toàn thực phẩm',
};

export const orderStatus: Record<Order['status'], [string, Tone]> = {
  PENDING: ['Chờ thanh toán', 'warning'],
  FULFILLED: ['Đã thanh toán', 'success'],
  CANCELLED: ['Đã hủy', 'neutral'],
};

export const voucherStatus: Record<VoucherStatus, [string, Tone]> = {
  ACTIVE: ['Còn hiệu lực', 'success'],
  USED: ['Đã dùng hết', 'neutral'],
  EXPIRED: ['Hết hạn', 'danger'],
  REFUND_PENDING: ['Đang chờ hoàn', 'warning'],
  REFUNDED: ['Đã hoàn tiền', 'info'],
};

/** Value for <input type="date"> from an ISO date. */
export const toDateInput = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export const fileSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB');
