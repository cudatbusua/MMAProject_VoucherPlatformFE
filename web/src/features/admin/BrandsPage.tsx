import { useState } from 'react';
import type { FormEvent } from 'react';
import { brandStatus, dateTime, money } from '../../components/format';
import { ReasonDialog } from '../../components/ReasonDialog';
import { Alert, Badge, Field, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Brand } from '../../types';

type Dialog = { kind: 'reject' | 'suspend'; brand: Brand } | null;

export function AdminBrandsPage() {
  const brands = useLoad(api.brands);
  const users = useLoad(api.users);
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [detail, setDetail] = useState<Brand | null>(null);
  const { busy, error, run } = useAction();
  const owner = (id: string) => users.data?.find((u) => u.id === id);

  const act = (key: string, fn: () => Promise<unknown>) =>
    run(key, async () => {
      await fn();
      await brands.reload();
    });

  return (
    <div className="stack">
      <PageHeader
        title="Thương hiệu"
        subtitle="Tạo thương hiệu cho chủ sở hữu, duyệt, đình chỉ hoặc khôi phục."
        actions={<button className="btn" onClick={() => setCreating(true)}>+ Tạo thương hiệu</button>}
      />
      <Alert>{error}</Alert>
      <Loadable loading={brands.loading && !brands.data} error={brands.error}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thương hiệu</th>
                <th>Chủ sở hữu</th>
                <th>Trạng thái</th>
                <th>Tạo lúc</th>
                <th className="right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {brands.data?.map((b) => {
                const [label, tone] = brandStatus[b.status];
                const o = owner(b.ownerId);
                return (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      {b.description ? <div className="sub">{b.description}</div> : null}
                    </td>
                    <td className="small">{o ? o.fullName || o.email : b.ownerId.slice(-6)}</td>
                    <td>
                      <Badge tone={tone}>{label}</Badge>
                      {b.reason ? <div className="sub">{b.reason}</div> : null}
                    </td>
                    <td className="small muted">{dateTime(b.createdAt)}</td>
                    <td className="right">
                      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setDetail(b)}>
                          Chi tiết
                        </button>
                        {b.status === 'PENDING' ? (
                          <>
                            <button className="btn btn-success btn-sm" disabled={!!busy} onClick={() => act('a' + b.id, () => api.approveBrand(b.id))}>
                              Duyệt
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'reject', brand: b })}>
                              Từ chối
                            </button>
                          </>
                        ) : null}
                        {b.status === 'APPROVED' ? (
                          <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'suspend', brand: b })}>
                            Đình chỉ
                          </button>
                        ) : null}
                        {b.status === 'SUSPENDED' || b.status === 'REJECTED' ? (
                          <button className="btn btn-success btn-sm" disabled={!!busy} onClick={() => act('r' + b.id, () => api.reinstateBrand(b.id))}>
                            {b.status === 'SUSPENDED' ? 'Khôi phục' : 'Duyệt lại'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Loadable>
      {creating ? (
        <CreateBrand
          owners={(users.data ?? []).filter((u) => u.role === 'BRAND_OWNER' && u.active)}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void brands.reload();
          }}
        />
      ) : null}
      {dialog ? (
        <ReasonDialog
          title={(dialog.kind === 'reject' ? 'Từ chối ' : 'Đình chỉ ') + dialog.brand.name}
          danger
          confirmText={dialog.kind === 'reject' ? 'Từ chối' : 'Đình chỉ'}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            if (dialog.kind === 'reject') await api.rejectBrand(dialog.brand.id, reason);
            else await api.suspendBrand(dialog.brand.id, reason);
            await brands.reload();
          }}
        />
      ) : null}
      {detail ? <BrandDetail brand={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function CreateBrand({
  owners,
  onClose,
  onSaved,
}: {
  owners: { id: string; email: string; fullName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [logo, setLogo] = useState('');
  const { busy, error, run } = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run('save', () =>
      api.createBrand({
        name: name.trim(),
        ownerId,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(logo.trim() ? { logo: logo.trim() } : {}),
      }),
    );
    if (ok) onSaved();
  }
  return (
    <Modal title="Tạo thương hiệu" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Tên thương hiệu">
          <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={150} required />
        </Field>
        <Field label="Chủ sở hữu (BRAND_OWNER)" hint="Tạo tài khoản chủ thương hiệu ở trang Tài khoản nếu chưa có.">
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {(o.fullName || o.email) + ' · ' + o.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Logo (URL, không bắt buộc)">
          <input type="url" value={logo} onChange={(e) => setLogo(e.target.value)} />
        </Field>
        <Field label="Mô tả">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        <Alert tone="info">Thương hiệu mới ở trạng thái Chờ duyệt.</Alert>
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn" disabled={!!busy || !ownerId}>
            Tạo
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BrandDetail({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const report = useLoad(() => api.brandReport(brand.id), [brand.id]);
  const stores = useLoad(() => api.stores(brand.id), [brand.id]);
  const r = report.data;
  return (
    <Modal title={brand.name} onClose={onClose} wide>
      <div className="stack">
        <Loadable loading={report.loading} error={report.error}>
          {r ? (
            <div className="grid-stats">
              <div className="card"><div className="muted small">Doanh thu ròng</div><div className="stat-value">{money(r.netRevenue)}</div></div>
              <div className="card"><div className="muted small">Vé đã bán</div><div className="stat-value">{r.ticketsSold}</div></div>
              <div className="card"><div className="muted small">Lượt sử dụng</div><div className="stat-value">{r.redemptions}</div></div>
              <div className="card"><div className="muted small">Chiến dịch</div><div className="stat-value">{r.campaigns}</div></div>
            </div>
          ) : null}
        </Loadable>
        <h3>Cửa hàng</h3>
        <Loadable loading={stores.loading} error={stores.error}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tên</th><th>Địa chỉ</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {stores.data?.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="small">{s.address}</td>
                    <td>{s.active ? <Badge tone="success">Hoạt động</Badge> : <Badge>Đóng</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Loadable>
      </div>
    </Modal>
  );
}
