import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Landing from '@/pages/Landing';
import PublicBooking from '@/pages/PublicBooking';
import Dashboard from '@/pages/Dashboard';
import Customers from '@/pages/Customers';
import Treatments from '@/pages/Treatments';
import Bookings from '@/pages/Bookings';
import Journals from '@/pages/Journals';
import Forms from '@/pages/Forms';
import HealthDeclarations from '@/pages/HealthDeclarations';
import POS from '@/pages/POS';
import ZReport from '@/pages/ZReport';
import Reports from '@/pages/Reports';
import Staff from '@/pages/Staff';
import Schedule from '@/pages/Schedule';
import AuditLog from '@/pages/AuditLog';
import ManagementSystem from '@/pages/ManagementSystem';
import Products from '@/pages/Products';
import GiftCards from '@/pages/GiftCards';
import Marketing from '@/pages/Marketing';
import Reviews from '@/pages/Reviews';
import Messages from '@/pages/Messages';
import Settings from '@/pages/Settings';
import CustomerDetail from '@/pages/CustomerDetail';
import BookingDetail from '@/pages/BookingDetail';
import Portal from '@/pages/Portal';
import AppShell from '@/components/AppShell';

const RoleRoute = ({ roles, children }) => {
  const { user, isLoadingAuth, authChecked } = useAuth();
  if (isLoadingAuth || !authChecked) return null;
  if (!user) return <Navigate to="/login" replace />;
  const staffRole = user.staff_role || user.data?.staff_role || "";
  const allowed = roles.includes(user.role) || (staffRole && roles.includes(staffRole));
  if (!allowed) return <Navigate to={user.role === "user" ? "/portal" : "/"} replace />;
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/book" element={<PublicBooking />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/portal" element={<RoleRoute roles={["user"]}><Portal /></RoleRoute>} />
        <Route element={<RoleRoute roles={["admin", "administratör", "behandlare", "reception"]}><AppShell /></RoleRoute>}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/customers" element={<Customers />} />
          <Route path="/app/customers/:id" element={<CustomerDetail />} />
          <Route path="/app/treatments" element={<Treatments />} />
          <Route path="/app/bookings" element={<Bookings />} />
          <Route path="/app/bookings/:id" element={<BookingDetail />} />
          <Route path="/app/journal" element={<Journals />} />
          <Route path="/app/forms" element={<Forms />} />
          <Route path="/app/health" element={<HealthDeclarations />} />
          <Route path="/app/pos" element={<POS />} />
          <Route path="/app/z-report" element={<ZReport />} />
          <Route path="/app/reports" element={<Reports />} />
          <Route path="/app/staff" element={<Staff />} />
          <Route path="/app/schedule" element={<Schedule />} />
          <Route path="/app/audit" element={<AuditLog />} />
          <Route path="/app/management" element={<ManagementSystem />} />
          <Route path="/app/products" element={<Products />} />
          <Route path="/app/gift-cards" element={<GiftCards />} />
          <Route path="/app/marketing" element={<Marketing />} />
          <Route path="/app/reviews" element={<Reviews />} />
          <Route path="/app/messages" element={<Messages />} />
          <Route path="/app/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App