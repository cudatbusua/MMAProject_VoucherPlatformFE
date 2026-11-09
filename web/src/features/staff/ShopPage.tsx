import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { benefit, date, money, typeLabel } from '../../components/format';
import { staffUnitPrice } from '../../components/priceRules';
import { Alert, Badge, Empty, Field, Loadable, Modal, PageHeader, useLoad } from '../../components/ui';
import { api, ApiError } from '../../services/api';
import { useAuth } from '../../services/auth';
import type { PublicCampaign, StaffPrice } from '../../types';
import { useMyBrandIds } from './useMyBrandIds';

export function ShopPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(true);
  const brands = useMyBrandIds();
  const list = useLoad(() => api.search({ q: query || undefined, sort: 'newest', limit: 100 }), [query]);
  const [buying, setBuying] = useState<PublicCampaign | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const items = (list.data?.items ?? []).filter((c) => !onlyMine || brands.ids.has(c.brandId.id));

  return (
    <div className="stack">
      <PageHeader
        title="Mua voucher"
        subtitle="Nhân viên mua voucher như khách hàng. Với voucher của thương hiệu bạn đang làm, nhập mã nhân viên để được giá ưu đãi."
      />
      <div className="row gap wrap">
        <input placeholder="Tìm voucher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <label className="row gap small">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} style={{ width: 'auto' }} />
          Chỉ thương hiệu của tôi
        </label>
        <span className="muted small">{items.length} voucher</span>
      </div>
      <Loadable loading={(list.loading && !list.data) || brands.loading} error={list.error}>
        {items.length ? (
          <div className="shop-grid">
            {items.map((c) => {
              const mine = brands.ids.has(c.brandId.id);
              const staffOk = mine && c.staffDiscountPercent > 0;
              return (
                <button key={c.id} className="card shop-card" onClick={() => setBuying(c)}>
                  <div className="row gap wrap">
                    <Badge tone="info">{typeLabel[c.voucherType]}</Badge>
                    {staffOk ? <Badge tone="success">Ưu đãi NV -{c.staffDiscountPercent}%</Badge> : null}
                    {c.remainingStock <= 0 ? <Badge tone="danger">Hết hàng</Badge> : null}
                  </div>
                  <strong>{c.title}</strong>
                  <span className="muted small">{c.brandId.name}</span>
                  <span className="small">{benefit(c)}</span>
                  <div className="row gap">
                    <span className="shop-price">{money(c.salePrice)}</span>
                    <span className="strike small">{money(c.faceValue)}</span>
                  </div>
                  {staffOk ? (
                    <span className="small" style={{ color: 'var(--success)' }}>
                      Giá nhân viên: <strong>{money(staffUnitPrice(c.salePrice, c.staffDiscountPercent))}</strong>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <Empty>{onlyMine ? 'Thương hiệu của bạn chưa có voucher đang bán. Bỏ chọn “Chỉ thương hiệu của tôi” để xem tất cả.' : 'Không có voucher.'}</Empty>
        )}
      </Loadable>
      {buying ? <PurchaseModal campaign={buying} mine={brands.ids.has(buying.brandId.id)} onClose={() => setBuying(null)} /> : null}
    </div>
  );
}

function PurchaseModal({ campaign, mine, onClose }: { campaign: PublicCampaign; mine: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<StaffPrice | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per checkout attempt; reused only when retrying after a network failure.
  const key = useRef<string | null>(null);
  const max = Math.max(0, Math.min(campaign.limitPerUser, campaign.remainingStock));
  const unit = applied?.staffPrice ?? campaign.salePrice;
  const staffAvailable = mine && campaign.staffDiscountPercent > 0;

  const reset = () => {
    key.current = null;
    setError(null);
  };

  async function apply() {
    setChecking(true);
    setCodeError(null);
    setApplied(null);
    reset();
    try {
      setApplied(await api.staffPrice(campaign.id, code.trim().toUpperCase()));
    } catch (e) {
      setCodeError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function order() {
    if (code.trim() && !applied) {
      setError('Bấm “Áp dụng” để kiểm tra mã nhân viên, hoặc xóa mã để mua giá thường.');
      return;
    }
    key.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const o = await api.createOrder({
        campaignId: campaign.id,
        quantity: qty,
        idempotencyKey: key.current,
        ...(applied ? { employeeCode: code.trim().toUpperCase() } : {}),
      });
      navigate('/staff/orders?open=' + o.id);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status !== 0 && status < 500) key.current = null;
      setError((e as Error).message + (status === 0 ? ' Bấm “Đặt đơn” lần nữa để thử lại (không tạo trùng đơn).' : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={campaign.title} onClose={onClose}>
      <div className="stack">
        <div className="row gap wrap">
          <Badge tone="info">{typeLabel[campaign.voucherType]}</Badge>
          <span className="muted small">{campaign.brandId.name}</span>
        </div>
        <div>{benefit(campaign)}</div>
        <div className="muted small">
          Còn {Math.max(0, campaign.remainingStock)} vé · tối đa {campaign.limitPerUser} vé/người · hạn dùng {date(campaign.voucherExpireAt)}
        </div>

        <Field label="Số lượng">
          <div className="row gap">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { reset(); setQty((x) => Math.max(1, x - 1)); }}>−</button>
            <strong style={{ minWidth: 28, textAlign: 'center' }}>{qty}</strong>
            <button type="button" className="btn btn-outline btn-sm" disabled={qty >= max} onClick={() => { reset(); setQty((x) => Math.min(max, x + 1)); }}>+</button>
          </div>
        </Field>

        <Field
          label="Mã nhân viên (không bắt buộc)"
          hint={
            staffAvailable
              ? 'Voucher thuộc thương hiệu bạn làm việc: ưu đãi -' + campaign.staffDiscountPercent + '%.' + (user?.employeeCode ? ' Mã của bạn hiển thị ở góc dưới thanh bên trái.' : '')
              : mine
                ? 'Chiến dịch này không có ưu đãi nhân viên.'
                : 'Mã nhân viên chỉ áp dụng cho voucher thuộc thương hiệu bạn làm việc.'
          }
        >
          <div className="row gap">
            <input
              className="mono"
              value={code}
              placeholder="NV-XXXXXX"
              maxLength={9}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setApplied(null);
                setCodeError(null);
                reset();
              }}
            />
            <button type="button" className="btn btn-outline" disabled={!code.trim() || checking} onClick={() => void apply()}>
              {checking ? 'Đang kiểm tra…' : 'Áp dụng'}
            </button>
          </div>
        </Field>
        {codeError ? <Alert>{codeError}</Alert> : null}
        {applied ? <Alert tone="success">Đã áp dụng mã nhân viên: giảm {applied.percent}% mỗi vé.</Alert> : null}

        <div className="price-preview">
          <div>
            <span className="muted small">Đơn giá</span>
            <span>
              {applied ? <span className="strike small">{money(campaign.salePrice)}</span> : null} <strong>{money(unit)}</strong>
            </span>
          </div>
          <div>
            <span className="muted small">Tổng ({qty} vé)</span>
            <strong style={{ fontSize: 20 }}>{money(unit * qty)}</strong>
          </div>
        </div>
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
          <button className="btn btn-lg" disabled={busy || max < 1} onClick={() => void order()}>
            {busy ? 'Đang đặt…' : max < 1 ? 'Hết vé' : 'Đặt đơn'}
          </button>
        </div>
        <div className="muted small">Đơn được giữ chỗ 15 phút. Thanh toán DEMO, không phát sinh giao dịch thật.</div>
      </div>
    </Modal>
  );
}
