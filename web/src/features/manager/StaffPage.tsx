import { useState } from 'react';
import type { FormEvent } from 'react';
import { dateTime } from '../../components/format';
import { BrandPicker, useMyBrand } from '../../components/useMyBrand';
import { Alert, Badge, Empty, Field, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Store } from '../../types';

export function StaffAccountsPage() {
  const state = useMyBrand();
  const staff = useLoad(() => (state.brandId ? api.staff(state.brandId) : Promise.resolve([])), [state.brandId]);
  const stores = useLoad(() => (state.brandId ? api.stores(state.brandId) : Promise.resolve([])), [state.brandId]);
  const [creating, setCreating] = useState(false);
  const storeName = (id: string) => stores.data?.find((s) => s.id === id)?.name;

  return (
    <div className="stack">
      <PageHeader
        title="Nhân viên cửa hàng"
        subtitle="Nhân viên đăng nhập web, chọn cửa hàng làm việc rồi xác nhận voucher. Mỗi nhân viên có mã nhân viên riêng để mua voucher của thương hiệu với giá ưu đãi. Đổi phân công/khóa tài khoản do quản trị viên thực hiện."
        actions={
          <>
            <BrandPicker state={state} />
            <button className="btn" disabled={!state.brandId} onClick={() => setCreating(true)}>
              + Tạo nhân viên
            </button>
          </>
        }
      />
      <Loadable loading={staff.loading && !staff.data} error={staff.error}>
        {staff.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nhân viên</th><th>Mã nhân viên</th><th>Cửa hàng</th><th>Trạng thái</th><th>Tạo lúc</th></tr>
              </thead>
              <tbody>
                {staff.data.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.fullName}</strong><div className="sub">{u.email}</div></td>
                    <td>{u.employeeCode ? <span className="mono">{u.employeeCode}</span> : <span className="muted">—</span>}</td>
                    <td className="small">{u.storeIds.map(storeName).filter(Boolean).join(', ') || '—'}</td>
                    <td>{u.active ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}</td>
                    <td className="small muted">{dateTime(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Chưa có nhân viên.</Empty>
        )}
      </Loadable>
      {creating && state.brandId ? (
        <StaffForm
          brandId={state.brandId}
          stores={stores.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void staff.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function StaffForm({ brandId, stores, onClose, onSaved }: { brandId: string; stores: Store[]; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  const active = stores.filter((s) => s.active);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run('save', () =>
      api.createStaff(brandId, { email: email.trim(), fullName: fullName.trim(), password, storeIds }),
    );
    if (ok) onSaved();
  }

  return (
    <Modal title="Tạo nhân viên" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Họ tên">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 8 ký tự">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Cửa hàng làm việc">
          <div className="checks">
            {active.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={storeIds.includes(s.id)}
                  onChange={() => setStoreIds((l) => (l.includes(s.id) ? l.filter((x) => x !== s.id) : [...l, s.id]))}
                />
                {s.name}
              </label>
            ))}
            {!active.length ? <span className="muted small">Chưa có cửa hàng hoạt động.</span> : null}
          </div>
        </Field>
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy</button>
          <button className="btn" disabled={!!busy || !storeIds.length}>Tạo</button>
        </div>
      </form>
    </Modal>
  );
}
