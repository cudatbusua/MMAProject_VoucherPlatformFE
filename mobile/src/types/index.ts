export type Role = 'ADMIN' | 'BRAND_OWNER' | 'BRAND_MANAGER' | 'STORE_STAFF' | 'CUSTOMER';
export type VoucherType = 'DISCOUNT' | 'PREPAID' | 'COMBO';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  storeIds: string[];
  brandIds: string[];
  createdAt: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface BrandRef {
  id: string;
  name: string;
  logo?: string;
  description?: string;
}

export interface Store {
  id: string;
  brandId: string;
  name: string;
  address: string;
  active: boolean;
  location: { type: 'Point'; coordinates: [number, number] };
}

export interface Campaign {
  id: string;
  brandId: string | BrandRef;
  title: string;
  category: string;
  image?: string;
  description?: string;
  terms?: string;
  voucherType: VoucherType;
  salePrice: number;
  faceValue: number;
  discountType?: 'AMOUNT' | 'PERCENT';
  discountValue?: number;
  maxDiscount?: number;
  comboItems?: string;
  totalQuantity: number;
  soldQuantity: number;
  reservedQuantity: number;
  limitPerUser: number;
  saleStartAt: string;
  saleEndAt: string;
  voucherExpireAt: string;
  storeIds: string[];
  status: string;
  remainingStock: number;
  distanceKm?: number;
  stores?: Store[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type OrderStatus = 'PENDING' | 'FULFILLED' | 'CANCELLED';
export interface Order {
  id: string;
  customerId: string;
  campaignId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: OrderStatus;
  expiresAt: string;
  idempotencyKey: string;
  createdAt: string;
  snapshot: {
    title: string;
    brandId: string;
    salePrice: number;
    faceValue: number;
    voucherType: VoucherType;
    discountType?: string;
    discountValue?: number;
    maxDiscount?: number;
    comboItems?: string;
    storeIds: string[];
    voucherExpireAt: string;
  };
}

export type VoucherStatus = 'ACTIVE' | 'USED' | 'REFUND_PENDING' | 'REFUNDED' | 'EXPIRED';
export interface Voucher {
  id: string;
  campaignId: string;
  orderId: string;
  usageLimit: number;
  usedCount: number;
  remainingUses: number;
  totalPrice: number;
  title: string;
  brandId: string;
  storeIds: string[];
  salePrice: number;
  faceValue: number;
  voucherType: VoucherType;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  comboItems?: string;
  status: VoucherStatus;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface Redemption {
  id: string;
  sequence: number;
  remainingAfter: number;
  storeId: string;
  billAmount: number;
  discountAmount: number;
  method: 'QR' | 'OTP';
  createdAt: string;
}

export interface VoucherDetail extends Voucher {
  stores: Store[];
  redemptions: Redemption[];
}

export interface RedeemCode {
  qrPayload: string;
  otpCode: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface Refund {
  id: string;
  voucherId: string;
  amount: number;
  reason: string;
  status: 'REQUESTED' | 'COMPLETED' | 'REJECTED';
  reference?: string;
  createdAt: string;
}
