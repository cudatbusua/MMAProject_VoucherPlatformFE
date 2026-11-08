import { Link } from 'react-router-dom';
import { money } from '../../components/format';
import { Loadable, PageHeader, Stat, useLoad } from '../../components/ui';
import { api } from '../../services/api';

export function AdminDashboard() {
  const report = useLoad(api.adminReport);
  const pending = useLoad(async () => {
    const [campaigns, refunds, brands] = await Promise.all([
      api.pendingCampaigns(),
      api.pendingRefunds(),
      api.brands(),
    ]);
    return {
      campaigns: campaigns.length,
      refunds: refunds.length,
      brands: brands.filter((b) => b.status === 'PENDING').length,
    };
  });
  const r = report.data;
  return (
    <div className="stack">
      <PageHeader
        title="Tổng quan hệ thống"
        subtitle="Thanh toán đang ở chế độ DEMO — không phát sinh giao dịch tiền thật."
        actions={<button className="btn btn-outline" onClick={() => { void report.reload(); void pending.reload(); }}>Làm mới</button>}
      />
      <Loadable loading={report.loading && !r} error={report.error}>
        {r ? (
          <div className="grid-stats">
            <Stat label="Doanh thu gộp" value={money(r.grossRevenue)} />
            <Stat label="Đã hoàn tiền" value={money(r.refundedAmount)} />
            <Stat label="Doanh thu ròng" value={money(r.netRevenue)} />
            <Stat label="Người dùng" value={r.users} />
            <Stat label="Đơn hàng" value={r.orders} />
            <Stat label="Voucher đã cấp" value={r.vouchers} />
            <Stat label="Lượt sử dụng" value={r.redeemed} />
            <Stat label="Chế độ thanh toán" value={r.paymentMode} />
          </div>
        ) : null}
      </Loadable>
      <h2>Việc cần xử lý</h2>
      <Loadable loading={pending.loading && !pending.data} error={pending.error}>
        {pending.data ? (
          <div className="grid-3">
            <Link to="/admin/campaigns" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted small">Chiến dịch chờ duyệt</div>
              <div className="stat-value">{pending.data.campaigns}</div>
            </Link>
            <Link to="/admin/refunds" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted small">Yêu cầu hoàn tiền</div>
              <div className="stat-value">{pending.data.refunds}</div>
            </Link>
            <Link to="/admin/brands" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted small">Thương hiệu chờ duyệt</div>
              <div className="stat-value">{pending.data.brands}</div>
            </Link>
          </div>
        ) : null}
      </Loadable>
    </div>
  );
}
