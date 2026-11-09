import { useState } from 'react';
import type { FormEvent } from 'react';
import { DocumentFacts, DocumentPreview } from '../../components/DocumentViews';
import { brandStatus, dateTime, licenseLabel, toDateInput } from '../../components/format';
import { documentProblem, FOOD_SAFETY_MIN_DAYS } from '../../components/priceRules';
import { BrandPicker, useMyBrand } from '../../components/useMyBrand';
import { Alert, Badge, Empty, Field, Loadable, PageHeader, useAction } from '../../components/ui';
import { api } from '../../services/api';
import type { Brand, BrandDocument, LicenseType } from '../../types';

const TYPES: LicenseType[] = ['BUSINESS_LICENSE', 'FOOD_SAFETY'];
const ACCEPT = 'application/pdf,image/png,image/jpeg';

export function DocumentsPage() {
  const state = useMyBrand();
  const brand = state.brand;
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const editable = brand?.status === 'DRAFT' || brand?.status === 'REJECTED';
  const problem = brand ? documentProblem(brand.documents ?? [], FOOD_SAFETY_MIN_DAYS) : null;

  async function submit() {
    if (!brand) return;
    const ok = await run('submit', async () => {
      await api.submitBrand(brand.id);
      await state.brands.reload();
    });
    if (ok) setMsg('Đã gửi hồ sơ. Quản trị viên sẽ xem xét và duyệt thương hiệu.');
  }

  return (
    <div className="stack">
      <PageHeader
        title="Hồ sơ pháp lý"
        subtitle="Nộp giấy phép kinh doanh và chứng nhận an toàn thực phẩm để quản trị viên duyệt thương hiệu. Chấp nhận PDF, PNG, JPG tối đa 5MB."
        actions={<BrandPicker state={state} />}
      />
      <Loadable loading={state.brands.loading && !state.brands.data} error={state.brands.error}>
        {brand ? (
          <>
            <StatusBanner brand={brand} />
            <Alert tone="success">{msg}</Alert>
            <div className="grid-2" style={{ alignItems: 'start' }}>
              {TYPES.map((t) => (
                <DocumentCard
                  key={brand.id + t}
                  brand={brand}
                  type={t}
                  doc={brand.documents?.find((d) => d.type === t)}
                  editable={editable}
                  onSaved={async () => {
                    setMsg(null);
                    await state.brands.reload();
                  }}
                />
              ))}
            </div>
            {editable ? (
              <div className="card row gap wrap">
                <div className="grow">
                  <strong>Gửi hồ sơ cho quản trị viên</strong>
                  <div className="muted small">
                    Cần đủ 2 giấy tờ; chứng nhận ATTP còn hạn ít nhất {FOOD_SAFETY_MIN_DAYS} ngày. Sau khi gửi sẽ không sửa được cho tới khi có kết quả.
                  </div>
                  {problem ? <div className="small" style={{ color: 'var(--warning)', marginTop: 4 }}>{problem}</div> : null}
                </div>
                <button className="btn btn-lg" disabled={!!problem || !!busy} onClick={() => void submit()}>
                  {busy ? 'Đang gửi…' : 'Gửi duyệt'}
                </button>
              </div>
            ) : null}
            <Alert>{error}</Alert>
          </>
        ) : (
          <Empty>Bạn chưa sở hữu thương hiệu nào. Liên hệ quản trị viên.</Empty>
        )}
      </Loadable>
    </div>
  );
}

function StatusBanner({ brand }: { brand: Brand }) {
  const [label, tone] = brandStatus[brand.status];
  const text: Record<Brand['status'], string> = {
    DRAFT: 'Thương hiệu chưa nộp hồ sơ. Tải lên đủ 2 giấy tờ rồi bấm “Gửi duyệt”.',
    PENDING: 'Hồ sơ đã gửi lúc ' + dateTime(brand.submittedAt) + '. Đang chờ quản trị viên duyệt.',
    APPROVED: 'Thương hiệu đã được duyệt. Chiến dịch có thể gửi duyệt và mở bán.',
    REJECTED: 'Hồ sơ bị trả lại. Sửa theo yêu cầu bên dưới rồi gửi duyệt lại.',
    SUSPENDED: 'Thương hiệu đang bị đình chỉ. Liên hệ quản trị viên.',
  };
  return (
    <div className={'alert alert-' + (tone === 'neutral' ? 'info' : tone)}>
      <Badge tone={tone}>{label}</Badge> {text[brand.status]}
      {brand.reason && (brand.status === 'REJECTED' || brand.status === 'SUSPENDED') ? (
        <div style={{ marginTop: 6 }}>
          <strong>Lý do:</strong> {brand.reason}
        </div>
      ) : null}
    </div>
  );
}

