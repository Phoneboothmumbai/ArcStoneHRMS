import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth, routeForRole } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import PlatformDashboard from "./pages/PlatformDashboard";
import ResellerDashboard from "./pages/ResellerDashboard";
import HRDashboard from "./pages/HRDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import Employees from "./pages/Employees";
import OrgTree from "./pages/OrgTree";
import Approvals from "./pages/Approvals";
import Leave from "./pages/Leave";
import Attendance from "./pages/Attendance";
import ProductServiceRequests from "./pages/ProductServiceRequests";
import MySubmissions from "./pages/MySubmissions";
import Companies from "./pages/Companies";
import Resellers from "./pages/Resellers";
import Workflows from "./pages/Workflows";
import Modules from "./pages/Modules";
import BillingAndModules from "./pages/BillingAndModules";
import EmployeeProfile from "./pages/EmployeeProfile";
import Onboarding, { OnboardingDetail } from "./pages/Onboarding";
import Offboarding, { OffboardingDetail } from "./pages/Offboarding";
import KnowledgeBase, { KnowledgeBaseArticle, KBAdmin } from "./pages/KnowledgeBase";
import LeaveAdmin from "./pages/LeaveAdmin";
import AttendanceAdmin from "./pages/AttendanceAdmin";
import Notifications, { NotificationPreferences } from "./pages/Notifications";
import { ModulesProvider } from "./context/ModulesContext";

function RoleRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user && user !== false) navigate(routeForRole(user.role), { replace: true });
    if (user === false) navigate("/login", { replace: true });
  }, [user, navigate]);
  return <div className="h-screen w-screen flex items-center justify-center bg-zinc-100"><div className="tiny-label">Loading…</div></div>;
}

function App() {
  return (
    <AuthProvider>
      <ModulesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<RoleRedirect />} />

          <Route path="/app/platform" element={<ProtectedRoute roles={["super_admin"]}><PlatformDashboard /></ProtectedRoute>} />
          <Route path="/app/resellers" element={<ProtectedRoute roles={["super_admin"]}><Resellers /></ProtectedRoute>} />
          <Route path="/app/companies" element={<ProtectedRoute roles={["super_admin", "reseller"]}><Companies /></ProtectedRoute>} />

          <Route path="/app/reseller" element={<ProtectedRoute roles={["reseller"]}><ResellerDashboard /></ProtectedRoute>} />

          <Route path="/app/hr" element={<ProtectedRoute roles={["company_admin", "country_head", "region_head"]}><HRDashboard /></ProtectedRoute>} />
          <Route path="/app/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
          <Route path="/app/employees/:id" element={<ProtectedRoute><EmployeeProfile /></ProtectedRoute>} />
          <Route path="/app/me" element={<ProtectedRoute><EmployeeProfile selfView /></ProtectedRoute>} />
          <Route path="/app/onboarding" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"]}><Onboarding /></ProtectedRoute>} />
          <Route path="/app/onboarding/:id" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"]}><OnboardingDetail /></ProtectedRoute>} />
          <Route path="/app/offboarding" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"]}><Offboarding /></ProtectedRoute>} />
          <Route path="/app/offboarding/:id" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"]}><OffboardingDetail /></ProtectedRoute>} />
          <Route path="/app/help" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
          <Route path="/app/help/:slug" element={<ProtectedRoute><KnowledgeBaseArticle /></ProtectedRoute>} />
          <Route path="/app/kb-admin" element={<ProtectedRoute roles={["super_admin"]}><KBAdmin /></ProtectedRoute>} />
          <Route path="/app/leave-admin" element={<ProtectedRoute roles={["super_admin","company_admin"]}><LeaveAdmin /></ProtectedRoute>} />
          <Route path="/app/attendance-admin" element={<ProtectedRoute roles={["super_admin","company_admin","branch_manager","country_head","region_head"]}><AttendanceAdmin /></ProtectedRoute>} />
          <Route path="/app/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/app/notification-prefs" element={<ProtectedRoute><NotificationPreferences /></ProtectedRoute>} />
          <Route path="/app/org-tree" element={<ProtectedRoute><OrgTree /></ProtectedRoute>} />

          <Route path="/app/manager" element={<ProtectedRoute roles={["branch_manager", "sub_manager", "assistant_manager"]}><ManagerDashboard /></ProtectedRoute>} />

          <Route path="/app/employee" element={<ProtectedRoute><EmployeeDashboard /></ProtectedRoute>} />

          <Route path="/app/approvals" element={<ProtectedRoute><Approvals /></ProtectedRoute>} />
          <Route path="/app/leave" element={<ProtectedRoute><Leave /></ProtectedRoute>} />
          <Route path="/app/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
          <Route path="/app/requests" element={<ProtectedRoute><ProductServiceRequests /></ProtectedRoute>} />
          <Route path="/app/my-submissions" element={<ProtectedRoute><MySubmissions /></ProtectedRoute>} />
          <Route path="/app/workflows" element={<ProtectedRoute roles={["super_admin", "company_admin", "country_head", "region_head"]}><Workflows /></ProtectedRoute>} />
          <Route path="/app/modules" element={<ProtectedRoute roles={["super_admin"]}><Modules /></ProtectedRoute>} />
          <Route path="/app/billing" element={<ProtectedRoute roles={["company_admin", "country_head", "region_head"]}><BillingAndModules /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ModulesProvider>
    </AuthProvider>
  );
}

export default App;
