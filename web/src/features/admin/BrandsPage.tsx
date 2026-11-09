import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DocumentFacts, DocumentPreview, DocumentsSummary } from '../../components/DocumentViews';
import { brandStatus, dateTime, licenseLabel, money } from '../../components/format';
import { documentProblem } from '../../components/priceRules';
import { ReasonDialog } from '../../components/ReasonDialog';
import { Alert, Badge, Field, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Brand, BrandDocument, BrandStatus, LicenseType } from '../../types';

type Dialog = { kind: 'reject' | 'suspend'; brand: Brand } | null;
const FILTERS: (BrandStatus | '')[] = ['', 'PENDING', 'DRAFT', 'APPROVED', 'REJECTED', 'SUSPENDED'];

export function AdminBrandsPage() {
  const brands = useLoad(api.brands);
  const users = useLoad(api.users);
  const [filter, setFilter] = useState<BrandStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const owner = (id: string) => users.data?.find((u) => u.id === id);
  const list = useMemo(() => (brands.data ?? []).filter((b) => !filter || b.status === filter), [brands.data, filter]);
  const detail = brands.data?.find((b) => b.id === detailId) ?? null;
  const pending = brands.data?.filter((b) => b.status === 'PENDING').length ?? 0;

  const act = (key: string, fn: () => Promise<unknown>) =>
    run(key, async () => {
      await fn();
      await brands.reload();
    });

  return (
    <div className="stack">
      <PageHeader
        title="Thương hiệu"
        subtitle="Chủ thương hiệu nộp giấy phép kinh doanh và chứng nhận an toàn thực phẩm; quản trị viên xem hồ sơ rồi duyệt hoặc trả lại."
        actions={<button className="btn" onClick={() => setCreating(true)}>+ Tạo thương hiệu</button>}
      />
      <div className="row gap wrap">
        <select value={filter} onChange={(e) => setFilter(e.target.value as BrandStatus | '')} style={{ maxWidth: 220 }}>
          {FILTERS.map((s) => (
            <option key={s} value={s}>
              {s ? brandStatus[s][0] : 'Tất cả trạng thái'}
            </option>
          ))}
        </select>
        {pending ? <Badge tone="warning">{pending} hồ sơ chờ duyệt</Badge> : null}
      </div>
      <Alert>{error}</Alert>
      <Loadable loading={brands.loading && !brands.data} error={brands.error}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Thương hiệu</th>
                <th>Chủ sở hữu</th>
                <th>Hồ sơ pháp lý</th>
                <th>Trạng thái</th>
                <th className="right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const [label, tone] = brandStatus[b.status];
                const o = owner(b.ownerId);
                return (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      <div className="sub">Tạo {dateTime(b.createdAt)}</div>
                    </td>
                    <td className="small">{o ? o.fullName || o.email : b.ownerId.slice(-6)}</td>
                    <td><DocumentsSummary brand={b} /></td>
                    <td>
                      <Badge tone={tone}>{label}</Badge>
                      {b.reason ? <div className="sub">{b.reason}</div> : null}
                    </td>
                    <td className="right">
                      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                        <button className={'btn btn-sm ' + (b.status === 'PENDING' ? '' : 'btn-outline')} onClick={() => setDetailId(b.id)}>
                          {b.status === 'PENDING' ? 'Xem hồ sơ & duyệt' : 'Chi tiết'}
                        </button>
                        {b.status === 'APPROVED' ? (
                          <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'suspend', brand: b })}>
                            Đình chỉ
                          </button>
                        ) : null}
                        {b.status === 'SUSPENDED' ? (
                          <button className="btn btn-success btn-sm" disabled={!!busy} onClick={() => void act('r' + b.id, () => api.reinstateBrand(b.id))}>
                            Khôi phục
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
          title={(dialog.kind === 'reject' ? 'Trả hồ sơ: ' : 'Đình chỉ ') + dialog.brand.name}
          label={dialog.kind === 'reject' ? 'Lý do trả hồ sơ (chủ thương hiệu sẽ thấy)' : 'Lý do đình chỉ'}
          danger
          confirmText={dialog.kind === 'reject' ? 'Trả hồ sơ' : 'Đình chỉ'}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            if (dialog.kind === 'reject') await api.rejectBrand(dialog.brand.id, reason);
            else await api.suspendBrand(dialog.brand.id, reason);
            setDetailId(null);
            await brands.reload();
          }}
        />
      ) : null}
      {detail ? (
        <BrandDetail
          brand={detail}
          ownerLabel={owner(detail.ownerId)?.email ?? ''}
          busy={!!busy}
          error={error}
          onClose={() => setDetailId(null)}
          onApprove={async () => {
            if (await act('a' + detail.id, () => api.approveBrand(detail.id))) setDetailId(null);
          }}
          onReject={() => setDialog({ kind: 'reject', brand: detail })}
        />
      ) : null}
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
  // No default: picking the wrong owner silently would hand the brand (and its licenses) to someone else.
  const [ownerId, setOwnerId] = useState('');
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
            <option value="" disabled>
              — Chọn chủ sở hữu —
            </option>
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
        <Alert tone="info">
          Thương hiệu mới ở trạng thái “Chờ nộp hồ sơ”. Chủ thương hiệu cần nộp giấy phép kinh doanh và chứng nhận ATTP để được duyệt.
        </Alert>
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