function DocumentCard({
  brand,
  type,
  doc,
  editable,
  onSaved,
}: {
  brand: Brand;
  type: LicenseType;
  doc?: BrandDocument;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(!doc);
  const [number, setNumber] = useState(doc?.number ?? '');
  const [issuer, setIssuer] = useState(doc?.issuer ?? '');
  const [issuedAt, setIssuedAt] = useState(toDateInput(doc?.issuedAt));
  const [expiresAt, setExpiresAt] = useState(toDateInput(doc?.expiresAt));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(false);
  const { busy, error, setError, run } = useAction();
  const food = type === 'FOOD_SAFETY';
  const today = toDateInput(new Date().toISOString());

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!doc && !file) return setError('Chọn file ảnh hoặc PDF.');
    if (file && file.size > 5 * 1024 * 1024) return setError('File tối đa 5MB.');
    const ok = await run('save', () =>
      api.uploadDocument(brand.id, {
        type,
        number: number.trim(),
        issuer: issuer.trim(),
        issuedAt,
        expiresAt: expiresAt || undefined,
        file,
      }),
    );
    if (ok) {
      setFile(null);
      setEditing(false);
      await onSaved();
    }
  }

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row gap">
        <h3 className="grow">{licenseLabel[type]}</h3>
        {doc ? <Badge tone="success">Đã tải lên</Badge> : <Badge tone="warning">Chưa có</Badge>}
      </div>
      {doc && !editing ? (
        <>
          <DocumentFacts doc={doc} />
          <div className="row gap">
            <button className="btn btn-outline btn-sm" onClick={() => setPreview(true)}>
              Xem file
            </button>
            {editable ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                Sửa / thay file
              </button>
            ) : null}
          </div>
        </>
      ) : editable ? (
        <form className="form" onSubmit={save}>
          <Field label="Số giấy">
            <input value={number} onChange={(e) => setNumber(e.target.value)} minLength={3} maxLength={60} required />
          </Field>
          <Field label="Cơ quan cấp">
            <input value={issuer} onChange={(e) => setIssuer(e.target.value)} minLength={2} maxLength={200} required />
          </Field>
          <div className="form-grid">
            <Field label="Ngày cấp">
              <input type="date" value={issuedAt} max={today} onChange={(e) => setIssuedAt(e.target.value)} required />
            </Field>
            <Field label={food ? 'Ngày hết hạn' : 'Ngày hết hạn (nếu có)'} hint={food ? 'Còn ít nhất 30 ngày khi gửi duyệt' : undefined}>
              <input type="date" value={expiresAt} min={issuedAt || undefined} onChange={(e) => setExpiresAt(e.target.value)} required={food} />
            </Field>
          </div>
          <Field label={doc ? 'File mới (bỏ trống để giữ file cũ)' : 'File ảnh/PDF'} hint="PDF, PNG, JPG · tối đa 5MB">
            <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required={!doc} />
          </Field>
          <Alert>{error}</Alert>
          <div className="row gap" style={{ justifyContent: 'flex-end' }}>
            {doc ? (
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>
                Hủy
              </button>
            ) : null}
            <button className="btn" disabled={!!busy}>
              {busy ? 'Đang tải lên…' : 'Lưu giấy tờ'}
            </button>
          </div>
        </form>
      ) : (
        <div className="muted small">Chưa có giấy tờ.</div>
      )}
      {preview && doc ? <DocumentPreview brandId={brand.id} doc={doc} onClose={() => setPreview(false)} /> : null}
    </div>
  );
}
