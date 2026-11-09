import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { dateTime, roleLabel } from '../../components/format';
import { Alert, Badge, Field, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import { useAuth } from '../../services/auth';
import type { Brand, Role, Store, User } from '../../types';

const ROLES: Role[] = ['ADMIN', 'BRAND_OWNER', 'BRAND_MANAGER', 'STORE_STAFF', 'CUSTOMER'];

interface Scope {
  brands: Brand[];
  stores: (Store & { brandName: string })[];
}

async function loadScope(): Promise<Scope> {
  const brands = await api.brands();
  const lists = await Promise.all(brands.map((b) => api.stores(b.id).catch(() => [] as Store[])));
  return {
    brands,
    stores: lists.flatMap((list, i) => list.map((s) => ({ ...s, brandName: brands[i].name }))),
  };
}

export function AccountsPage() {
  const users = useLoad(api.users);
  const scope = useLoad(loadScope);
  const [filter, setFilter] = useState<Role | ''>('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const list = useMemo(
    () =>
      (users.data ?? []).filter(
        (u) =>
          (!filter || u.role === filter) &&
          (!q || (u.email + ' ' + u.fullName).toLowerCase().includes(q.toLowerCase())),
      ),
    [users.data, filter, q],
  );
  const brandName = (id: string) => scope.data?.brands.find((b) => b.id === id)?.name ?? id.slice(-6);
  const storeName = (id: string) => scope.data?.stores.find((s) => s.id === id)?.name ?? id.slice(-6);

  return (
    <div className="stack">
      <PageHeader
        title="Tài khoản"
        subtitle="Tạo tài khoản, đổi vai trò, phạm vi và khóa tài khoản. Mọi thay đổi sẽ thu hồi phiên đăng nhập của người đó."
        actions={<button className="btn" onClick={() => setCreating(true)}>+ Tạo tài khoản</button>}
      />
      <div className="row gap wrap">
        <input placeholder="Tìm email hoặc tên…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Role | '')} style={{ maxWidth: 220 }}>
          <option value="">Tất cả vai trò</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
        <span className="muted small">{list.length} tài khoản</span>
      </div>
      <Loadable loading={users.loading && !users.data} error={users.error}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Vai trò</th>
                <th>Phạm vi</th>
                <th>Trạng thái</th>
                <th>Tạo lúc</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName || '—'}</strong>
                    <div className="sub">{u.email}</div>
                  </td>
                  <td>{roleLabel[u.role]}</td>
                  <td className="small">
                    {u.role === 'BRAND_MANAGER' ? u.brandIds.map(brandName).join(', ') : null}
                    {u.role === 'STORE_STAFF' ? (
                      <>
                        {u.employeeCode ? <span className="mono">{u.employeeCode}</span> : null} {u.storeIds.map(storeName).join(', ')}
                      </>
                    ) : null}
                    {u.role !== 'BRAND_MANAGER' && u.role !== 'STORE_STAFF' ? <span className="muted">—</span> : null}
                  </td>
                  <td>{u.active ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}</td>
                  <td className="small muted">{dateTime(u.createdAt)}</td>
                  <td className="right">
                    <button className="btn btn-outline btn-sm" onClick={() => setEditing(u)}>
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Loadable>
      {creating ? (
        <AccountForm scope={scope.data} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void users.reload(); }} />
      ) : null}
      {editing ? (
        <AccountForm
          user={editing}
          scope={scope.data}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void users.reload(); }}
        />
      ) : null}
    </div>
  );
}

function AccountForm({
  user,
  scope,
  onClose,
  onSaved,
}: {
  user?: User;
  scope: Scope | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useAuth().user;
  const [email, setEmail] = useState(user?.email ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'BRAND_MANAGER');
  const [active, setActive] = useState(user?.active ?? true);
  const [brandIds, setBrandIds] = useState<string[]>(user?.brandIds ?? []);
  const [storeIds, setStoreIds] = useState<string[]>(user?.storeIds ?? []);
  const { busy, error, run } = useAction();
  const isSelf = user?.id === me?.id;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const scopes = {
      brandIds: role === 'BRAND_MANAGER' ? brandIds : [],
      storeIds: role === 'STORE_STAFF' ? storeIds : [],
    };
    const ok = await run('save', async () => {
      if (user)
        await api.updateUser(user.id, {
          role,
          active,
          ...scopes,
          ...(password ? { password } : {}),
        });
      else await api.createUser({ email: email.trim(), fullName: fullName.trim(), password, role, ...scopes });
    });
    if (ok) onSaved();
  }

  return (
    <Modal title={user ? 'Sửa tài khoản' : 'Tạo tài khoản'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {user ? (
          <div>
            <strong>{user.fullName || '—'}</strong>
            <div className="muted small">{user.email}</div>
          </div>
        ) : (
          <>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Họ tên">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
            </Field>
          </>
        )}
        <Field label={user ? 'Mật khẩu mới (bỏ trống nếu không đổi)' : 'Mật khẩu'} hint="Tối thiểu 8 ký tự">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required={!user}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Vai trò">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </select>
        </Field>
        {role === 'BRAND_MANAGER' ? (
          <Field label="Thương hiệu được quản lý" hint="Bắt buộc ít nhất một thương hiệu">
            <div className="checks">
              {scope?.brands.length ? (
                scope.brands.map((b) => (
                  <label key={b.id}>
                    <input type="checkbox" checked={brandIds.includes(b.id)} onChange={() => toggle(brandIds, setBrandIds, b.id)} />
                    {b.name}
                  </label>
                ))
              ) : (
                <span className="muted small">Chưa có thương hiệu.</span>
              )}
            </div>
          </Field>
        ) : null}
        {role === 'STORE_STAFF' ? (
          <Field label="Cửa hàng được phân công" hint="Chỉ chọn cửa hàng đang hoạt động">
            <div className="checks">
              {scope?.stores.filter((s) => s.active).length ? (
                scope.stores
                  .filter((s) => s.active)
                  .map((s) => (
                    <label key={s.id}>
                      <input type="checkbox" checked={storeIds.includes(s.id)} onChange={() => toggle(storeIds, setStoreIds, s.id)} />
                      {s.name} <span className="muted small">· {s.brandName}</span>
                    </label>
                  ))
              ) : (
                <span className="muted small">Chưa có cửa hàng hoạt động.</span>
              )}
            </div>
          </Field>
        ) : null}
        {user ? (
          <label className="row gap">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 'auto' }} disabled={isSelf} />
            Tài khoản đang hoạt động
          </label>
        ) : null}
        {isSelf ? <Alert tone="info">Bạn không thể tự khóa hoặc hạ quyền tài khoản của mình.</Alert> : null}
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn" disabled={!!busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
