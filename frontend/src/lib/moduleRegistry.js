/**
 * Arcstone HRMS — Module Registry
 * Single source of truth mapping modules → their nav tree, icons, required roles, landing route.
 * Add a new entry here → a new module appears in the switcher + command palette automatically.
 */
import {
  HouseLine, UsersThree, TreeStructure, FolderSimpleStar, CalendarCheck, ClockClockwise,
  PackageIcon, Storefront, Buildings, ShieldCheck, FlowArrow, Stack, Receipt,
  UserCirclePlus, UserCircleMinus, UserCircle, CurrencyInr, Calendar, Handshake,
  BookBookmark, FileText, Laptop, AirplaneTilt, Gear, ChartBar, Briefcase, Target, Lock, Bell,
} from "@phosphor-icons/react";

// Helper role constants
export const ROLE_HR = ["super_admin", "company_admin", "country_head", "region_head"];
export const ROLE_MANAGER = [...ROLE_HR, "branch_manager", "sub_manager", "assistant_manager"];
export const ROLE_ANY = null; // means all authenticated users

/**
 * Each module has:
 *   id            — matches backend module_id (for entitlement gating). "core" = always on.
 *   label         — shown in switcher
 *   icon          — phosphor icon component
 *   color         — swatch color for switcher chip (tailwind class)
 *   landing       — default route when user switches to this module
 *   roles         — role allowlist; null = everyone
 *   entitlement   — backend module_id required; null = no gate (just RBAC)
 *   items         — sidebar nav when this module is active
 *   kind          — "workspace" (has own sidebar) or "inline" (just a nav link inside another module)
 */
