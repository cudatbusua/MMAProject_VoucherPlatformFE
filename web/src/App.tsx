import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { homeFor, Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AccountsPage } from './features/admin/AccountsPage';
import { AdminBrandsPage } from './features/admin/BrandsPage';
import { AdminCampaignsPage } from './features/admin/CampaignsPage';
import { AdminDashboard } from './features/admin/Dashboard';
import { AuditPage, OrdersPage, RedemptionsPage } from './features/admin/Logs';
import { RefundsPage } from './features/admin/RefundsPage';
import { LoginPage } from './features/auth/LoginPage';
import { ManagerCampaignsPage } from './features/manager/CampaignsPage';
import { ManagerDashboard } from './features/manager/Dashboard';
import { StaffAccountsPage } from './features/manager/StaffPage';
import { StoresPage } from './features/manager/StoresPage';
import { OwnerReportPage } from './features/owner/ReportPage';
import { StaffHistoryPage } from './features/staff/HistoryPage';
import { RedeemPage } from './features/staff/RedeemPage';
import { AuthProvider, useAuth } from './services/auth';
import type { Role } from './types';

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/admin" element={<Guard role="ADMIN"><AdminDashboard /></Guard>} />
        <Route path="/admin/accounts" element={<Guard role="ADMIN"><AccountsPage /></Guard>} />
        <Route path="/admin/brands" element={<Guard role="ADMIN"><AdminBrandsPage /></Guard>} />
        <Route path="/admin/campaigns" element={<Guard role="ADMIN"><AdminCampaignsPage /></Guard>} />
        <Route path="/admin/refunds" element={<Guard role="ADMIN"><RefundsPage /></Guard>} />
        <Route path="/admin/orders" element={<Guard role="ADMIN"><OrdersPage /></Guard>} />
        <Route path="/admin/redemptions" element={<Guard role="ADMIN"><RedemptionsPage /></Guard>} />
        <Route path="/admin/audit" element={<Guard role="ADMIN"><AuditPage /></Guard>} />

        <Route path="/owner" element={<Guard role="BRAND_OWNER"><OwnerReportPage /></Guard>} />

        <Route path="/manager" element={<Guard role="BRAND_MANAGER"><ManagerDashboard /></Guard>} />
        <Route path="/manager/campaigns" element={<Guard role="BRAND_MANAGER"><ManagerCampaignsPage /></Guard>} />
        <Route path="/manager/stores" element={<Guard role="BRAND_MANAGER"><StoresPage /></Guard>} />
        <Route path="/manager/staff" element={<Guard role="BRAND_MANAGER"><StaffAccountsPage /></Guard>} />

        <Route path="/staff" element={<Guard role="STORE_STAFF"><RedeemPage /></Guard>} />
        <Route path="/staff/history" element={<Guard role="STORE_STAFF"><StaffHistoryPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
