import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CaretDown, Lock, SparkleIcon } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { MODULES, isRoleEligible, isEntitled, moduleFromPath } from "../lib/moduleRegistry";
import { useAuth } from "../context/AuthContext";
import { useModules } from "../context/ModulesContext";

/**
 * Top-left module switcher (Notion / Linear style).
 * Shows: current module badge + dropdown of active modules + greyed-out upgrade-only modules.
 */
export default function ModuleSwitcher() {
  const { user } = useAuth();
  const { active: activeModules } = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const currentId = moduleFromPath(location.pathname);
  const groups = useMemo(() => {
    const avail = [], upgrade = [];
    if (!user) return { avail, upgrade };
    for (const m of MODULES) {
      if (!isRoleEligible(m, user.role)) continue;
      if (m.locked || !isEntitled(m, activeModules)) upgrade.push(m);
      else avail.push(m);
    }
    return { avail, upgrade };
  }, [user, activeModules]);

  // Only company_admin + country_head + region_head get the module switcher.
  const SWITCHER_ROLES = ["company_admin", "country_head", "region_head"];
  if (!user || !SWITCHER_ROLES.includes(user.role)) return null;

  const current = MODULES.find(m => m.id === currentId) || groups.avail[0];
  if (!current) return null;
  const Icon = current.icon;

  const go = (m) => {
    setOpen(false);
    if (!m.landing) return;
    navigate(m.landing);
  };

  const upgrade = (m) => {
    setOpen(false);
    toast("Module not active", {
      description: `Open ${m.label} from Settings → Billing & Modules to request activation.`,
      action: { label: "Open Billing", onClick: () => navigate("/app/billing") },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 h-9 px-2.5 -ml-1"
          data-testid="module-switcher-trigger"
        >
          <span className={`w-6 h-6 rounded-md flex items-center justify-center ${current.color}`}>
            <Icon size={14} weight="fill"/>
          </span>
          <span className="font-semibold text-sm">{current.label}</span>
          <CaretDown size={12} weight="bold" className="text-zinc-500"/>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2" data-testid="module-switcher-popover">
        <div className="px-2 pt-1 pb-2">
          <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">Active modules</div>
        </div>
        <div className="space-y-0.5">
          {groups.avail.map(m => {
            const MI = m.icon;
            const isActive = m.id === current.id;
            return (
              <button
                key={m.id}
                onClick={() => go(m)}
                data-testid={`module-${m.id}`}
                className={`w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-md transition-colors ${
                  isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${m.color}`}>
                  <MI size={14} weight="fill"/>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-[11px] text-zinc-500 line-clamp-1">{m.description}</span>
                </span>
                {isActive && <span className="text-[10px] font-semibold text-emerald-700 mt-1.5 shrink-0">ACTIVE</span>}
              </button>
            );
          })}
        </div>

        {groups.upgrade.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-2 border-t border-zinc-100 mt-2">
              <div className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase flex items-center gap-1">
                <SparkleIcon size={10} weight="fill"/> Upgrade to unlock
              </div>
            </div>
            <div className="space-y-0.5">
              {groups.upgrade.map(m => {
                const MI = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => upgrade(m)}
                    data-testid={`module-upgrade-${m.id}`}
                    className="w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-50 transition-colors opacity-70"
                  >
                    <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${m.color} grayscale`}>
                      <MI size={14} weight="fill"/>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-[11px] text-zinc-500 line-clamp-1">{m.description}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500 mt-1.5 shrink-0 flex items-center gap-0.5">
                      <Lock size={9} weight="fill"/> LOCKED
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
