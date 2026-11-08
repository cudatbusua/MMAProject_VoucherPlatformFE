import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, refreshSession, session } from '../services/api';
import type { AuthResult, User } from '../types';

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (result: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export const WEB_ONLY_MESSAGE =
  'Ứng dụng di động chỉ dành cho khách hàng. Tài khoản quản trị, thương hiệu và nhân viên vui lòng dùng giao diện web.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    session.onExpired(() => setUser(null));
    refreshSession()
      .then(async (r) => {
        if (r && r.user.role === 'CUSTOMER') setUser(r.user);
        else if (r) {
          await api.logout().catch(() => undefined);
          await session.clear();
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
    return () => session.onExpired(null);
  }, []);

  const signIn = useCallback(async (result: AuthResult) => {
    await session.save(result);
    if (result.user.role !== 'CUSTOMER') {
      await api.logout().catch(() => undefined);
      await session.clear();
      throw new ApiError(403, WEB_ONLY_MESSAGE);
    }
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    await session.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, signOut, setUser }), [user, ready, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
