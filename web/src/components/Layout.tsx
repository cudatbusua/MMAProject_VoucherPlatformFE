import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../services/auth';
import type { Role } from '../types';
import { roleLabel } from './format';

const NAV: Record<Exclude<Role, 'CUSTOMER'>, [string, string][]> = {
  ADMIN: [
    ['/admin', 'Tổng quan'],
    ['/admin/accounts', 'Tài khoản'],
    ['/admin/brands', 'Thương hiệu'],
    ['/admin/campaigns', 'Duyệt chiến dịch'],
    ['/admin/refunds', 'Hoàn tiền'],
    ['/admin/orders', 'Đơn hàng'],
    ['/admin/redemptions', 'Lượt sử dụng'],
    ['/admin/audit', 'Nhật ký'],
  ],
  BRAND_OWNER: [['/owner', 'Báo cáo thương hiệu']],
  BRAND_MANAGER: [
    ['/manager', 'Tổng quan'],
    ['/manager/campaigns', 'Chiến dịch'],
    ['/manager/stores', 'Cửa hàng'],
    ['/manager/staff', 'Nhân viên'],
  ],
  STORE_STAFF: [
    ['/staff', 'Xác nhận voucher'],
    ['/staff/history', 'Lịch sử hôm nay'],
  ],
};

export function Layout() {
  const { user, logout } = useAuth();
  if (!user || user.role === 'CUSTOMER') return null;
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="logo">V</div>
          Voucher
        </div>
        {NAV[user.role].map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            {label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="who">
            <strong>{user.fullName || user.email}</strong>
            <span className="muted">{roleLabel[user.role]}</span>
          </div>
          <button className="btn btn-ghost" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export const homeFor = (role: Role) =>
  role === 'ADMIN' ? '/admin' : role === 'BRAND_OWNER' ? '/owner' : role === 'BRAND_MANAGER' ? '/manager' : '/staff';
