import { useState } from 'react';
import { dateTime, money, shortId } from '../../components/format';
import { ReasonDialog } from '../../components/ReasonDialog';
import { Alert, Empty, Loadable, PageHeader, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Refund } from '../../types';

export function RefundsPage() {
  const refunds = useLoad(api.pendingRefunds);
  const users = useLoad(api.users);
  const [dialog, setDialog] = useState<{ kind: 'confirm' | 'reject'; refund: Refund } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const customer = (id: string) => users.data?.find((u) => u.id === id)?.email ?? shortId(id);

  return (
    <div className="stack">
      <PageHeader
        title="Hoàn tiền thủ công"
        subtitle="Xác nhận chỉ ghi nhận hoàn tiền demo/thủ công, hệ thống không chuyển tiền."
        actions={<button className="btn btn-outline" onClick={() => void refunds.reload()}>Làm mới</button>}
      />
      <Alert tone="success">{msg}</Alert>
      <Loadable loading={refunds.loading && !refunds.data} error={refunds.error}>
        {refunds.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Voucher</th>
                  <th>Số tiền</th>
                  <th>Lý do</th>
                  <th>Gửi lúc</th>
                  <th className="right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {refunds.data.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{customer(r.customerId)}</td>
                    <td className="mono small">{shortId(r.voucherId)}</td>
                    <td><strong>{money(r.amount)}</strong></td>
                    <td className="small">{r.reason}</td>
                    <td className="small muted">{dateTime(r.createdAt)}</td>
                    <td className="right">
                      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-success btn-sm" onClick={() => setDialog({ kind: 'confirm', refund: r })}>Xác nhận đã hoàn</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: 'reject', refund: r })}>Từ chối</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Không có yêu cầu hoàn tiền đang chờ.</Empty>
        )}
      </Loadable>
      {dialog ? (
        <ReasonDialog
          title={dialog.kind === 'confirm' ? 'Xác nhận hoàn ' + money(dialog.refund.amount) : 'Từ chối hoàn tiền'}
          label={dialog.kind === 'confirm' ? 'Mã tham chiếu (giao dịch thủ công)' : 'Lý do từ chối'}
          confirmText={dialog.kind === 'confirm' ? 'Xác nhận' : 'Từ chối'}
          danger={dialog.kind === 'reject'}
          onClose={() => setDialog(null)}
          onSubmit={async (text) => {
            const r =
              dialog.kind === 'confirm'
                ? await api.confirmRefund(dialog.refund.id, text)
                : await api.rejectRefund(dialog.refund.id, text);
            setMsg(r.message);
            await refunds.reload();
          }}
        />
      ) : null}
    </div>
  );
}
