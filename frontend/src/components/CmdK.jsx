import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass, CommandIcon, ArrowRight } from "@phosphor-icons/react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "./ui/command";
import { api } from "../lib/api";
import { MODULES, ROLE_WORKSPACES, isRoleEligible, isEntitled, filterItems } from "../lib/moduleRegistry";
import { useAuth } from "../context/AuthContext";
import { useModules } from "../context/ModulesContext";

/**
 * Cmd+K command palette.
 * - Instant fuzzy search of every navigable page + quick-actions.
 * - Employee lookup (lazy-loaded first time user searches).
 */
export default function CmdK() {
  const { user } = useAuth();
  const { active: activeModules } = useModules();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lazy-load employees on first open (only for HR/managers).
  useEffect(() => {
    if (!open || employees !== null) return;
    if (!user || !["company_admin","country_head","region_head","branch_manager","sub_manager","assistant_manager"].includes(user.role)) {
      setEmployees([]); return;
    }
    api.get("/employees").then(r => setEmployees(r.data || [])).catch(() => setEmployees([]));
  }, [open, user, employees]);

  // Build the navigable pages list from the module registry.
  const pages = useMemo(() => {
    if (!user) return [];
    const out = [];
    // Module items (HR / country_head / region_head)
    if (["company_admin","country_head","region_high","region_head"].includes(user.role)) {
      for (const m of MODULES) {
        if (!isRoleEligible(m, user.role)) continue;
        if (!isEntitled(m, activeModules)) continue;
        if (m.locked) continue;
        for (const it of filterItems(m.items, user.role, activeModules)) {
          out.push({ ...it, moduleLabel: m.label });
        }
      }
    }
    // Role-specific workspace items (employee / manager / super_admin / reseller)
    const ws = ROLE_WORKSPACES[user.role];
    if (ws) {
      for (const it of ws) {
        if (it.entitlement && !activeModules.includes(it.entitlement) && !activeModules.includes("*")) continue;
        out.push({ ...it, moduleLabel: "My Workspace" });
      }
    }
    return out;
  }, [user, activeModules]);

  const quickActions = useMemo(() => {
    const role = user?.role;
    const isHr = ["super_admin","company_admin","country_head","region_head"].includes(role);
    const actions = [];
    actions.push({ label: "Apply for leave",         to: "/app/leave" });
    actions.push({ label: "Mark attendance",         to: "/app/attendance" });
    actions.push({ label: "Submit expense claim",    to: "/app/expenses" });
    if (isHr) {
      actions.push({ label: "New payroll run",         to: "/app/payroll-runs" });
      actions.push({ label: "Generate letter",         to: "/app/letters" });
      actions.push({ label: "Compute F&F settlement",  to: "/app/fnf-loans" });
      actions.push({ label: "Publish a policy",        to: "/app/policies" });
      actions.push({ label: "Add asset",               to: "/app/assets" });
    }
    return actions;
  }, [user]);

  const select = (path) => { setOpen(false); navigate(path); };

  if (!user) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="cmdk-trigger"
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors text-sm text-zinc-500"
      >
        <MagnifyingGlass size={14} weight="bold"/>
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-600">
          <CommandIcon size={10} weight="bold"/>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a page, employee, or action…" data-testid="cmdk-input"/>
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Pages">
            {pages.map(p => {
              const Ic = p.icon;
              return (
                <CommandItem
                  key={p.to}
                  value={`${p.label} ${p.moduleLabel}`}
                  onSelect={() => select(p.to)}
                  data-testid={`cmdk-page-${p.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {Ic && <Ic size={14} weight="regular" className="mr-2 text-zinc-500"/>}
                  <span className="flex-1">{p.label}</span>
                  <span className="text-[10px] text-zinc-400 mr-2">{p.moduleLabel}</span>
                  <ArrowRight size={12} className="text-zinc-400"/>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator/>
          <CommandGroup heading="Quick actions">
            {quickActions.map(a => (
              <CommandItem
                key={a.to + a.label}
                value={a.label}
                onSelect={() => select(a.to)}
                data-testid={`cmdk-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span className="w-5 h-5 rounded bg-zinc-100 text-zinc-600 text-[11px] font-bold flex items-center justify-center mr-2">⌘</span>
                <span className="flex-1">{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {(employees?.length || 0) > 0 && (
            <>
              <CommandSeparator/>
              <CommandGroup heading="Employees">
                {employees.slice(0, 40).map(e => (
                  <CommandItem
                    key={e.id}
                    value={`${e.name} ${e.email || ""} ${e.employee_code || ""}`}
                    onSelect={() => select(`/app/employees`)}
                  >
                    <div className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-700 text-[10px] font-bold flex items-center justify-center mr-2">
                      {(e.name || "U").split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase()}
                    </div>
                    <span className="flex-1">{e.name}</span>
                    <span className="text-[10px] text-zinc-400">{e.employee_code || e.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
