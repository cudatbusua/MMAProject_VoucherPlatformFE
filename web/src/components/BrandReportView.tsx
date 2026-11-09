import { money } from './format';
import { Loadable, Stat, useLoad } from './ui';
import { api } from '../services/api';

export function BrandReportView({ brandId }: { brandId: string }) {
  const report = useLoad(() => api.brandReport(brandId), [brandId]);
  const r = report.data;
  return (
    <div className="stack">
      <div className="row gap">
        <h2 className="grow">Số liệu kinh doanh</h2>
        <button className="btn btn-outline btn-sm" onClick={() => void report.reload()}>
          Làm mới
        </button>
      </div>
      <Loadable loading={report.loading && !r} error={report.error}>
        {r ? (
          <div className="grid-stats">
            <Stat label="Doanh thu gộp" value={money(r.grossRevenue)} />
            <Stat label="Đã hoàn tiền" value={money(r.refundedAmount)} />
            <Stat label="Doanh thu ròng" value={money(r.netRevenue)} />
            <Stat label="Đơn đã thanh toán" value={r.paidOrders} />
            <Stat label="Vé đã bán" value={r.ticketsSold} />
            <Stat label="Đơn giá nhân viên" value={r.staffOrders} />
            <Stat label="Voucher đã cấp" value={r.vouchersIssued} />
            <Stat label="Lượt sử dụng" value={r.redemptions} />
            <Stat label="Chiến dịch" value={r.campaigns} />
          </div>
        ) : null}
      </Loadable>
    </div>
  );
}
