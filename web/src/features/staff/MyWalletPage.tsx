import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { benefit, date, dateTime, money, voucherStatus } from '../../components/format';
import { QrCode } from '../../components/QrCode';
import { mmss, useCountdown } from '../../components/useCountdown';
import { Alert, Badge, Empty, Field, Loadable, Modal, PageHeader, Spinner, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { RedeemCode, VoucherStatus } from '../../types';

const FILTERS: { key?: VoucherStatus; label: string }[] = [
  { label: 'Tất cả' },
  { key: 'ACTIVE', label: 'Còn hiệu lực' },
  { key: 'USED', label: 'Đã dùng' },
  { key: 'REFUND_PENDING', label: 'Chờ hoàn' },
  { key: 'REFUNDED', label: 'Đã hoàn' },
  { key: 'EXPIRED', label: 'Hết hạn' },
];
const DAY = 86400000;

export function MyWalletPage() {
  const [status, setStatus] = useState<VoucherStatus | undefined>('ACTIVE');
  const wallet = useLoad(() => api.wallet(status), [status]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHeader
        title="Ví của tôi"
        subtitle="Voucher bạn đã mua. Khi dùng, đưa mã QR/OTP cho một nhân viên khác xác nhận — bạn không tự xác nhận voucher của mình."
      />
      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f.label} className={'tab' + (status === f.key ? ' active' : '')} onClick={() => setStatus(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <Loadable loading={wallet.loading && !wallet.data} error={wallet.error}>
        {wallet.data?.length ? (
          <div className="shop-grid">
            {wallet.data.map((v) => {
              const [label, tone] = voucherStatus[v.status];
              return (
                <button key={v.id} className="card shop-card" onClick={() => setOpen(v.id)}>
                  <div className="row gap wrap">
                    <Badge tone={tone}>{label}</Badge>
                    {v.staffDiscountPercent ? <Badge tone="info">Giá NV -{v.staffDiscountPercent}%</Badge> : null}
                  </div>
                  <strong>{v.title}</strong>
                  <span className="small">{benefit(v)}</span>
                  <div className="row gap">
                    <strong style={{ color: 'var(--primary)' }}>Còn {v.remainingUses}/{v.usageLimit} lượt</strong>
                    <span className="grow" />
                    <span className="muted small">HSD {date(v.expiresAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty>
            Chưa có voucher. <Link to="/staff/shop">Mua voucher</Link>
          </Empty>
        )}
      </Loadable>
      {open ? (
        <VoucherModal
          id={open}
          onClose={() => {
            setOpen(null);
            void wallet.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function VoucherModal({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useLoad(() => api.walletItem(id), [id]);
  const [code, setCode] = useState<RedeemCode | null>(null);
  const [reason, setReason] = useState('');
  const [showRefund, setShowRefund] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const left = useCountdown(code?.expiresAt);
  const live = !!code && left > 0;
  const v = item.data;

  // While a code is shown, poll so the counter updates as a colleague confirms each use.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      api
        .walletItem(id)
        .then((next) => {
          item.setData(next);
          if (next.status !== 'ACTIVE') setCode(null);
        })
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, id]);

  if (!v) return <Modal title="Voucher" onClose={onClose}>{item.error ? <Alert>{item.error}</Alert> : <Spinner />}</Modal>;

  const usable = v.status === 'ACTIVE' && v.remainingUses > 0 && new Date(v.expiresAt).getTime() > Date.now();
  const refundable =
    v.status === 'ACTIVE' &&
    v.usedCount === 0 &&
    Date.now() - new Date(v.createdAt).getTime() <= 7 * DAY &&
    new Date(v.expiresAt).getTime() - Date.now() >= 3 * DAY;

  return (
    <Modal title={v.title} onClose={onClose}>
      <div className="stack">
        <div className="row gap wrap">
          <Badge tone={voucherStatus[v.status][1]}>{voucherStatus[v.status][0]}</Badge>
          <span className="small">{benefit(v)}</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="uses-big">
            {v.remainingUses}
            <span className="muted" style={{ fontSize: 18 }}>/{v.usageLimit}</span>
          </div>
          <div className="muted small">lượt còn lại</div>
        </div>
        {usable ? (
          <div className="card stack" style={{ alignItems: 'center', gap: 10 }}>
            {live && code ? (
              <>
                <div className="muted small" style={{ textAlign: 'center' }}>Đưa mã cho nhân viên khác quét. Mỗi lần xác nhận trừ 1 lượt.</div>
                <div className="qr-box">
                  <QrCode value={code.qrPayload} size={200} />
                </div>
                <div className="muted small">hoặc đọc mã OTP</div>
                <div className="otp-big" data-testid="otp">{code.otpCode}</div>
                <strong style={{ color: left <= 10 ? 'var(--danger)' : 'var(--warning)' }}>Hết hạn sau {mmss(left)}</strong>
                <button className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void run('code', async () => setCode(await api.redeemToken(v.id)))}>
                  Làm mới mã
                </button>
              </>
            ) : (
              <>
                <div className="muted small" style={{ textAlign: 'center' }}>
                  {code ? 'Mã đã hết hạn. Tạo mã mới — số lượt không thay đổi.' : 'Tạo mã QR/OTP khi ở quầy. Mã có hiệu lực 60 giây.'}
                </div>
                <button className="btn" disabled={!!busy} onClick={() => void run('code', async () => setCode(await api.redeemToken(v.id)))}>
                  {code ? 'Tạo mã mới' : 'Tạo mã sử dụng'}
                </button>
              </>
            )}
          </div>
        ) : null}
        <Alert tone="success">{msg}</Alert>
        <Alert>{error}</Alert>
        <div className="grid-2 small">
          <div><span className="muted">Giá mỗi vé:</span> {money(v.salePrice)}</div>
          <div><span className="muted">Giá trị gói:</span> {money(v.totalPrice)}</div>
          <div><span className="muted">Hạn sử dụng:</span> {date(v.expiresAt)}</div>
          <div><span className="muted">Cửa hàng:</span> {v.stores.map((s) => s.name).join(', ')}</div>
        </div>
        <div>
          <strong>Lịch sử sử dụng ({v.redemptions.length})</strong>
          {v.redemptions.length ? (
            <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {v.redemptions.map((r) => (
                <li key={r.id}>
                  Lượt {r.sequence} · {dateTime(r.createdAt)} · {r.method} · hóa đơn {money(r.billAmount)} · giảm {money(r.discountAmount)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted small">Chưa sử dụng lượt nào.</div>
          )}
        </div>
        {refundable ? (
          showRefund ? (
            <div className="card stack" style={{ gap: 10 }}>
              <Field label={'Lý do hoàn ' + money(v.totalPrice)}>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} />
              </Field>
              <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setShowRefund(false)}>Đóng</button>
                <button
                  className="btn btn-danger"
                  disabled={!!busy || reason.trim().length < 3}
                  onClick={() =>
                    void run('refund', async () => {
                      await api.requestRefund(v.id, reason.trim());
                      setShowRefund(false);
                      setCode(null);
                      setMsg('Đã gửi yêu cầu hoàn tiền. Quản trị viên sẽ xác nhận thủ công.');
                      item.setData(await api.walletItem(v.id));
                    })
                  }
                >
                  Gửi yêu cầu hoàn
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowRefund(true)}>
              Yêu cầu hoàn tiền
            </button>
          )
        ) : null}
      </div>
    </Modal>
  );
}
