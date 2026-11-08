import { Link } from 'react-router-dom';
import { BrandReportView } from '../../components/BrandReportView';
import { campaignStatus } from '../../components/format';
import { BrandPicker, useMyBrand } from '../../components/useMyBrand';
import { Alert, Empty, Loadable, PageHeader, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { CampaignStatus } from '../../types';

export function ManagerDashboard() {
  const state = useMyBrand();
  const counts = useLoad(async () => {
    if (!state.brandId) return null;
    const [campaigns, stores, staff] = await Promise.all([
      api.campaigns(state.brandId),
      api.stores(state.brandId),
      api.staff(state.brandId),
    ]);
    const byStatus: Partial<Record<CampaignStatus, number>> = {};
    campaigns.forEach((c) => (byStatus[c.status] = (byStatus[c.status] ?? 0) + 1));
    return { byStatus, stores: stores.filter((s) => s.active).length, staff: staff.length };
  }, [state.brandId]);

  return (
    <div className="stack">
      <PageHeader title="Tổng quan thương hiệu" actions={<BrandPicker state={state} />} />
      <Loadable loading={state.brands.loading && !state.brands.data} error={state.brands.error}>
        {state.brand ? (
          <>
            {state.brand.status !== 'APPROVED' ? (
              <Alert tone="warning">Thương hiệu chưa được duyệt hoặc đang bị đình chỉ — chưa thể gửi duyệt chiến dịch.</Alert>
            ) : null}
            {counts.data ? (
              <div className="grid-stats">
                {(Object.keys(campaignStatus) as CampaignStatus[]).map((s) => (
                  <Link key={s} to="/manager/campaigns" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="muted small">Chiến dịch {campaignStatus[s][0].toLowerCase()}</div>
                    <div className="stat-value">{counts.data!.byStatus[s] ?? 0}</div>
                  </Link>
                ))}
                <Link to="/manager/stores" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="muted small">Cửa hàng hoạt động</div>
                  <div className="stat-value">{counts.data.stores}</div>
                </Link>
                <Link to="/manager/staff" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="muted small">Nhân viên</div>
                  <div className="stat-value">{counts.data.staff}</div>
                </Link>
              </div>
            ) : null}
            <BrandReportView brandId={state.brand.id} />
          </>
        ) : (
          <Empty>Bạn chưa được phân công thương hiệu nào. Liên hệ quản trị viên.</Empty>
        )}
      </Loadable>
    </div>
  );
}
