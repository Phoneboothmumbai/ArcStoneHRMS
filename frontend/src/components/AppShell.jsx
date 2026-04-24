import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  IdentificationCard, SignOut, Question, BookOpen,
} from "@phosphor-icons/react";
import NotificationsBell from "./NotificationsBell";
import ModuleSwitcher from "./ModuleSwitcher";
import CmdK from "./CmdK";
import { useAuth } from "../context/AuthContext";
import { useModules } from "../context/ModulesContext";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  MODULES, ROLE_WORKSPACES, isRoleEligible, isEntitled, filterItems, moduleFromPath,
} from "../lib/moduleRegistry";

export default function AppShell({ children, title }) {
  const { user, logout } = useAuth();
  const { active: activeModules } = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) return null;

  // ─── Decide which nav to render ───
  // HR roles use the module-scoped sidebar (one module at a time, switcher in header).
  // All other roles use their flat role workspace.
  const HR_ROLES = ["company_admin", "country_head", "region_head"];
  const isHr = HR_ROLES.includes(user.role);

  let nav = [];
  let currentModule = null;
  if (isHr) {
    const modId = moduleFromPath(location.pathname);
    currentModule =
      MODULES.find(m => m.id === modId && isRoleEligible(m, user.role) && isEntitled(m, activeModules) && !m.locked)
      || MODULES.find(m => m.id === "people");
    nav = filterItems(currentModule?.items || [], user.role, activeModules);
  } else {
    const ws = ROLE_WORKSPACES[user.role] || ROLE_WORKSPACES.employee;
    nav = filterItems(ws, user.role, activeModules);
  }

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
        {isHr && currentModule && (
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center gap-2.5" data-testid="sidebar-module-label">
            <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${currentModule.color}`}>
              <currentModule.icon size={14} weight="fill"/>
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">Module</div>
              <div className="text-sm font-semibold truncate">{currentModule.label}</div>
            </div>
          </div>
        )}
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
          <div className="pt-3 mt-3 border-t border-zinc-100">
            <NavLink
              to="/app/help"
              data-testid="nav-help"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-100"
                }`
              }
            >
              <BookOpen size={18} weight="regular" />
              <span>Help & Knowledge Base</span>
            </NavLink>
          </div>
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
        <header className="bg-white border-b border-zinc-200 px-8 py-3 sticky top-0 z-10 flex items-center justify-between gap-4" data-testid="top-header">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isHr && <ModuleSwitcher/>}
            {currentModule && (
              <div className="h-6 w-px bg-zinc-200 mx-1 hidden md:block"/>
            )}
            <div className="min-w-0">
              {currentModule && (
                <div className="tiny-label">
                  {currentModule.label}{title && " ·"}
                </div>
              )}
              {!currentModule && (
                <div className="tiny-label">{user.role.replace(/_/g, " ")}</div>
              )}
              <h1 className="font-display font-bold text-xl leading-tight tracking-tight truncate" data-testid="page-title">
                {title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <CmdK/>
            <NotificationsBell/>
            <NavLink
              to="/app/help"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-950"
              data-testid="header-help-link"
            >
              <Question size={14} weight="bold"/>
              Help
            </NavLink>
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
