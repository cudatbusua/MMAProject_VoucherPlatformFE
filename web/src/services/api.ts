import type {
  AdminReport,
  Audit,
  AuthResult,
  Brand,
  BrandReport,
  Campaign,
  CampaignInput,
  LicenseType,
  Order,
  Paged,
  PublicCampaign,
  RedeemCode,
  RedeemResult,
  Redemption,
  Refund,
  Role,
  StaffPrice,
  Stock,
  Store,
  User,
  Voucher,
  VoucherDetail,
  VoucherStatus,
} from '../types';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:4100/api').replace(/\/$/, '');
const REFRESH_KEY = 'voucher.web.refreshToken';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let expiredHandler: (() => void) | null = null;

function readRefresh() {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export const session = {
  save(r: AuthResult) {
    accessToken = r.accessToken;
    try {
      localStorage.setItem(REFRESH_KEY, r.refreshToken);
    } catch {
      // storage unavailable: session lasts for this tab only
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      // ignore
    }
  },
  onExpired(cb: (() => void) | null) {
    expiredHandler = cb;
  },
};

function messageOf(body: unknown, fallback: string) {
  const m = (body as { error?: { message?: string | string[] } } | null)?.error?.message;
  return Array.isArray(m) ? m.join('; ') : m || fallback;
}

async function send(method: string, path: string, body: unknown, auth: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = 'Bearer ' + accessToken;
  try {
    return await fetch(API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ ' + API_URL);
  }
}

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const res = await send(method, path, body, auth);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageOf(json, 'Lỗi ' + res.status));
  return (json as { data: T }).data;
}

async function rawBlob(path: string): Promise<Blob> {
  const res = await send('GET', path, undefined, true);
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, messageOf(json, 'Lỗi ' + res.status));
  }
  return res.blob();
}

let inflight: Promise<AuthResult | null> | null = null;

/** Refresh tokens rotate, so every caller shares one in-flight refresh. */
export function refreshSession(): Promise<AuthResult | null> {
  inflight ??= (async () => {
    const token = readRefresh();
    if (!token) return null;
    try {
      const r = await raw<AuthResult>('POST', '/auth/refresh', { refreshToken: token }, false);
      session.save(r);
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) session.clear();
      throw e;
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Runs fn; on 401 refreshes the session once (shared across callers) and retries. */
async function withRefresh<T>(fn: () => Promise<T>, auth: boolean): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !auth) throw e;
    refreshing ??= refreshSession()
      .then((r) => !!r)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
    if (!(await refreshing)) {
      expiredHandler?.();
      throw new ApiError(401, 'Phiên đăng nhập đã hết hạn.');
    }
    return fn();
  }
}

const request = <T>(method: string, path: string, body?: unknown, auth = true) =>
  withRefresh(() => raw<T>(method, path, body, auth), auth);

function qs(params: Record<string, string | number | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  return parts.length ? '?' + parts.join('&') : '';
}

export interface DocumentInput {
  type: LicenseType;
  number: string;
  issuer: string;
  issuedAt: string;
  expiresAt?: string;
  file?: File | null;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const patch = <T>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {});

export interface AccountInput {
  email: string;
  fullName: string;
  password: string;
  role: Role;
  brandIds?: string[];
  storeIds?: string[];
}
export interface AccountPatch {
  role?: Role;
  active?: boolean;
  password?: string;
  brandIds?: string[];
  storeIds?: string[];
}
export interface StoreInput {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>('POST', '/auth/login', { email, password }, false),
  logout: () => post<{ success: boolean }>('/auth/logout'),
  me: () => get<User>('/users/me'),
  updateMe: (fullName: string) => patch<User>('/users/me', { fullName }),

  // Admin
  adminReport: () => get<AdminReport>('/admin/reports/overview'),
  users: () => get<User[]>('/admin/users'),
  createUser: (dto: AccountInput) => post<User>('/admin/users', dto),
  updateUser: (id: string, dto: AccountPatch) => patch<User>('/admin/users/' + id, dto),
  brands: () => get<Brand[]>('/brands'),
  createBrand: (dto: { name: string; ownerId: string; description?: string; logo?: string }) =>
    post<Brand>('/brands', dto),
  approveBrand: (id: string) => patch<Brand>('/brands/' + id + '/approve'),
  rejectBrand: (id: string, reason: string) => patch<Brand>('/brands/' + id + '/reject', { reason }),
  suspendBrand: (id: string, reason: string) => patch<Brand>('/brands/' + id + '/suspend', { reason }),
  reinstateBrand: (id: string) => patch<Brand>('/brands/' + id + '/reinstate'),
  pendingCampaigns: () => get<Campaign[]>('/campaigns/pending'),
  approveCampaign: (id: string) => patch<Campaign>('/campaigns/' + id + '/approve'),
  rejectCampaign: (id: string, reason: string) => patch<Campaign>('/campaigns/' + id + '/reject', { reason }),
  pendingRefunds: () => get<Refund[]>('/refunds/manual-pending'),
  confirmRefund: (id: string, reference: string) =>
    patch<{ refund: Refund; message: string }>('/refunds/' + id + '/confirm-manual', { reference }),
  rejectRefund: (id: string, reason: string) =>
    patch<{ refund: Refund; message: string }>('/refunds/' + id + '/reject', { reason }),
  adminOrders: () => get<Order[]>('/admin/orders'),
  adminRedemptions: () => get<Redemption[]>('/admin/redemptions'),
  audits: () => get<Audit[]>('/admin/audit-logs'),