function BrandDetail({
  brand,
  ownerLabel,
  busy,
  error,
  onClose,
  onApprove,
  onReject,
}: {
  brand: Brand;
  ownerLabel: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onApprove: () => Promise<void>;
  onReject: () => void;
}) {
  const report = useLoad(() => api.brandReport(brand.id), [brand.id]);
  const stores = useLoad(() => api.stores(brand.id), [brand.id]);
  const [preview, setPreview] = useState<BrandDocument | null>(null);
  const [label, tone] = brandStatus[brand.status];
  const docs = brand.documents ?? [];
  const problem = documentProblem(docs, 0);
  const r = report.data;
  return (
    <Modal title={brand.name} onClose={onClose} wide>
      <div className="stack">
        <div className="row gap wrap">
          <Badge tone={tone}>{label}</Badge>
          <span className="muted small">Chủ sở hữu: {ownerLabel}</span>
          {brand.submittedAt ? <span className="muted small">· Gửi hồ sơ {dateTime(brand.submittedAt)}</span> : null}
        </div>
        {brand.description ? <div className="muted">{brand.description}</div> : null}
        {brand.reason ? <Alert tone="warning">Lý do lần trước: {brand.reason}</Alert> : null}

        <h3>Hồ sơ pháp lý</h3>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          {(['BUSINESS_LICENSE', 'FOOD_SAFETY'] as LicenseType[]).map((t) => {
            const d = docs.find((x) => x.type === t);
            return (
              <div key={t} className="card stack" style={{ gap: 10 }}>
                <strong>{licenseLabel[t]}</strong>
                {d ? (
                  <>
                    <DocumentFacts doc={d} />
                    <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPreview(d)}>
                      Xem file
                    </button>
                  </>
                ) : (
                  <Badge tone="warning">Chưa nộp</Badge>
                )}
              </div>
            );
          })}
        </div>
        {brand.status === 'PENDING' ? (
          <div className="card row gap wrap" style={{ borderColor: 'var(--warning)' }}>
            <div className="grow">
              <strong>Kết quả duyệt</strong>
              <div className="muted small">Kiểm tra số giấy, cơ quan cấp, thời hạn và nội dung file trước khi duyệt.</div>
              {problem ? <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>Không thể duyệt: {problem}</div> : null}
            </div>
            <button className="btn btn-danger" onClick={onReject}>
              Trả hồ sơ
            </button>
            <button className="btn btn-success" disabled={busy || !!problem} onClick={() => void onApprove()}>
              Duyệt thương hiệu
            </button>
          </div>
        ) : null}
        {brand.status === 'DRAFT' ? <Alert tone="info">Chủ thương hiệu chưa gửi hồ sơ.</Alert> : null}
        <Alert>{error}</Alert>

        <h3>Số liệu</h3>
        <Loadable loading={report.loading} error={report.error}>
          {r ? (
            <div className="grid-stats">
              <div className="card"><div className="muted small">Doanh thu ròng</div><div className="stat-value">{money(r.netRevenue)}</div></div>
              <div className="card"><div className="muted small">Vé đã bán</div><div className="stat-value">{r.ticketsSold}</div></div>
              <div className="card"><div className="muted small">Đơn giá nhân viên</div><div className="stat-value">{r.staffOrders}</div></div>
              <div className="card"><div className="muted small">Lượt sử dụng</div><div className="stat-value">{r.redemptions}</div></div>
            </div>
          ) : null}
        </Loadable>
        <h3>Cửa hàng</h3>
        <Loadable loading={stores.loading} error={stores.error}>
          {stores.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tên</th><th>Địa chỉ</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {stores.data.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="small">{s.address}</td>
                      <td>{s.active ? <Badge tone="success">Hoạt động</Badge> : <Badge>Đóng</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted small">Chưa có cửa hàng.</div>
          )}
        </Loadable>
      </div>
      {preview ? <DocumentPreview brandId={brand.id} doc={preview} onClose={() => setPreview(null)} /> : null}
    </Modal>
  );
}
