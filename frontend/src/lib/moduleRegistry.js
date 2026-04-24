/**
 * Arcstone HRMS — Module Registry
 * Single source of truth mapping modules → their nav tree, icons, required roles, landing route.
 * Add a new entry here → a new module appears in the switcher + command palette automatically.
 */
import {
  HouseLine, UsersThree, TreeStructure, FolderSimpleStar, CalendarCheck, ClockClockwise,
  PackageIcon, Storefront, Buildings, ShieldCheck, FlowArrow, Stack, Receipt,
  UserCirclePlus, UserCircleMinus, UserCircle, CurrencyInr, Calendar, Handshake,
  BookBookmark, FileText, Laptop, AirplaneTilt, Gear, ChartBar, Briefcase, Target,
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
      { to: "/app/employees",     label: "Employees",     icon: UsersThree },
      { to: "/app/org-tree",      label: "Organization",  icon: TreeStructure },
      { to: "/app/onboarding",    label: "Onboarding",    icon: UserCirclePlus,  entitlement: "onboarding" },
      { to: "/app/offboarding",   label: "Offboarding",   icon: UserCircleMinus, entitlement: "onboarding" },
      { to: "/app/approvals",     label: "Approvals",     icon: ShieldCheck },
      { to: "/app/workflows",     label: "Workflows",     icon: FlowArrow },
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
    landing: "/app/requests",
    roles: ROLE_ANY,
    entitlement: "procurement",
    description: "Product & service requests routed to vendors / main branch.",
    items: [
      { to: "/app/requests",         label: "Requests",         icon: PackageIcon },
      { to: "/app/my-submissions",   label: "My Submissions",   icon: FolderSimpleStar },
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
    id: "performance", label: "Performance", icon: Target, color: "bg-pink-100 text-pink-700",
    landing: null, roles: ROLE_HR, entitlement: "performance",
    description: "OKRs, 1:1s, 360 reviews, 9-box grid, PIP.", items: [], locked: true,
  },
  {
    id: "recruitment", label: "Recruitment (ATS)", icon: Briefcase, color: "bg-teal-100 text-teal-700",
    landing: null, roles: ROLE_HR, entitlement: "recruitment",
    description: "Job postings, candidate pipeline, interviews, offers.", items: [], locked: true,
  },
  {
    id: "reports", label: "Reports & MIS", icon: ChartBar, color: "bg-slate-200 text-slate-700",
    landing: null, roles: ROLE_HR, entitlement: "reports",
    description: "Headcount, attrition, DEI, custom report builder.", items: [], locked: true,
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