  // Brand licenses
  uploadDocument: (brandId: string, d: DocumentInput) => {
    const form = new FormData();
    form.append('type', d.type);
    form.append('number', d.number);
    form.append('issuer', d.issuer);
    form.append('issuedAt', d.issuedAt);
    if (d.expiresAt) form.append('expiresAt', d.expiresAt);
    if (d.file) form.append('file', d.file);
    return request<Brand>('POST', '/brands/' + brandId + '/documents', form);
  },
  submitBrand: (id: string) => patch<Brand>('/brands/' + id + '/submit'),
  documentFile: (brandId: string, type: LicenseType) =>
    withRefresh(() => rawBlob('/brands/' + brandId + '/documents/' + type + '/file'), true),

  // Personal purchases (used by staff on web)
  search: (p: { q?: string; brandId?: string; sort?: string; page?: number; limit?: number }) =>
    request<Paged<PublicCampaign>>('GET', '/vouchers' + qs(p), undefined, false),
  campaign: (id: string) => request<PublicCampaign>('GET', '/vouchers/' + id, undefined, false),
  staffPrice: (campaignId: string, employeeCode: string) =>
    get<StaffPrice>('/orders/staff-price' + qs({ campaignId, employeeCode })),
  createOrder: (dto: { campaignId: string; quantity: number; idempotencyKey: string; employeeCode?: string }) =>
    post<Order>('/orders', dto),
  myOrders: () => get<Order[]>('/orders/me'),
  order: (id: string) => get<Order>('/orders/' + id),
  cancelOrder: (id: string) => post<Order>('/orders/' + id + '/cancel'),
  payDemo: (id: string) =>
    post<{ mode: string; message: string; order: Order }>('/orders/' + id + '/simulate-payment', { success: true }),
  wallet: (status?: VoucherStatus) => get<Voucher[]>('/wallet' + qs({ status })),
  walletItem: (id: string) => get<VoucherDetail>('/wallet/' + id),
  redeemToken: (voucherItemId: string) => post<RedeemCode>('/redeem/token', { voucherItemId }),
  requestRefund: (voucherItemId: string, reason: string) => post<Refund>('/refunds', { voucherItemId, reason }),
  myRefunds: () => get<Refund[]>('/refunds/me'),

  // Owner / manager
  myBrands: () => get<Brand[]>('/brands/me'),
  brandReport: (id: string) => get<BrandReport>('/brands/' + id + '/reports/overview'),
  stores: (brandId: string) => get<Store[]>('/brands/' + brandId + '/stores'),
  createStore: (brandId: string, dto: StoreInput) => post<Store>('/brands/' + brandId + '/stores', dto),
  updateStore: (id: string, dto: Partial<StoreInput> & { active?: boolean }) =>
    patch<Store>('/brands/stores/' + id, dto),
  staff: (brandId: string) => get<User[]>('/brands/' + brandId + '/staff'),
  createStaff: (brandId: string, dto: { email: string; fullName: string; password: string; storeIds: string[] }) =>
    post<User>('/brands/' + brandId + '/staff', dto),
  campaigns: (brandId: string) => get<Campaign[]>('/campaigns/brand/' + brandId),
  createCampaign: (brandId: string, dto: CampaignInput) => post<Campaign>('/campaigns/brand/' + brandId, dto),
  updateCampaign: (id: string, dto: Partial<CampaignInput>) => patch<Campaign>('/campaigns/' + id, dto),
  campaignAction: (id: string, action: 'submit' | 'withdraw' | 'pause' | 'resume') =>
    patch<Campaign>('/campaigns/' + id + '/' + action),
  stock: (id: string) => get<Stock>('/campaigns/' + id + '/stock'),

  // Staff
  myStores: () => get<Store[]>('/redeem/my-stores'),
  selectStore: (storeId: string) => post<{ activeStoreId: string }>('/auth/select-store', { storeId }),
  redeem: (dto: {
    idempotencyKey: string;
    storeId: string;
    billAmount: number;
    qrPayload?: string;
    otpCode?: string;
  }) => post<RedeemResult>('/redeem', dto),
  todayHistory: () => get<Redemption[]>('/redeem/history/today'),
};
