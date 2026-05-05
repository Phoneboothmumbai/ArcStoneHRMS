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
import Payroll from "./pages/Payroll";
import PayrollRuns from "./pages/PayrollRuns";
import FnfAndLoans from "./pages/FnfAndLoans";
import Policies from "./pages/Policies";
import Letters from "./pages/Letters";
import Assets from "./pages/Assets";
import Expenses from "./pages/Expenses";
import PerformanceOverview, {
  PerformanceCycles, PerformanceGoals, PerformanceReviews,
  PerformanceNineBox, PerformancePIPs,
} from "./pages/Performance";
import RecruitmentOverview, {
  Requisitions, RequisitionDetail, Offers as RecruitmentOffers,
} from "./pages/Recruitment";
import ReportsOverview, { CompensationReport, ReportBuilder } from "./pages/Reports";
import Helpdesk, { TicketCategories, POSH } from "./pages/Helpdesk";
import ProcurementOverview, {
  VendorsPage, RFQsPage, RFQDetail,
  PurchaseOrdersPage, PurchaseOrderDetail,
} from "./pages/Procurement";
import VendorPortal from "./pages/VendorPortal";
import HRAlerts from "./pages/HRAlerts";
import LoanRequests from "./pages/LoanRequests";
import Insurance from "./pages/Insurance";
import Compliance from "./pages/Compliance";
import CompanySettings from "./pages/CompanySettings";
import LeavePlanner from "./pages/LeavePlanner";
import ResourceBooking from "./pages/ResourceBooking";
import VisitorManagement from "./pages/VisitorManagement";
import LiveTracking from "./pages/LiveTracking";
import OrgChart from "./pages/OrgChart";
import Branches from "./pages/Branches";
import EmploymentClasses from "./pages/EmploymentClasses";
import BranchOperations from "./pages/BranchOperations";
import BranchDashboard from "./pages/BranchDashboard";
import Budgets from "./pages/Budgets";
import JoiningKit from "./pages/JoiningKit";
import CompOff from "./pages/CompOff";
import InvestmentDeclarations from "./pages/InvestmentDeclarations";
import BulkEmployeeImport from "./pages/BulkEmployeeImport";
import AuditLog from "./pages/AuditLog";
import CompanyDetail from "./pages/CompanyDetail";
import ResellerDetail from "./pages/ResellerDetail";
import NotFound from "./pages/NotFound";
import ResellerStub from "./pages/ResellerStub";
import { ModulesProvider } from "./context/ModulesContext";
import { EmploymentClassProvider } from "./context/EmploymentClassContext";

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
      <EmploymentClassProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/vendor-portal" element={<VendorPortal />} />
          <Route path="/app" element={<RoleRedirect />} />

          <Route path="/app/platform" element={<ProtectedRoute roles={["super_admin"]}><PlatformDashboard /></ProtectedRoute>} />
          <Route path="/app/resellers" element={<ProtectedRoute roles={["super_admin"]}><Resellers /></ProtectedRoute>} />
          <Route path="/app/resellers/:id" element={<ProtectedRoute roles={["super_admin", "reseller"]}><ResellerDetail /></ProtectedRoute>} />
          <Route path="/app/companies" element={<ProtectedRoute roles={["super_admin", "reseller"]}><Companies /></ProtectedRoute>} />
          <Route path="/app/companies/:id" element={<ProtectedRoute roles={["super_admin", "reseller", "company_admin"]}><CompanyDetail /></ProtectedRoute>} />
          <Route path="/app/reseller/commissions" element={<ProtectedRoute roles={["reseller", "super_admin"]}><ResellerStub kind="commissions" /></ProtectedRoute>} />
          <Route path="/app/reseller/billing" element={<ProtectedRoute roles={["reseller", "super_admin"]}><ResellerStub kind="billing" /></ProtectedRoute>} />
          <Route path="/app/reseller/pricing" element={<ProtectedRoute roles={["reseller", "super_admin"]}><ResellerStub kind="pricing" /></ProtectedRoute>} />

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
          <Route path="/app/payroll" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><Payroll /></ProtectedRoute>} />
          <Route path="/app/payroll-runs" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><PayrollRuns /></ProtectedRoute>} />
          <Route path="/app/fnf-loans" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><FnfAndLoans /></ProtectedRoute>} />
          <Route path="/app/policies" element={<ProtectedRoute><Policies /></ProtectedRoute>} />
          <Route path="/app/letters" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><Letters /></ProtectedRoute>} />
          <Route path="/app/assets" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><Assets /></ProtectedRoute>} />
          <Route path="/app/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
          <Route path="/app/performance" element={<ProtectedRoute><PerformanceOverview /></ProtectedRoute>} />
          <Route path="/app/performance/goals" element={<ProtectedRoute><PerformanceGoals /></ProtectedRoute>} />
          <Route path="/app/performance/reviews" element={<ProtectedRoute><PerformanceReviews /></ProtectedRoute>} />
          <Route path="/app/performance/cycles" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><PerformanceCycles /></ProtectedRoute>} />
          <Route path="/app/performance/nine-box" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><PerformanceNineBox /></ProtectedRoute>} />
          <Route path="/app/performance/pips" element={<ProtectedRoute><PerformancePIPs /></ProtectedRoute>} />

          <Route path="/app/recruitment" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><RecruitmentOverview /></ProtectedRoute>} />
          <Route path="/app/recruitment/requisitions" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><Requisitions /></ProtectedRoute>} />
          <Route path="/app/recruitment/requisitions/:id" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><RequisitionDetail /></ProtectedRoute>} />
          <Route path="/app/recruitment/offers" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><RecruitmentOffers /></ProtectedRoute>} />

          <Route path="/app/reports" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><ReportsOverview /></ProtectedRoute>} />
          <Route path="/app/reports/compensation" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><CompensationReport /></ProtectedRoute>} />
          <Route path="/app/reports/builder" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><ReportBuilder /></ProtectedRoute>} />

          <Route path="/app/helpdesk" element={<ProtectedRoute><Helpdesk /></ProtectedRoute>} />
          <Route path="/app/helpdesk/categories" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><TicketCategories /></ProtectedRoute>} />
          <Route path="/app/posh" element={<ProtectedRoute><POSH /></ProtectedRoute>} />

          <Route path="/app/procurement" element={<ProtectedRoute><ProcurementOverview /></ProtectedRoute>} />
          <Route path="/app/procurement/vendors" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><VendorsPage /></ProtectedRoute>} />
          <Route path="/app/procurement/rfqs" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><RFQsPage /></ProtectedRoute>} />
          <Route path="/app/procurement/rfqs/:id" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><RFQDetail /></ProtectedRoute>} />
          <Route path="/app/procurement/purchase-orders" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><PurchaseOrdersPage /></ProtectedRoute>} />
          <Route path="/app/procurement/purchase-orders/:id" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><PurchaseOrderDetail /></ProtectedRoute>} />
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
          <Route path="/app/hr-alerts" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head"]}><HRAlerts /></ProtectedRoute>} />
          <Route path="/app/loan-requests" element={<ProtectedRoute><LoanRequests /></ProtectedRoute>} />
          <Route path="/app/insurance" element={<ProtectedRoute><Insurance /></ProtectedRoute>} />
          <Route path="/app/compliance" element={<ProtectedRoute><Compliance /></ProtectedRoute>} />
          <Route path="/app/company-settings" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />
          <Route path="/app/leave-planner" element={<ProtectedRoute><LeavePlanner /></ProtectedRoute>} />
          <Route path="/app/resource-booking" element={<ProtectedRoute><ResourceBooking /></ProtectedRoute>} />
          <Route path="/app/visitors" element={<ProtectedRoute><VisitorManagement /></ProtectedRoute>} />
          <Route path="/app/live-tracking" element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
          <Route path="/app/org-chart" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
          <Route path="/app/branches" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><Branches /></ProtectedRoute>} />
          <Route path="/app/employment-classes" element={<ProtectedRoute roles={["super_admin","company_admin"]}><EmploymentClasses /></ProtectedRoute>} />
          <Route path="/app/branch-operations" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"]}><BranchOperations /></ProtectedRoute>} />
          <Route path="/app/branch-dashboard" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"]}><BranchDashboard /></ProtectedRoute>} />
          <Route path="/app/budgets" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><Budgets /></ProtectedRoute>} />
          <Route path="/app/joining-kit" element={<ProtectedRoute roles={["super_admin","company_admin","country_head","region_head","branch_manager"]}><JoiningKit /></ProtectedRoute>} />
          <Route path="/app/comp-off" element={<ProtectedRoute><CompOff /></ProtectedRoute>} />
          <Route path="/app/declarations" element={<ProtectedRoute><InvestmentDeclarations /></ProtectedRoute>} />
          <Route path="/app/bulk-import" element={<ProtectedRoute roles={["super_admin","company_admin","country_head"]}><BulkEmployeeImport /></ProtectedRoute>} />
          <Route path="/app/audit-log" element={<ProtectedRoute roles={["super_admin","company_admin","reseller"]}><AuditLog /></ProtectedRoute>} />

          <Route path="/app/*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </EmploymentClassProvider>
      </ModulesProvider>
    </AuthProvider>
  );
}

export default App;
