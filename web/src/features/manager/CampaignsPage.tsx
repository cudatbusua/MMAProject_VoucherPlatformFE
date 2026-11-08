import { useMemo, useState } from 'react';
import { CampaignStatusBadge, CampaignSummary } from '../../components/CampaignView';
import { campaignStatus, dateTime, money, typeLabel } from '../../components/format';
import { BrandPicker, useMyBrand } from '../../components/useMyBrand';
import { Alert, Empty, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Campaign, CampaignStatus } from '../../types';
import { CampaignForm } from './CampaignForm';

export function ManagerCampaignsPage() {
  const state = useMyBrand();
  const campaigns = useLoad(() => (state.brandId ? api.campaigns(state.brandId) : Promise.resolve([])), [state.brandId]);
  const stores = useLoad(() => (state.brandId ? api.stores(state.brandId) : Promise.resolve([])), [state.brandId]);
  const [filter, setFilter] = useState<CampaignStatus | ''>('');
  const [form, setForm] = useState<{ campaign?: Campaign } | null>(null);
  const [view, setView] = useState<Campaign | null>(null);
  const { busy, error, run } = useAction();

  const list = useMemo(
    () => (campaigns.data ?? []).filter((c) => !filter || c.status === filter),
    [campaigns.data, filter],
  );

  const act = (c: Campaign, action: 'submit' | 'withdraw' | 'pause' | 'resume') =>
    run(c.id + action, async () => {
      await api.campaignAction(c.id, action);
      await campaigns.reload();
    });

  return (
    <div className="stack">
      <PageHeader
        title="Chiến dịch"
        subtitle="Nháp → gửi duyệt → admin duyệt → tự mở bán theo thời gian. Sửa chiến dịch đã duyệt sẽ cần duyệt lại."
        actions={
          <>
            <BrandPicker state={state} />
            <button className="btn" disabled={!state.brandId} onClick={() => setForm({})}>
              + Tạo chiến dịch
            </button>
          </>
        }
      />
      <div className="row gap wrap">
        <select value={filter} onChange={(e) => setFilter(e.target.value as CampaignStatus | '')} style={{ maxWidth: 220 }}>
          <option value="">Tất cả trạng thái</option>
          {(Object.keys(campaignStatus) as CampaignStatus[]).map((s) => (
            <option key={s} value={s}>
              {campaignStatus[s][0]}
            </option>
          ))}
        </select>
        <span className="muted small">{list.length} chiến dịch</span>
      </div>
      <Alert>{error}</Alert>
      <Loadable loading={(campaigns.loading && !campaigns.data) || state.brands.loading} error={campaigns.error ?? state.brands.error}>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chiến dịch</th>
                  <th>Giá</th>
                  <th>Đã bán / tổng</th>
                  <th>Thời gian bán</th>
                  <th>Trạng thái</th>
                  <th className="right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="sub">{typeLabel[c.voucherType]} · {c.category}</div>
                    </td>
                    <td>{money(c.salePrice)}<div className="sub">/ {money(c.faceValue)}</div></td>
                    <td>
                      {c.soldQuantity} / {c.totalQuantity}
                      {c.reservedQuantity ? <div className="sub">giữ chỗ {c.reservedQuantity}</div> : null}
                    </td>
                    <td className="small">{dateTime(c.saleStartAt)}<br />→ {dateTime(c.saleEndAt)}</td>
                    <td>
                      <CampaignStatusBadge status={c.status} />
                      {c.status === 'DRAFT' && c.rejectReason ? <div className="sub" style={{ color: 'var(--danger)' }}>Bị từ chối: {c.rejectReason}</div> : null}
                    </td>
                    <td className="right">
                      <div className="row gap wrap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setView(c)}>Xem</button>
                        {['DRAFT', 'APPROVED', 'PUBLISHED', 'PAUSED'].includes(c.status) ? (
                          <button className="btn btn-outline btn-sm" onClick={() => setForm({ campaign: c })}>Sửa</button>
                        ) : null}
                        {c.status === 'DRAFT' ? (
                          <button className="btn btn-sm" disabled={!!busy} onClick={() => void act(c, 'submit')}>Gửi duyệt</button>
                        ) : null}
                        {c.status === 'PENDING' ? (
                          <button className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void act(c, 'withdraw')}>Rút về nháp</button>
                        ) : null}
                        {c.status === 'APPROVED' || c.status === 'PUBLISHED' ? (
                          <button className="btn btn-outline btn-sm" disabled={!!busy} onClick={() => void act(c, 'pause')}>Tạm dừng</button>
                        ) : null}
                        {c.status === 'PAUSED' ? (
                          <button className="btn btn-success btn-sm" disabled={!!busy} onClick={() => void act(c, 'resume')}>Mở lại</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{state.brandId ? 'Chưa có chiến dịch.' : 'Bạn chưa được phân công thương hiệu.'}</Empty>
        )}
      </Loadable>
      {form && state.brandId ? (
        <CampaignForm
          brandId={state.brandId}
          stores={stores.data ?? []}
          campaign={form.campaign}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void campaigns.reload();
          }}
        />
      ) : null}
      {view ? <CampaignDetail c={view} stores={stores.data ?? []} onClose={() => setView(null)} /> : null}
    </div>
  );
}

function CampaignDetail({ c, stores, onClose }: { c: Campaign; stores: Parameters<typeof CampaignSummary>[0]['stores']; onClose: () => void }) {
  const stock = useLoad(() => api.stock(c.id), [c.id]);
  return (
    <Modal title="Chi tiết chiến dịch" onClose={onClose} wide>
      <div className="stack">
        <Loadable loading={stock.loading} error={stock.error}>
          {stock.data ? (
            <div className="grid-stats">
              <div className="card"><div className="muted small">Tổng</div><div className="stat-value">{stock.data.total}</div></div>
              <div className="card"><div className="muted small">Đã bán</div><div className="stat-value">{stock.data.sold}</div></div>
              <div className="card"><div className="muted small">Giữ chỗ</div><div className="stat-value">{stock.data.reserved}</div></div>
              <div className="card"><div className="muted small">Còn lại</div><div className="stat-value">{stock.data.available}</div></div>
            </div>
          ) : null}
        </Loadable>
        <CampaignSummary c={c} stores={stores} />
      </div>
    </Modal>
  );
}
