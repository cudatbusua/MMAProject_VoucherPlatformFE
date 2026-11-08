import { useState } from 'react';
import { CampaignSummary } from '../../components/CampaignView';
import { dateTime, money, typeLabel } from '../../components/format';
import { ReasonDialog } from '../../components/ReasonDialog';
import { Alert, Empty, Loadable, Modal, PageHeader, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Campaign } from '../../types';

export function AdminCampaignsPage() {
  const pending = useLoad(api.pendingCampaigns);
  const brands = useLoad(api.brands);
  const [view, setView] = useState<Campaign | null>(null);
  const [rejecting, setRejecting] = useState<Campaign | null>(null);
  const { busy, error, run } = useAction();
  const brandName = (id: string) => brands.data?.find((b) => b.id === id)?.name ?? id.slice(-6);

  async function approve(c: Campaign) {
    const ok = await run(c.id, () => api.approveCampaign(c.id));
    if (ok) {
      setView(null);
      await pending.reload();
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Duyệt chiến dịch"
        subtitle="Chiến dịch được duyệt sẽ tự mở bán khi tới thời gian bán."
        actions={<button className="btn btn-outline" onClick={() => void pending.reload()}>Làm mới</button>}
      />
      <Alert>{error}</Alert>
      <Loadable loading={pending.loading && !pending.data} error={pending.error}>
        {pending.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chiến dịch</th>
                  <th>Thương hiệu</th>
                  <th>Loại</th>
                  <th>Giá bán / giá trị</th>
                  <th>Thời gian bán</th>
                  <th className="right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pending.data.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.title}</strong><div className="sub">{c.category} · {c.totalQuantity} vé</div></td>
                    <td className="small">{brandName(c.brandId)}</td>
                    <td>{typeLabel[c.voucherType]}</td>
                    <td>{money(c.salePrice)} <span className="muted">/ {money(c.faceValue)}</span></td>
                    <td className="small">{dateTime(c.saleStartAt)}<br />→ {dateTime(c.saleEndAt)}</td>
                    <td className="right">
                      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setView(c)}>Xem</button>
                        <button className="btn btn-success btn-sm" disabled={!!busy} onClick={() => void approve(c)}>Duyệt</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setRejecting(c)}>Từ chối</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Không có chiến dịch nào đang chờ duyệt.</Empty>
        )}
      </Loadable>
      {view ? (
        <Modal title="Chi tiết chiến dịch" onClose={() => setView(null)} wide>
          <CampaignSummary c={view} />
          <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-danger" onClick={() => { setRejecting(view); setView(null); }}>Từ chối</button>
            <button className="btn btn-success" disabled={!!busy} onClick={() => void approve(view)}>Duyệt chiến dịch</button>
          </div>
        </Modal>
      ) : null}
      {rejecting ? (
        <ReasonDialog
          title={'Từ chối: ' + rejecting.title}
          danger
          confirmText="Từ chối"
          onClose={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await api.rejectCampaign(rejecting.id, reason);
            await pending.reload();
          }}
        />
      ) : null}
    </div>
  );
}
