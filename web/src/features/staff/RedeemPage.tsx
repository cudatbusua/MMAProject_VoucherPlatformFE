import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { money } from '../../components/format';
import { Alert, Empty, Field, Loadable, PageHeader, Spinner } from '../../components/ui';
import { api, ApiError } from '../../services/api';
import type { RedeemResult } from '../../types';
import { QrScanner } from './QrScanner';
import { useActiveStore } from './useActiveStore';

type Mode = 'camera' | 'paste' | 'otp';

export function RedeemPage() {
  const store = useActiveStore();
  const [mode, setMode] = useState<Mode>('camera');
  const [qr, setQr] = useState('');
  const [otp, setOtp] = useState('');
  const [bill, setBill] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [scanKey, setScanKey] = useState(0);
  // One key per confirmation; reused only when retrying after a network failure.
  const pendingKey = useRef<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const code = mode === 'otp' ? otp : qr;
  const billNum = Number(bill);
  const ready = !!store.active && (mode === 'otp' ? /^\d{6}$/.test(otp) : qr.length >= 20) && bill !== '' && Number.isInteger(billNum) && billNum >= 0;

  function invalidateKey() {
    pendingKey.current = null;
    setCanRetry(false);
  }

  function resetAll() {
    invalidateKey();
    setQr('');
    setOtp('');
    setBill('');
    setResult(null);
    setError(null);
    setScanKey((k) => k + 1);
  }

  async function confirm(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || !store.active) return;
    pendingKey.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const r = await api.redeem({
        idempotencyKey: pendingKey.current,
        storeId: store.active.id,
        billAmount: billNum,
        ...(mode === 'otp' ? { otpCode: otp } : { qrPayload: qr }),
      });
      setResult(r);
      invalidateKey();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError((err as Error).message);
      if (status === 0 || status >= 500) setCanRetry(true);
      else invalidateKey();
      if (status === 403 && /cửa hàng/i.test((err as Error).message)) store.clear();
    } finally {
      setBusy(false);
    }
  }

  /** Same QR/OTP may be confirmed again for another ticket while it is valid. */
  function nextUse() {
    invalidateKey();
    setResult(null);
    setBill('');
    setError(null);
  }

  if (store.stores.loading && !store.stores.data) return <Spinner />;

  if (!store.active)
    return (
      <div className="stack">
        <PageHeader title="Chọn cửa hàng làm việc" subtitle="Bạn phải chọn cửa hàng trước khi xác nhận voucher." />
        <Alert>{store.error ?? store.stores.error}</Alert>
        <Loadable loading={store.selecting} error={null}>
          {store.stores.data?.length ? (
            <div className="select-store">
              {store.stores.data.map((s) => (
                <button key={s.id} className="card store-option" onClick={() => void store.select(s.id)}>
                  <strong>{s.name}</strong>
                  <div className="muted small">{s.address}</div>
                </button>
              ))}
            </div>
          ) : (
            <Empty>Bạn chưa được phân công cửa hàng đang hoạt động.</Empty>
          )}
        </Loadable>
      </div>
    );

  return (
    <div className="stack">
      <PageHeader
        title="Xác nhận voucher"
        subtitle={'Đang làm việc tại: ' + store.active.name}
        actions={
          (store.stores.data?.length ?? 0) > 1 ? (
            <button className="btn btn-outline" onClick={() => { resetAll(); store.clear(); }}>
              Đổi cửa hàng
            </button>
          ) : null
        }
      />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card stack">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {(
              [
                ['camera', 'Quét QR'],
                ['paste', 'Dán mã QR'],
                ['otp', 'Nhập OTP'],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                className={'tab' + (mode === m ? ' active' : '')}
                onClick={() => {
                  setMode(m);
                  resetAll();
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'camera' ? (
            qr ? (
              <Alert tone="success">
                Đã đọc mã QR. <button className="btn btn-ghost btn-sm" onClick={resetAll}>Quét lại</button>
              </Alert>
            ) : (
              <QrScanner key={scanKey} onResult={(t) => { invalidateKey(); setQr(t); }} />
            )
          ) : null}
          {mode === 'paste' ? (
            <Field label="Mã QR (chuỗi)">
              <input className="mono" value={qr} onChange={(e) => { invalidateKey(); setQr(e.target.value.trim()); }} placeholder="Dán nội dung mã QR" />
            </Field>
          ) : null}
          {mode === 'otp' ? (
            <Field label="Mã OTP 6 số khách đọc">
              <input
                className="otp-input"
                value={otp}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => { invalidateKey(); setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); }}
                placeholder="______"
                autoFocus
              />
            </Field>
          ) : null}
          <div className="muted small">Mã của khách có hiệu lực 60 giây; khách có thể làm mới mã trên ứng dụng mà không mất lượt.</div>
        </div>

        <form className="card stack" onSubmit={confirm}>
          {result ? (
            <div className="stack" style={{ gap: 10 }}>
              <Alert tone="success">
                {result.message}
                {result.replayed ? ' (yêu cầu lặp lại — không trừ thêm lượt)' : ''}
              </Alert>
              <div className="muted small">Khách cần thanh toán</div>
              <div className="result-big">{money(result.amountDue)}</div>
              <div className="grid-2">
                <div><div className="muted small">Hóa đơn</div><strong>{money(result.redemption.billAmount)}</strong></div>
                <div><div className="muted small">Được giảm</div><strong>{money(result.redemption.discountAmount)}</strong></div>
                <div><div className="muted small">Voucher</div><strong>{result.voucher?.title}</strong></div>
                <div><div className="muted small">Lượt</div><strong>#{result.redemption.sequence} · còn {result.remainingUses}/{result.voucher?.usageLimit}</strong></div>
              </div>
              <div className="row gap wrap">
                {result.remainingUses > 0 ? (
                  <button type="button" className="btn btn-outline" onClick={nextUse}>
                    Xác nhận thêm 1 lượt với mã này
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={resetAll}>
                  Khách tiếp theo
                </button>
              </div>
            </div>
          ) : (
            <>
              <Field label="Tổng hóa đơn (VND)" hint="Mỗi lần xác nhận dùng 1 lượt và áp dụng quyền lợi của 1 vé.">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={bill}
                  onChange={(e) => { invalidateKey(); setBill(e.target.value); }}
                  style={{ fontSize: 20, fontWeight: 700 }}
                  required
                />
              </Field>
              <Alert>{error}</Alert>
              {canRetry ? <Alert tone="warning">Mất kết nối — bấm “Thử lại” sẽ gửi lại đúng yêu cầu cũ, không trừ thêm lượt.</Alert> : null}
              <button className="btn btn-lg" disabled={!ready || busy}>
                {busy ? 'Đang xác nhận…' : canRetry ? 'Thử lại' : 'Xác nhận sử dụng 1 lượt'}
              </button>
              {!code ? <div className="muted small">Quét QR hoặc nhập OTP của khách trước.</div> : null}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
