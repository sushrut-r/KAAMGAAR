import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LanguageProvider, useLang } from './lib/i18n';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth, RequireRole, RoleRedirect } from './components/Guards';
import { HajriPage } from './components/HajriPage';
import { RatingsPage } from './components/RatingsPage';
import { ProfilePage } from './components/ProfilePage';

import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Onboarding from './pages/Onboarding';
import ForgotPassword from './pages/ForgotPassword';
import ChangePassword from './pages/ChangePassword';

import WorkerHome from './pages/worker/WorkerHome';
import WorkerJobs from './pages/worker/WorkerJobs';
import WorkerAvailability from './pages/worker/WorkerAvailability';
import WorkerApplications from './pages/worker/WorkerApplications';
import WorkerMyJobs from './pages/worker/WorkerMyJobs';
import WorkerEarnings from './pages/worker/WorkerEarnings';
import WorkerPortfolio from './pages/worker/WorkerPortfolio';

import EmployerHome from './pages/employer/EmployerHome';
import EmployerPostJob from './pages/employer/EmployerPostJob';
import EmployerWorkers from './pages/employer/EmployerWorkers';
import EmployerApplications from './pages/employer/EmployerApplications';
import EmployerJobs from './pages/employer/EmployerJobs';
import EmployerPayments from './pages/employer/EmployerPayments';

import {
  AdminAttendance,
  AdminDashboard,
  AdminDisputes,
  AdminResetRequests,
  AdminJobs,
  AdminPayments,
  AdminReviews,
  AdminUsers,
  AdminVerification,
} from './pages/admin/Admin';

function AppInner() {
  const { lang } = useLang();
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes key={lang}>
          {/* public */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth/:role" element={<Auth />} />
          <Route path="/onboarding/:role" element={<Onboarding />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/redirect" element={<RoleRedirect />} />

          {/* any signed-in role */}
          <Route element={<RequireAuth />}>
            <Route path="/change-password" element={<ChangePassword />} />
          </Route>

          {/* worker */}
          <Route element={<RequireRole role="worker" />}>
            <Route path="/worker" element={<WorkerHome />} />
            <Route path="/worker/jobs" element={<WorkerJobs />} />
            <Route path="/worker/availability" element={<WorkerAvailability />} />
            <Route path="/worker/applications" element={<WorkerApplications />} />
            <Route path="/worker/my-jobs" element={<WorkerMyJobs />} />
            <Route path="/worker/hajri" element={<HajriPage side="worker" />} />
            <Route path="/worker/earnings" element={<WorkerEarnings />} />
            <Route path="/worker/ratings" element={<RatingsPage side="worker" />} />
            <Route path="/worker/portfolio" element={<WorkerPortfolio />} />
            <Route path="/worker/profile" element={<ProfilePage side="worker" />} />
          </Route>

          {/* employer */}
          <Route element={<RequireRole role="employer" />}>
            <Route path="/employer" element={<EmployerHome />} />
            <Route path="/employer/post" element={<EmployerPostJob />} />
            <Route path="/employer/workers" element={<EmployerWorkers />} />
            <Route path="/employer/applications" element={<EmployerApplications />} />
            <Route path="/employer/jobs" element={<EmployerJobs />} />
            <Route path="/employer/hajri" element={<HajriPage side="employer" />} />
            <Route path="/employer/payments" element={<EmployerPayments />} />
            <Route path="/employer/reviews" element={<RatingsPage side="employer" />} />
            <Route path="/employer/profile" element={<ProfilePage side="employer" />} />
          </Route>

          {/* admin */}
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/attendance" element={<AdminAttendance />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
            <Route path="/admin/disputes" element={<AdminDisputes />} />
            <Route path="/admin/verification" element={<AdminVerification />} />
            <Route path="/admin/reset" element={<AdminResetRequests />} />
          </Route>

          {/* /chat is a legacy deep link: the layout opens the floating chat panel and
              redirects to the dashboard, so old notification links keep working */}
          <Route element={<RequireAuth />}>
            <Route path="/chat" element={null} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