export const MODULES = [
  // ────────────────── Always-on core modules ──────────────────
  {
    id: "people",
    label: "People",
    icon: UsersThree,
    color: "bg-indigo-100 text-indigo-700",
    landing: "/app/hr",
    roles: ROLE_HR,
    entitlement: null,
    description: "Employees, org structure, onboarding, offboarding.",
    items: [
      { to: "/app/hr",            label: "Overview",      icon: HouseLine },
      { to: "/app/hr-alerts",     label: "HR Alerts",     icon: Bell, roles: ROLE_HR },
      { to: "/app/employees",     label: "Directory",     icon: UsersThree },
      { to: "/app/org-chart",     label: "Org Chart",     icon: TreeStructure },
      { to: "/app/org-tree",      label: "Hierarchy map", icon: Stack },
      { to: "/app/branches",      label: "Locations",     icon: Buildings, roles: ROLE_HR },
      { to: "/app/onboarding",    label: "Onboarding",    icon: UserCirclePlus,  entitlement: "onboarding" },
      { to: "/app/offboarding",   label: "Offboarding",   icon: UserCircleMinus, entitlement: "onboarding" },
      { to: "/app/approvals",     label: "Approvals",     icon: ShieldCheck },
      { to: "/app/workflows",     label: "Workflows",     icon: FlowArrow },
      { to: "/app/company-settings", label: "Company settings", icon: Gear, roles: ROLE_HR },
    ],
  },
  {
    id: "time",
    label: "Time & Leave",
    icon: CalendarCheck,
    color: "bg-emerald-100 text-emerald-700",
    landing: "/app/attendance",
    roles: ROLE_MANAGER,
    entitlement: null,
    description: "Attendance, shifts, leave policies, holidays.",
    items: [
      { to: "/app/attendance",        label: "My Attendance",  icon: ClockClockwise },
      { to: "/app/leave",             label: "My Leave",       icon: CalendarCheck },
      { to: "/app/attendance-admin",  label: "Attendance Admin", icon: ClockClockwise, roles: ROLE_HR },
      { to: "/app/leave-admin",       label: "Leave Admin",      icon: CalendarCheck,   roles: ROLE_HR },
      { to: "/app/leave-planner",     label: "Team leave planner", icon: CalendarCheck, roles: ROLE_MANAGER },
    ],
  },
  // ────────────────── Paid modules ──────────────────
  {
    id: "payroll",
    label: "Payroll",
    icon: CurrencyInr,
    color: "bg-amber-100 text-amber-700",
    landing: "/app/payroll-runs",
    roles: ROLE_HR,
    entitlement: "payroll",
    description: "India payroll: structures, monthly runs, statutory exports, F&F, loans.",
    items: [
      { to: "/app/payroll",        label: "Compensation",  icon: CurrencyInr },
      { to: "/app/payroll-runs",   label: "Payroll Runs",  icon: Calendar },
      { to: "/app/fnf-loans",      label: "F&F & Loans",   icon: Handshake },
      { to: "/app/loan-requests",  label: "Loan Requests", icon: Handshake },
      { to: "/app/compliance",     label: "Compliance",    icon: ShieldCheck, roles: ROLE_HR },
      { to: "/app/insurance",      label: "Insurance",     icon: ShieldCheck },
    ],
  },
  {
    id: "expense",
    label: "Expenses & Travel",
    icon: AirplaneTilt,
    color: "bg-sky-100 text-sky-700",
    landing: "/app/expenses",
    roles: ROLE_ANY,
    entitlement: "expense",
    description: "Expense claims, receipts, reimbursements, travel requests.",
    items: [
      { to: "/app/expenses",       label: "Claims & Travel", icon: AirplaneTilt },
    ],
  },
  {
    id: "assets",
    label: "Assets",
    icon: Laptop,
    color: "bg-violet-100 text-violet-700",
    landing: "/app/assets",
    roles: ROLE_HR,
    entitlement: null,
    description: "Laptops, phones, access cards. Depreciation & assignment.",
    items: [
      { to: "/app/assets", label: "Asset Register", icon: Laptop },
    ],
  },
  {
    id: "workplace",
    label: "Workplace",
    icon: Buildings,
    color: "bg-cyan-100 text-cyan-700",
    landing: "/app/resource-booking",
    roles: ROLE_ANY,
    entitlement: null,
    description: "Resource booking, visitor management — front-desk operations.",
    items: [
      { to: "/app/resource-booking", label: "Resource booking", icon: Calendar },
      { to: "/app/visitors",         label: "Visitor management", icon: UserCirclePlus, roles: ROLE_HR },
    ],
  },
  {
    id: "documents",
    label: "Policies & Letters",
    icon: FileText,
    color: "bg-fuchsia-100 text-fuchsia-700",
    landing: "/app/letters",
    roles: ROLE_ANY,
    entitlement: null,
    description: "Offer letters, experience letters, policies with e-sign & acks.",
    items: [
      { to: "/app/letters",  label: "Letters",  icon: FileText, roles: ROLE_HR },
      { to: "/app/policies", label: "Policies", icon: BookBookmark },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: PackageIcon,
    color: "bg-orange-100 text-orange-700",
    landing: "/app/procurement",
    roles: ROLE_ANY,
    entitlement: "procurement",
    description: "Vendors, RFQs, sealed-bid quotes, PO chain with approvals, vendor portal.",
    items: [
      { to: "/app/procurement",              label: "Overview",     icon: PackageIcon },
      { to: "/app/procurement/vendors",      label: "Vendors",      icon: Storefront,   roles: ROLE_MANAGER },
      { to: "/app/procurement/rfqs",         label: "RFQs",         icon: FileText,     roles: ROLE_MANAGER },
      { to: "/app/procurement/purchase-orders", label: "POs",       icon: Receipt,      roles: ROLE_MANAGER },
      { to: "/app/requests",                 label: "My requests",  icon: FolderSimpleStar },
    ],
  },
  {
    id: "ats",
    label: "Recruitment",
    icon: Briefcase,
    color: "bg-teal-100 text-teal-700",
    landing: "/app/recruitment",
    roles: ROLE_MANAGER,
    entitlement: "ats",
    description: "Job requisitions, candidates, interviews, offers, auto-convert to employees.",
    items: [
      { to: "/app/recruitment",                label: "Overview",         icon: Briefcase },
      { to: "/app/recruitment/requisitions",   label: "Requisitions",     icon: FolderSimpleStar },
      { to: "/app/recruitment/offers",         label: "Offers",           icon: FileText,    roles: ROLE_HR },
    ],
  },
  {
    id: "reports",
    label: "Reports & MIS",
    icon: ChartBar,
    color: "bg-slate-200 text-slate-700",
    landing: "/app/reports",
    roles: ROLE_HR,
    entitlement: "analytics",
    description: "Headcount, attrition, tenure, compensation bands, custom builder, CSV export.",
    items: [
      { to: "/app/reports",              label: "Dashboard",        icon: ChartBar },
      { to: "/app/reports/compensation", label: "Compensation",     icon: CurrencyInr },
      { to: "/app/reports/builder",      label: "Custom builder",   icon: Stack },
    ],
  },
  {
    id: "helpdesk",
    label: "Helpdesk",
    icon: ShieldCheck,
    color: "bg-rose-100 text-rose-700",
    landing: "/app/helpdesk",
    roles: ROLE_ANY,
    entitlement: "helpdesk",
    description: "Employee tickets with categories, SLAs, and confidential PoSH complaints.",
    items: [
      { to: "/app/helpdesk",             label: "Tickets",          icon: ShieldCheck },
      { to: "/app/helpdesk/categories",  label: "Categories",       icon: Stack,       roles: ROLE_HR },
      { to: "/app/posh",                 label: "PoSH",             icon: ShieldCheck },
    ],
  },
  // ────────────────── Admin / Settings ──────────────────
  {
    id: "admin",
    label: "Settings",
    icon: Gear,
    color: "bg-zinc-200 text-zinc-800",
    landing: "/app/billing",
    roles: ROLE_HR,
    entitlement: null,
    description: "Modules, billing, tenant configuration.",
    items: [
      { to: "/app/billing", label: "Billing & Modules", icon: Receipt },
    ],
  },
  // ────────────────── Upgrade-only (greyed out until enabled) ──────────────────
  {
    id: "performance",
    label: "Performance",
    icon: Target,
    color: "bg-pink-100 text-pink-700",
    landing: "/app/performance",
    roles: ROLE_MANAGER,
    entitlement: "performance",
    description: "OKRs, 1:1s, reviews, 9-box grid, PIPs.",
    items: [
      { to: "/app/performance",            label: "Overview",      icon: Target },
      { to: "/app/performance/goals",      label: "Goals & OKRs",  icon: Target },
      { to: "/app/performance/reviews",    label: "Reviews",       icon: ShieldCheck },
      { to: "/app/performance/cycles",     label: "Review cycles", icon: Calendar,    roles: ROLE_HR },
      { to: "/app/performance/nine-box",   label: "9-Box grid",    icon: Stack,       roles: ROLE_HR },
      { to: "/app/performance/pips",       label: "PIPs",          icon: ChartBar },
    ],
  },
  {
    id: "recruitment", label: "Recruitment (ATS — legacy)", icon: Briefcase, color: "bg-teal-100 text-teal-700",
    landing: null, roles: ROLE_HR, entitlement: "recruitment",
    description: "Deprecated — see 'Recruitment' module.", items: [], locked: true, hidden: true,
  },
  {
    id: "reports_legacy", label: "Reports & MIS (legacy)", icon: ChartBar, color: "bg-slate-200 text-slate-700",
    landing: null, roles: ROLE_HR, entitlement: "reports_legacy",
    description: "Deprecated — see 'Reports & MIS' module.", items: [], locked: true, hidden: true,
  },
];

// ────────────────── Role-specific "mini" workspaces ──────────────────
// Super admin & reseller & employee get their own simplified workspaces (not module-switcher driven)
export const ROLE_WORKSPACES = {
  super_admin: [
    { to: "/app/platform",  label: "Platform",  icon: HouseLine },
    { to: "/app/resellers", label: "Resellers", icon: Storefront },
    { to: "/app/companies", label: "Companies", icon: Buildings },
    { to: "/app/modules",   label: "Modules",   icon: Stack },
  ],
  reseller: [
    { to: "/app/reseller",  label: "Overview",     icon: HouseLine },
    { to: "/app/companies", label: "My Companies", icon: Buildings },
  ],
  employee: [
    { to: "/app/employee",        label: "My Workspace",    icon: HouseLine },
    { to: "/app/me",              label: "My Profile",      icon: UserCircle },
    { to: "/app/attendance",      label: "Attendance",      icon: ClockClockwise },
    { to: "/app/leave",           label: "Leave",           icon: CalendarCheck },
    { to: "/app/performance/goals", label: "My Goals",      icon: Target, entitlement: "performance" },
    { to: "/app/performance/reviews", label: "My Reviews",  icon: ShieldCheck, entitlement: "performance" },
    { to: "/app/helpdesk",        label: "Helpdesk",        icon: ShieldCheck, entitlement: "helpdesk" },
    { to: "/app/posh",            label: "PoSH",            icon: Lock,        entitlement: "helpdesk" },
    { to: "/app/expenses",        label: "Expenses & Travel", icon: AirplaneTilt, entitlement: "expense" },
    { to: "/app/policies",        label: "Policies",        icon: BookBookmark },
    { to: "/app/requests",        label: "Requests",        icon: PackageIcon },
    { to: "/app/my-submissions",  label: "My Submissions",  icon: FolderSimpleStar },
  ],
  branch_manager: [
    { to: "/app/manager",      label: "My Team",    icon: HouseLine },
    { to: "/app/approvals",    label: "Approvals",  icon: ShieldCheck },
    { to: "/app/employees",    label: "Directory",  icon: UsersThree },
    { to: "/app/attendance",   label: "Attendance", icon: ClockClockwise },
    { to: "/app/leave",        label: "Leave",      icon: CalendarCheck },
    { to: "/app/performance",  label: "Performance", icon: Target, entitlement: "performance" },
    { to: "/app/recruitment",  label: "Recruitment", icon: Briefcase, entitlement: "ats" },
    { to: "/app/helpdesk",     label: "Helpdesk",    icon: ShieldCheck, entitlement: "helpdesk" },
    { to: "/app/expenses",     label: "Expenses",   icon: AirplaneTilt, entitlement: "expense" },
  ],
};

/** Is the module available to this user (role check)? */
export function isRoleEligible(module, userRole) {
  if (!module.roles) return true;
  return module.roles.includes(userRole);
}

/** Is the module's entitlement active for this tenant? */
export function isEntitled(module, activeModules) {
  if (!module.entitlement) return true;
  return activeModules.includes(module.entitlement) || activeModules.includes("*");
}

/** Detect which module a given pathname belongs to. */
export function moduleFromPath(pathname) {
  for (const m of MODULES) {
    if (m.items?.some(i => pathname === i.to || pathname.startsWith(i.to + "/"))) return m.id;
    if (m.landing && (pathname === m.landing || pathname.startsWith(m.landing + "/"))) return m.id;
  }
  return null;
}

/** Filter nav items inside a module by role + sub-entitlement. */
export function filterItems(items, userRole, activeModules) {
  return (items || []).filter(it => {
    if (it.roles && !it.roles.includes(userRole)) return false;
    if (it.entitlement && !activeModules.includes(it.entitlement) && !activeModules.includes("*")) return false;
    return true;
  });
}
