import { dateTime, money, shortId } from '../../components/format';
import { Badge, Empty, Loadable, PageHeader, Stat, useLoad } from '../../components/ui';
import { api } from '../../services/api';

export function StaffHistoryPage() {
  const list = useLoad(api.todayHistory);
  const stores = useLoad(api.myStores);
  const storeName = (id: string) => stores.data?.find((s) => s.id === id)?.name ?? shortId(id);
  const rows = list.data ?? [];
  return (
    <div className="stack">
      <PageHeader
        title="Lịch sử xác nhận hôm nay"
        actions={<button className="btn btn-outline" onClick={() => void list.reload()}>Làm mới</button>}
      />
      <div className="grid-stats">
        <Stat label="Lượt đã xác nhận" value={rows.length} />
        <Stat label="Tổng hóa đơn" value={money(rows.reduce((s, r) => s + r.billAmount, 0))} />
        <Stat label="Tổng giảm" value={money(rows.reduce((s, r) => s + r.discountAmount, 0))} />
      </div>
      <Loadable loading={list.loading && !list.data} error={list.error}>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Thời gian</th><th>Cửa hàng</th><th>Voucher</th><th>Lượt</th><th>Cách</th><th>Hóa đơn</th><th>Giảm</th><th>Khách trả</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{dateTime(r.createdAt)}</td>
                    <td className="small">{storeName(r.storeId)}</td>
                    <td className="mono small">{shortId(r.voucherId)}</td>
                    <td>#{r.sequence} <span className="muted small">(còn {r.remainingAfter})</span></td>
                    <td><Badge tone="info">{r.method}</Badge></td>
                    <td>{money(r.billAmount)}</td>
                    <td>{money(r.discountAmount)}</td>
                    <td><strong>{money(r.billAmount - r.discountAmount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Hôm nay chưa xác nhận voucher nào.</Empty>
        )}
      </Loadable>
    </div>
  );
}
