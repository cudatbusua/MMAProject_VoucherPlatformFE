import { Schema, Types } from 'mongoose';

export enum Role {
  ADMIN = 'ADMIN',
  BRAND_OWNER = 'BRAND_OWNER',
  BRAND_MANAGER = 'BRAND_MANAGER',
  STORE_STAFF = 'STORE_STAFF',
  CUSTOMER = 'CUSTOMER',
}
export enum CampaignStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}
export enum VoucherType {
  DISCOUNT = 'DISCOUNT',
  PREPAID = 'PREPAID',
  COMBO = 'COMBO',
}
export interface Base {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
export interface User extends Base {
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  passwordHash?: string;
  storeIds: Types.ObjectId[];
  brandIds: Types.ObjectId[];
}
export interface Session extends Base {
  userId: Types.ObjectId;
  refreshHash: string;
  expiresAt: Date;
  activeStoreId?: Types.ObjectId;
}
export interface Otp extends Base {
  email: string;
  hash: string;
  expiresAt: Date;
  attempts: number;
  requestedAt: Date;
  consumed: boolean;
}
export interface Brand extends Base {
  ownerId: Types.ObjectId;
  name: string;
  logo?: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  reason?: string;
}
export interface Store extends Base {
  brandId: Types.ObjectId;
  name: string;
  address: string;
  active: boolean;
  location: { type: 'Point'; coordinates: number[] };
}
export interface Campaign extends Base {
  brandId: Types.ObjectId;
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
  saleStartAt: Date;
  saleEndAt: Date;
  voucherExpireAt: Date;
  storeIds: Types.ObjectId[];
  status: CampaignStatus;
  rejectReason?: string;
  approvedBy?: Types.ObjectId;
}
export interface Quota extends Base {
  userId: Types.ObjectId;
  campaignId: Types.ObjectId;
  reserved: number;
  purchased: number;
}
export interface Order extends Base {
  customerId: Types.ObjectId;
  campaignId: Types.ObjectId;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  expiresAt: Date;
  idempotencyKey: string;
  snapshot: {
    title: string;
    brandId: Types.ObjectId;
    salePrice: number;
    faceValue: number;
    voucherType: VoucherType;
    discountType?: string;
    discountValue?: number;
    maxDiscount?: number;
    comboItems?: string;
    storeIds: Types.ObjectId[];
    voucherExpireAt: Date;
  };
}
export interface Payment extends Base {
  orderId: Types.ObjectId;
  eventId: string;
  amount: number;
  provider: 'DEMO';
  status: 'SUCCESS';
}
export interface Voucher extends Base {
  customerId: Types.ObjectId;
  campaignId: Types.ObjectId;
  orderId: Types.ObjectId;
  itemIndex: number;
  formatVersion: number;
  usageLimit: number;
  usedCount: number;
  remainingUses: number;
  totalPrice: number;
  title: string;
  brandId: Types.ObjectId;
  storeIds: Types.ObjectId[];
  salePrice: number;
  faceValue: number;
  voucherType: VoucherType;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  comboItems?: string;
  status: 'ACTIVE' | 'USED' | 'REFUND_PENDING' | 'REFUNDED' | 'EXPIRED';
  expiresAt: Date;
  usedAt?: Date;
}
export interface RedeemToken extends Base {
  voucherId: Types.ObjectId;
  customerId: Types.ObjectId;
  tokenHash: string;
  otpHash: string;
  expiresAt: Date;
  used: boolean;
}
export interface Redemption extends Base {
  sequence: number;
  remainingAfter: number;
  idempotencyKey?: string;
  requestHash?: string;
  voucherId: Types.ObjectId;
  staffId: Types.ObjectId;
  storeId: Types.ObjectId;
  billAmount: number;
  discountAmount: number;
  method: 'QR' | 'OTP';
}
export interface Refund extends Base {
  voucherId: Types.ObjectId;
  customerId: Types.ObjectId;
  amount: number;
  reason: string;
  status: 'REQUESTED' | 'COMPLETED' | 'REJECTED';
  reviewedBy?: Types.ObjectId;
  reference?: string;
}
export interface Audit extends Base {
  actorId: Types.ObjectId;
  action: string;
  resourceId: Types.ObjectId;
  detail?: string;
}

const ref = (model: string) => ({ type: Schema.Types.ObjectId, ref: model, required: true });
const optionalRef = (model: string) => ({ type: Schema.Types.ObjectId, ref: model });
const positive = { type: Number, required: true, min: 1, validate: Number.isSafeInteger };
const counter = { type: Number, default: 0, min: 0, validate: Number.isSafeInteger };
const options = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc: unknown, result: Record<string, unknown>) => {
      delete result._id;
      delete result.__v;
      delete result.passwordHash;
      delete result.refreshHash;
      delete result.hash;
      delete result.tokenHash;
      delete result.otpHash;
      delete result.requestHash;
      return result;
    },
  },
};

