import { Platform } from 'react-native';
import { secureStorage } from './storage';
import type {
  AuthResult,
  Campaign,
  Order,
  Paged,
  RedeemCode,
  Refund,
  User,
  Voucher,
  VoucherDetail,
  VoucherStatus,
} from '../types';

const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4100/api' : 'http://127.0.0.1:4100/api';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL).replace(/\/$/, '');

const REFRESH_KEY = 'voucher.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export const session = {
  setAccess(token: string | null) {
    accessToken = token;
  },
  async save(result: AuthResult) {
    accessToken = result.accessToken;
    await secureStorage.set(REFRESH_KEY, result.refreshToken);
  },
  async clear() {
    accessToken = null;
    await secureStorage.remove(REFRESH_KEY);
  },
  getRefresh() {
    return secureStorage.get(REFRESH_KEY);
  },
  onExpired(cb: (() => void) | null) {
    onSessionExpired = cb;
  },
};

function messageOf(body: unknown, fallback: string) {
  const msg = (body as { error?: { message?: string | string[] } })?.error?.message;
  if (Array.isArray(msg)) return msg.join('\n');
  return msg || fallback;
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
    throw new ApiError(0, 'Không kết nối được máy chủ (' + API_URL + ').');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // empty body
  }
  if (!res.ok) throw new ApiError(res.status, messageOf(json, 'Lỗi ' + res.status));
  return (json as { data: T }).data;
}

let inflight: Promise<AuthResult | null> | null = null;

/** Refresh tokens rotate, so every caller shares one in-flight refresh. */
export function refreshSession(): Promise<AuthResult | null> {
  inflight ??= (async () => {
    const token = await session.getRefresh();
    if (!token) return null;
    try {
      const result = await raw<AuthResult>('POST', '/auth/refresh', { refreshToken: token }, false);
      await session.save(result);
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await session.clear();
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
    // Single-flight refresh: refresh tokens rotate, so concurrent refreshes would revoke each other.
    refreshPromise ??= refreshSession()
      .then((r) => !!r)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
    if (!(await refreshPromise)) {
      onSessionExpired?.();
      throw new ApiError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    return raw<T>(method, path, body, auth);
  }
}

function query(params: Record<string, string | number | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  return parts.length ? '?' + parts.join('&') : '';
}

export interface SearchParams {
  q?: string;
  category?: string;
  sort?: 'newest' | 'price' | 'best';
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}

export const api = {
  requestOtp: (email: string) =>
    request<{ message: string; expiresIn: number }>('POST', '/auth/otp/request', { email }, false),
  verifyOtp: (email: string, code: string) =>
    request<AuthResult>('POST', '/auth/otp/verify', { email, code }, false),
  logout: () => request<{ success: boolean }>('POST', '/auth/logout'),
  me: () => request<User>('GET', '/users/me'),
  updateMe: (fullName: string) => request<User>('PATCH', '/users/me', { fullName }),

  categories: () => request<string[]>('GET', '/categories', undefined, false),
  search: (p: SearchParams) =>
    request<Paged<Campaign>>('GET', '/vouchers' + query({ ...p }), undefined, false),
  campaign: (id: string) => request<Campaign>('GET', '/vouchers/' + id, undefined, false),

  createOrder: (campaignId: string, quantity: number, idempotencyKey: string) =>
    request<Order>('POST', '/orders', { campaignId, quantity, idempotencyKey }),
  myOrders: () => request<Order[]>('GET', '/orders/me'),
  order: (id: string) => request<Order>('GET', '/orders/' + id),
  cancelOrder: (id: string) => request<Order>('POST', '/orders/' + id + '/cancel'),
  simulatePayment: (id: string, success = true) =>
    request<{ mode: string; message: string; order: Order } | Order>(
      'POST',
      '/orders/' + id + '/simulate-payment',
      { success },
    ),

  wallet: (status?: VoucherStatus) => request<Voucher[]>('GET', '/wallet' + query({ status })),
  walletItem: (id: string) => request<VoucherDetail>('GET', '/wallet/' + id),
  redeemToken: (voucherItemId: string) => request<RedeemCode>('POST', '/redeem/token', { voucherItemId }),

  requestRefund: (voucherItemId: string, reason: string) =>
    request<Refund>('POST', '/refunds', { voucherItemId, reason }),
  myRefunds: () => request<Refund[]>('GET', '/refunds/me'),
};
