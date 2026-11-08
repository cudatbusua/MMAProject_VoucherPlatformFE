import { BrandReportView } from '../../components/BrandReportView';
import { BrandPicker, useMyBrand } from '../../components/useMyBrand';
import { Alert, Empty, Loadable, PageHeader } from '../../components/ui';

export function OwnerReportPage() {
  const state = useMyBrand();
  return (
    <div className="stack">
      <PageHeader
        title="Báo cáo thương hiệu"
        subtitle="Chủ thương hiệu chỉ xem số liệu. Chiến dịch, cửa hàng và nhân viên do quản lý thương hiệu vận hành."
        actions={<BrandPicker state={state} />}
      />
      <Loadable loading={state.brands.loading && !state.brands.data} error={state.brands.error}>
        {state.brand ? (
          <>
            {state.brand.status !== 'APPROVED' ? (
              <Alert tone="warning">
                Thương hiệu đang ở trạng thái {state.brand.status}
                {state.brand.reason ? ' — ' + state.brand.reason : ''}. Chiến dịch không hiển thị công khai.
              </Alert>
            ) : null}
            {state.brand.description ? <p className="muted" style={{ margin: 0 }}>{state.brand.description}</p> : null}
            <BrandReportView brandId={state.brand.id} />
          </>
        ) : (
          <Empty>Bạn chưa sở hữu thương hiệu nào. Liên hệ quản trị viên.</Empty>
        )}
      </Loadable>
    </div>
  );
}
