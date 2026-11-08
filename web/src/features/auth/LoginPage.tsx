import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Field } from '../../components/ui';
import { useAuth } from '../../services/auth';

const DEMO = [
  ['admin@voucher.local', 'Quản trị viên'],
  ['owner@voucher.local', 'Chủ thương hiệu'],
  ['manager@voucher.local', 'Quản lý thương hiệu'],
  ['staff@voucher.local', 'Nhân viên cửa hàng'],
] as const;

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card stack">
        <div className="row gap">
          <div className="logo">V</div>
          <div>
            <h1 style={{ fontSize: 20 }}>Voucher Platform</h1>
            <div className="muted small">Quản trị · Thương hiệu · Cửa hàng</div>
          </div>
        </div>
        <form className="form" onSubmit={submit}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
          <Field label="Mật khẩu">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              minLength={8}
              required
            />
          </Field>
          <Alert>{error}</Alert>
          <button className="btn btn-lg" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <div className="stack" style={{ gap: 8 }}>
          <div className="muted small">Tài khoản mẫu (môi trường local) — chọn để điền email:</div>
          <div className="demo-accounts">
            {DEMO.map(([e, label]) => (
              <button key={e} type="button" className="btn btn-outline btn-sm" onClick={() => setEmail(e)}>
                <strong>{label}</strong> <span className="muted">· {e}</span>
              </button>
            ))}
          </div>
          <div className="muted small">Khách hàng mua và dùng voucher trên ứng dụng di động.</div>
        </div>
      </div>
    </div>
  );
}
