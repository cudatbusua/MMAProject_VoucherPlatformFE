import { dateTime, money, shortId } from '../../components/format';
import { Badge, Empty, Loadable, PageHeader, useLoad } from '../../components/ui';
import { api } from '../../services/api';

function useUserMap() {
  const users = useLoad(api.users);
  return (id: string) => users.data?.find((u) => u.id === id)?.email ?? shortId(id);
}

export function OrdersPage() {
  const orders = useLoad(api.adminOrders);
  const who = useUserMap();
  const tone = { PENDING: 'warning', FULFILLED: 'success', CANCELLED: 'neutral' } as const;
  const label = { PENDING: 'Chờ thanh toán', FULFILLED: 'Đã thanh toán', CANCELLED: 'Đã hủy' };
  return (
    <div className="stack">
      <PageHeader title="Đơn hàng" subtitle="200 đơn gần nhất" actions={<button className="btn btn-outline" onClick={() => void orders.reload()}>Làm mới</button>} />
      <Loadable loading={orders.loading && !orders.data} error={orders.error}>
        {orders.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Mã</th><th>Khách hàng</th><th>Voucher</th><th>Số vé</th><th>Tổng</th><th>Trạng thái</th><th>Thời gian</th></tr>
              </thead>
              <tbody>
                {orders.data.map((o) => (
                  <tr key={o.id}>
                    <td className="mono small">{shortId(o.id)}</td>
                    <td className="small">{who(o.customerId)}</td>
                    <td>{o.snapshot?.title}</td>
                    <td>{o.quantity}</td>
                    <td><strong>{money(o.totalAmount)}</strong></td>
                    <td><Badge tone={tone[o.status]}>{label[o.status]}</Badge></td>
                    <td className="small muted">{dateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Chưa có đơn hàng.</Empty>
        )}
      </Loadable>
    </div>
  );
}

export function RedemptionsPage() {
  const list = useLoad(api.adminRedemptions);
  const who = useUserMap();
  return (
    <div className="stack">
      <PageHeader title="Lượt sử dụng voucher" subtitle="200 lượt gần nhất" actions={<button className="btn btn-outline" onClick={() => void list.reload()}>Làm mới</button>} />
      <Loadable loading={list.loading && !list.data} error={list.error}>
        {list.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Thời gian</th><th>Voucher</th><th>Lượt</th><th>Nhân viên</th><th>Cách</th><th>Hóa đơn</th><th>Giảm</th></tr>
              </thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{dateTime(r.createdAt)}</td>
                    <td className="mono small">{shortId(r.voucherId)}</td>
                    <td>#{r.sequence} <span className="muted small">(còn {r.remainingAfter})</span></td>
                    <td className="small">{who(r.staffId)}</td>
                    <td><Badge tone="info">{r.method}</Badge></td>
                    <td>{money(r.billAmount)}</td>
                    <td><strong>{money(r.discountAmount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Chưa có lượt sử dụng.</Empty>
        )}
      </Loadable>
    </div>
  );
}

export function AuditPage() {
  const list = useLoad(api.audits);
  const who = useUserMap();
  return (
    <div className="stack">
      <PageHeader title="Nhật ký thao tác" subtitle="200 bản ghi gần nhất" actions={<button className="btn btn-outline" onClick={() => void list.reload()}>Làm mới</button>} />
      <Loadable loading={list.loading && !list.data} error={list.error}>
        {list.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr>
              </thead>
              <tbody>
                {list.data.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{dateTime(a.createdAt)}</td>
                    <td className="small">{who(a.actorId)}</td>
                    <td><span className="mono small">{a.action}</span></td>
                    <td className="mono small">{shortId(a.resourceId)}</td>
                    <td className="small">{a.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Chưa có nhật ký.</Empty>
        )}
      </Loadable>
    </div>
  );
}
