import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { benefit, date, dateTime, money, orderStatus } from '../../components/format';
import { mmss, useCountdown } from '../../components/useCountdown';
import { Alert, Badge, Empty, Loadable, Modal, PageHeader, Spinner, useAction, useLoad } from '../../components/ui';
import { api } from '../../services/api';
import type { Order } from '../../types';

export function MyOrdersPage() {
  const orders = useLoad(api.myOrders);
  const [params, setParams] = useSearchParams();
  const open = params.get('open');
  const close = () => {
    setParams({}, { replace: true });
    void orders.reload();
  };
  return (
    <div className="stack">
      <PageHeader
        title="Đơn của tôi"
        subtitle="Đơn mua voucher cá nhân. Đơn chờ thanh toán được giữ chỗ 15 phút."
        actions={<button className="btn btn-outline" onClick={() => void orders.reload()}>Làm mới</button>}
      />
      <Loadable loading={orders.loading && !orders.data} error={orders.error}>
        {orders.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Voucher</th><th>Số vé</th><th>Đơn giá</th><th>Tổng</th><th>Trạng thái</th><th>Đặt lúc</th><th /></tr>
              </thead>
              <tbody>
                {orders.data.map((o) => {
                  const [label, tone] = orderStatus[o.status];
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.snapshot.title}</strong>
                        {o.employeeCode ? <div className="sub">Giá nhân viên -{o.staffDiscountPercent}% · {o.employeeCode}</div> : null}
                      </td>
                      <td>{o.quantity}</td>
                      <td>
                        {o.listUnitPrice ? <span className="strike small">{money(o.listUnitPrice)}</span> : null} {money(o.unitPrice)}
                      </td>
                      <td><strong>{money(o.totalAmount)}</strong></td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td className="small muted">{dateTime(o.createdAt)}</td>
                      <td className="right">
                        <button className={'btn btn-sm ' + (o.status === 'PENDING' ? '' : 'btn-outline')} onClick={() => setParams({ open: o.id })}>
                          {o.status === 'PENDING' ? 'Thanh toán' : 'Xem'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            Chưa có đơn. <Link to="/staff/shop">Mua voucher</Link>
          </Empty>
        )}
      </Loadable>
      {open ? <OrderModal id={open} onClose={close} /> : null}
    </div>
  );
}

function OrderModal({ id, onClose }: { id: string; onClose: () => void }) {
  const order = useLoad(() => api.order(id), [id]);
  const { busy, error, run } = useAction();
  const [message, setMessage] = useState<string | null>(null);
  const o = order.data;
  const left = useCountdown(o?.status === 'PENDING' ? o.expiresAt : null);

  async function pay(o: Order) {
    await run('pay', async () => {
      const r = await api.payDemo(o.id);
      order.setData(r.order);
      setMessage(r.message);
    });
  }
  async function cancel(o: Order) {
    if (!window.confirm('Hủy đơn này và trả lại vé giữ chỗ?')) return;
    await run('cancel', async () => order.setData(await api.cancelOrder(o.id)));
  }

  return (
    <Modal title="Đơn hàng" onClose={onClose}>
      {!o ? (
        order.error ? <Alert>{order.error}</Alert> : <Spinner />
      ) : (
        <div className="stack">
          <div className="row gap">
            <h3 className="grow">{o.snapshot.title}</h3>
            <Badge tone={orderStatus[o.status][1]}>{orderStatus[o.status][0]}</Badge>
          </div>
          <div>{benefit(o.snapshot)}</div>
          <div className="grid-2 small">
            <div><span className="muted">Số vé:</span> {o.quantity}</div>
            <div>
              <span className="muted">Đơn giá:</span>{' '}
              {o.listUnitPrice ? <span className="strike">{money(o.listUnitPrice)}</span> : null} <strong>{money(o.unitPrice)}</strong>
            </div>
            <div><span className="muted">Tổng tiền:</span> <strong>{money(o.totalAmount)}</strong></div>
            <div><span className="muted">Hạn dùng voucher:</span> {date(o.snapshot.voucherExpireAt)}</div>
            {o.employeeCode ? (
              <div><span className="muted">Mã nhân viên:</span> <span className="mono">{o.employeeCode}</span> (-{o.staffDiscountPercent}%)</div>
            ) : null}
          </div>
          {o.status === 'PENDING' ? (
            <div className="card stack" style={{ gap: 10, borderColor: 'var(--warning)' }}>
              <strong style={{ color: left > 0 ? 'var(--warning)' : 'var(--danger)', textAlign: 'center' }}>
                {left > 0 ? 'Thời gian giữ chỗ còn ' + mmss(left) : 'Đơn đã hết thời gian giữ chỗ'}
              </strong>
              <button className="btn btn-lg" disabled={!!busy || left <= 0} onClick={() => void pay(o)}>
                {busy === 'pay' ? 'Đang thanh toán…' : 'Thanh toán demo ' + money(o.totalAmount)}
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => void cancel(o)}>
                Hủy đơn
              </button>
              <div className="muted small" style={{ textAlign: 'center' }}>Thanh toán DEMO, không phát sinh giao dịch thật.</div>
            </div>
          ) : null}
          <Alert tone="success">{message}</Alert>
          <Alert>{error}</Alert>
          {o.status === 'FULFILLED' ? (
            <Link className="btn" to="/staff/wallet" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Xem voucher trong ví
            </Link>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
