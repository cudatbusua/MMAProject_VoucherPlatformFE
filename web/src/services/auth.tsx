import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { api, ApiError, refreshSession, session } from './api';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);

export const MOBILE_ONLY =
  'Tài khoản khách hàng vui lòng dùng ứng dụng di động. Web dành cho quản trị, thương hiệu và nhân viên.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    session.onExpired(() => setUser(null));
    refreshSession()
      .then(async (r) => {
        if (r && r.user.role !== 'CUSTOMER') setUser(r.user);
        else if (r) {
          await api.logout().catch(() => undefined);
          session.clear();
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
    return () => session.onExpired(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    session.save(r);
    if (r.user.role === 'CUSTOMER') {
      await api.logout().catch(() => undefined);
      session.clear();
      throw new ApiError(403, MOBILE_ONLY);
    }
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    session.clear();
    try {
      localStorage.removeItem('voucher.web.activeStore');
      localStorage.removeItem('voucher.web.brand');
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout, setUser }), [user, ready, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
