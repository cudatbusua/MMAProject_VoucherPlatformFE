export type Role = 'ADMIN' | 'BRAND_OWNER' | 'BRAND_MANAGER' | 'STORE_STAFF' | 'CUSTOMER';
export type VoucherType = 'DISCOUNT' | 'PREPAID' | 'COMBO';
export type CampaignStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'PUBLISHED' | 'PAUSED' | 'ENDED';
export type BrandStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

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

export interface Brand {
  id: string;
  ownerId: string;
  name: string;
  logo?: string;
  description?: string;
  status: BrandStatus;
  reason?: string;
  createdAt: string;
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
  brandId: string;
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
  status: CampaignStatus;
  rejectReason?: string;
  createdAt: string;
}

export interface CampaignInput {
  title: string;
  category?: string;
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
  limitPerUser?: number;
  saleStartAt: string;
  saleEndAt: string;
  voucherExpireAt: string;
  storeIds: string[];
}

export interface Stock {
  total: number;
  sold: number;
  reserved: number;
  available: number;
}

export interface BrandReport {
  brandId: string;
  campaigns: number;
  paidOrders: number;
  ticketsSold: number;
  vouchersIssued: number;
  redemptions: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  currency: string;
}

export interface AdminReport {
  users: number;
  orders: number;
  vouchers: number;
  redeemed: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  currency: string;
  paymentMode: string;
}

export interface Order {
  id: string;
  customerId: string;
  campaignId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  createdAt: string;
  snapshot: { title: string };
}

export interface Voucher {
  id: string;
  title: string;
  usageLimit: number;
  usedCount: number;
  remainingUses: number;
  totalPrice: number;
  status: string;
}

export interface Redemption {
  id: string;
  voucherId: string;
  staffId: string;
  storeId: string;
  sequence: number;
  remainingAfter: number;
  billAmount: number;
  discountAmount: number;
  method: 'QR' | 'OTP';
  createdAt: string;
}

export interface RedeemResult {
  message: string;
  voucher: Voucher;
  redemption: Redemption;
  remainingUses: number;
  replayed: boolean;
  amountDue: number;
}

export interface Refund {
  id: string;
  voucherId: string;
  customerId: string;
  amount: number;
  reason: string;
  status: 'REQUESTED' | 'COMPLETED' | 'REJECTED';
  reference?: string;
  createdAt: string;
}

export interface Audit {
  id: string;
  actorId: string;
  action: string;
  resourceId: string;
  detail?: string;
  createdAt: string;
}
