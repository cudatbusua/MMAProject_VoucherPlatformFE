import { benefit, campaignStatus, dateTime, money, typeLabel } from './format';
import { staffUnitPrice } from './priceRules';
import { Badge } from './ui';
import type { Campaign, Store } from '../types';

export function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  const [label, tone] = campaignStatus[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Read-only summary used in review dialogs. */
export function CampaignSummary({ c, stores }: { c: Campaign; stores?: Store[] }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row gap wrap">
        <Badge tone="info">{typeLabel[c.voucherType]}</Badge>
        <Badge>{c.category}</Badge>
        <CampaignStatusBadge status={c.status} />
      </div>
      <div>
        <h3>{c.title}</h3>
        <div>{benefit(c)}</div>
      </div>
      <div className="grid-2">
        <div><span className="muted small">Giá bán</span><div><strong>{money(c.salePrice)}</strong></div></div>
        <div><span className="muted small">Giá trị</span><div><strong>{money(c.faceValue)}</strong></div></div>
        <div><span className="muted small">Số lượng phát hành</span><div>{c.totalQuantity} (đã bán {c.soldQuantity}, giữ chỗ {c.reservedQuantity})</div></div>
        <div><span className="muted small">Giới hạn mỗi người</span><div>{c.limitPerUser}</div></div>
        <div>
          <span className="muted small">Ưu đãi nhân viên</span>
          <div>{c.staffDiscountPercent ? '-' + c.staffDiscountPercent + '% → ' + money(staffUnitPrice(c.salePrice, c.staffDiscountPercent)) : 'Không áp dụng'}</div>
        </div>
        <div><span className="muted small">Mở bán</span><div>{dateTime(c.saleStartAt)} → {dateTime(c.saleEndAt)}</div></div>
        <div><span className="muted small">Hạn sử dụng</span><div>{dateTime(c.voucherExpireAt)}</div></div>
      </div>
      {c.description ? <div><span className="muted small">Mô tả</span><div style={{ whiteSpace: 'pre-wrap' }}>{c.description}</div></div> : null}
      {c.terms ? <div><span className="muted small">Điều kiện</span><div style={{ whiteSpace: 'pre-wrap' }}>{c.terms}</div></div> : null}
      <div>
        <span className="muted small">Cửa hàng áp dụng</span>
        <div>{stores ? c.storeIds.map((id) => stores.find((s) => s.id === id)?.name ?? id.slice(-6)).join(', ') : c.storeIds.length + ' cửa hàng'}</div>
      </div>
      {c.rejectReason ? <div className="alert alert-warning">Lý do từ chối trước: {c.rejectReason}</div> : null}
    </div>
  );
}