export const UserSchema = new Schema<User>(
  {
    email: { type: String, unique: true, required: true, lowercase: true },
    fullName: { type: String, default: '' },
    role: { type: String, enum: Object.values(Role), required: true },
    active: { type: Boolean, default: true },
    passwordHash: { type: String, select: false },
    storeIds: [ref('Store')],
    brandIds: [ref('Brand')],
  },
  options,
);
export const SessionSchema = new Schema<Session>(
  {
    userId: ref('User'),
    refreshHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    activeStoreId: optionalRef('Store'),
  },
  options,
);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const OtpSchema = new Schema<Otp>(
  {
    email: { type: String, unique: true, required: true },
    hash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: counter,
    requestedAt: Date,
    consumed: { type: Boolean, default: false },
  },
  options,
);
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
export const BrandSchema = new Schema<Brand>(
  {
    ownerId: ref('User'),
    name: { type: String, required: true },
    logo: String,
    description: String,
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'], default: 'PENDING' },
    reason: String,
  },
  options,
);
BrandSchema.index({ ownerId: 1 });
export const StoreSchema = new Schema<Store>(
  {
    brandId: ref('Brand'),
    name: { type: String, required: true },
    address: { type: String, required: true },
    active: { type: Boolean, default: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
  },
  options,
);
StoreSchema.index({ location: '2dsphere' });
StoreSchema.index({ brandId: 1, active: 1 });
export const CampaignSchema = new Schema<Campaign>(
  {
    brandId: ref('Brand'),
    title: { type: String, required: true },
    category: { type: String, default: 'OTHER' },
    image: String,
    description: String,
    terms: String,
    voucherType: { type: String, enum: Object.values(VoucherType), required: true },
    salePrice: positive,
    faceValue: positive,
    discountType: { type: String, enum: ['AMOUNT', 'PERCENT'] },
    discountValue: Number,
    maxDiscount: Number,
    comboItems: String,
    totalQuantity: positive,
    soldQuantity: counter,
    reservedQuantity: counter,
    limitPerUser: { ...positive, default: 5 },
    saleStartAt: { type: Date, required: true },
    saleEndAt: { type: Date, required: true },
    voucherExpireAt: { type: Date, required: true },
    storeIds: [ref('Store')],
    status: { type: String, enum: Object.values(CampaignStatus), default: CampaignStatus.DRAFT },
    rejectReason: String,
    approvedBy: optionalRef('User'),
  },
  options,
);
CampaignSchema.index({ status: 1, saleStartAt: 1, saleEndAt: 1 });
CampaignSchema.index({ brandId: 1, createdAt: -1 });
export const QuotaSchema = new Schema<Quota>(
  { userId: ref('User'), campaignId: ref('Campaign'), reserved: counter, purchased: counter },
  options,
);
QuotaSchema.index({ userId: 1, campaignId: 1 }, { unique: true });
export const OrderSchema = new Schema<Order>(
  {
    customerId: ref('User'),
    campaignId: ref('Campaign'),
    quantity: positive,
    unitPrice: positive,
    totalAmount: positive,
    status: { type: String, enum: ['PENDING', 'FULFILLED', 'CANCELLED'], default: 'PENDING' },
    expiresAt: { type: Date, required: true },
    idempotencyKey: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  options,
);
OrderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
OrderSchema.index({ status: 1, expiresAt: 1 });
export const PaymentSchema = new Schema<Payment>(
  {
    orderId: { ...ref('Order'), unique: true },
    eventId: { type: String, unique: true, required: true },
    amount: positive,
    provider: { type: String, enum: ['DEMO'], required: true },
    status: { type: String, enum: ['SUCCESS'], required: true },
  },
  options,
);
export const VoucherSchema = new Schema<Voucher>(
  {
    customerId: ref('User'),
    campaignId: ref('Campaign'),
    orderId: ref('Order'),
    itemIndex: { type: Number, default: 0, required: true },
    formatVersion: { type: Number, default: 2 },
    usageLimit: { ...positive, default: 1 },
    usedCount: counter,
    remainingUses: { ...counter, default: 1 },
    totalPrice: positive,
    title: String,
    brandId: ref('Brand'),
    storeIds: [ref('Store')],
    salePrice: positive,
    faceValue: positive,
    voucherType: { type: String, enum: Object.values(VoucherType), required: true },
    discountType: String,
    discountValue: Number,
    maxDiscount: Number,
    comboItems: String,
    status: {
      type: String,
      enum: ['ACTIVE', 'USED', 'REFUND_PENDING', 'REFUNDED', 'EXPIRED'],
      default: 'ACTIVE',
    },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  options,
);
VoucherSchema.index({ orderId: 1, itemIndex: 1 }, { unique: true });
VoucherSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { formatVersion: 2 } });
VoucherSchema.index({ customerId: 1, status: 1, createdAt: -1 });
export const RedeemTokenSchema = new Schema<RedeemToken>(
  {
    voucherId: { ...ref('Voucher'), unique: true },
    customerId: ref('User'),
    tokenHash: { type: String, select: false },
    otpHash: { type: String, select: false },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  options,
);
RedeemTokenSchema.index({ tokenHash: 1 }, { unique: true });
RedeemTokenSchema.index({ otpHash: 1 }, { unique: true });
RedeemTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RedemptionSchema = new Schema<Redemption>(
  {
    voucherId: ref('Voucher'),
    sequence: positive,
    remainingAfter: { type: Number, min: 0, required: true },
    idempotencyKey: String,
    requestHash: { type: String, select: false },
    staffId: ref('User'),
    storeId: ref('Store'),
    billAmount: { type: Number, min: 0, required: true },
    discountAmount: { type: Number, min: 0, required: true },
    method: { type: String, enum: ['QR', 'OTP'], required: true },
  },
  options,
);
RedemptionSchema.index({ voucherId: 1, sequence: 1 }, { unique: true });
RedemptionSchema.index(
  { staffId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
export const RefundSchema = new Schema<Refund>(
  {
    voucherId: { ...ref('Voucher'), unique: true },
    customerId: ref('User'),
    amount: positive,
    reason: String,
    status: { type: String, enum: ['REQUESTED', 'COMPLETED', 'REJECTED'], default: 'REQUESTED' },
    reviewedBy: optionalRef('User'),
    reference: String,
  },
  options,
);
export const AuditSchema = new Schema<Audit>(
  {
    actorId: ref('User'),
    action: String,
    resourceId: { type: Schema.Types.ObjectId, required: true },
    detail: String,
  },
  options,
);
export const modelDefinitions = [
  { name: 'User', schema: UserSchema },
  { name: 'Session', schema: SessionSchema },
  { name: 'Otp', schema: OtpSchema },
  { name: 'Brand', schema: BrandSchema },
  { name: 'Store', schema: StoreSchema },
  { name: 'Campaign', schema: CampaignSchema },
  { name: 'Quota', schema: QuotaSchema },
  { name: 'Order', schema: OrderSchema },
  { name: 'Payment', schema: PaymentSchema },
  { name: 'Voucher', schema: VoucherSchema },
  { name: 'RedeemToken', schema: RedeemTokenSchema },
  { name: 'Redemption', schema: RedemptionSchema },
  { name: 'Refund', schema: RefundSchema },
  { name: 'Audit', schema: AuditSchema },
];
