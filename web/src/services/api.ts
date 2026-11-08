import type {
  AdminReport,
  Audit,
  AuthResult,
  Brand,
  BrandReport,
  Campaign,
  CampaignInput,
  Order,
  RedeemResult,
  Redemption,
  Refund,
  Role,
  Stock,
  Store,
  User,
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

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = 'Bearer ' + accessToken;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ ' + API_URL);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageOf(json, 'Lỗi ' + res.status));
  return (json as { data: T }).data;
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

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  try {
    return await raw<T>(method, path, body, auth);
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
    return raw<T>(method, path, body, auth);
  }
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
