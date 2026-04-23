import { NavLink, useNavigate } from "react-router-dom";
import {
  HouseLine, UsersThree, TreeStructure, FolderSimpleStar, CalendarCheck, ClockClockwise,
  PackageIcon, Storefront, Buildings, IdentificationCard, SignOut, ShieldCheck, FlowArrow,
} from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";

const NAV_BY_ROLE = {
  super_admin: [
    { to: "/app/platform", label: "Platform", icon: HouseLine },
    { to: "/app/resellers", label: "Resellers", icon: Storefront },
    { to: "/app/companies", label: "Companies", icon: Buildings },
  ],
  reseller: [
    { to: "/app/reseller", label: "Overview", icon: HouseLine },
    { to: "/app/companies", label: "My Companies", icon: Buildings },
  ],
  company_admin: [
    { to: "/app/hr", label: "Overview", icon: HouseLine },
    { to: "/app/employees", label: "Employees", icon: UsersThree },
    { to: "/app/org-tree", label: "Organization", icon: TreeStructure },
    { to: "/app/approvals", label: "Approvals", icon: ShieldCheck },
    { to: "/app/leave", label: "Leave", icon: CalendarCheck },
    { to: "/app/attendance", label: "Attendance", icon: ClockClockwise },
    { to: "/app/requests", label: "Requests", icon: PackageIcon },
  ],
  branch_manager: [
    { to: "/app/manager", label: "My Team", icon: HouseLine },
    { to: "/app/approvals", label: "Approvals", icon: ShieldCheck },
    { to: "/app/employees", label: "Directory", icon: UsersThree },
    { to: "/app/requests", label: "Requests", icon: PackageIcon },
  ],
  employee: [
    { to: "/app/employee", label: "My Workspace", icon: HouseLine },
    { to: "/app/attendance", label: "Attendance", icon: ClockClockwise },
    { to: "/app/leave", label: "Leave", icon: CalendarCheck },
    { to: "/app/requests", label: "Requests", icon: PackageIcon },
    { to: "/app/my-submissions", label: "My Submissions", icon: FolderSimpleStar },
  ],
};

export default function AppShell({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const nav = NAV_BY_ROLE[user.role] || NAV_BY_ROLE.employee;
  const initials = (user.name || user.email || "U").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="h-screen grid grid-cols-[260px_1fr] bg-zinc-100" data-testid="app-shell">
      <aside className="bg-zinc-50 border-r border-zinc-200 flex flex-col" data-testid="sidebar">
        <div className="px-6 py-6 border-b border-zinc-200">
          <div className="flex items-center gap-2" data-testid="brand-mark">
            <div className="w-8 h-8 bg-zinc-950 text-white flex items-center justify-center rounded-sm">
              <IdentificationCard weight="fill" size={18} />
            </div>
            <div>
              <div className="font-display font-black text-lg leading-none">Arcstone</div>
              <div className="tiny-label mt-1">HRMS · Enterprise</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-700 hover:bg-zinc-100"
                }`
              }
            >
              <item.icon size={18} weight="regular" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-zinc-200">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-9 w-9 border border-zinc-200">
              <AvatarFallback className="bg-zinc-950 text-white text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" data-testid="sidebar-user-name">{user.name}</div>
              <div className="text-xs text-zinc-500 truncate">{user.role.replace(/_/g, " ")}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => { await logout(); navigate("/login"); }}
              data-testid="logout-btn"
            >
              <SignOut size={18} />
            </Button>
          </div>
        </div>
      </aside>

      <main className="overflow-y-auto">
        <header className="bg-white border-b border-zinc-200 px-8 py-5 sticky top-0 z-10" data-testid="top-header">
          <div className="flex items-center justify-between">
            <div>
              <div className="tiny-label">{user.role.replace(/_/g, " ")}</div>
              <h1 className="font-display font-bold text-2xl leading-tight tracking-tight mt-1" data-testid="page-title">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="tiny-label">{user.email}</div>
            </div>
          </div>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

export function StatCard({ label, value, hint, testid }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6" data-testid={testid}>
      <div className="tiny-label">{label}</div>
      <div className="font-display font-bold text-4xl mt-3 tracking-tight" data-testid={`${testid}-value`}>{value}</div>
      {hint && <div className="text-sm text-zinc-500 mt-2">{hint}</div>}
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, testid }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-lg" data-testid={testid}>
      <header className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-base">{title}</div>
          {subtitle && <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}
