import { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CaretDown, Lock, SparkleIcon, MagnifyingGlass } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { MODULES, isRoleEligible, isEntitled, moduleFromPath } from "../lib/moduleRegistry";
import { useAuth } from "../context/AuthContext";
import { useModules } from "../context/ModulesContext";

/**
 * Top-left module switcher (Notion / Linear / Loops style).
 *
 * UX rationale for this redesign:
 * - Original was a single tall column → overflowed below the viewport on
 *   laptops (15+ modules × ~58px each = 900px).
 * - New layout: 640px wide popover, 2-column responsive grid of compact tiles,
 *   max-height capped at min(640px, 80vh) with internal scroll. Quick-search
 *   filters tiles in real-time so power users skip the scroll.
 * - Active vs. Locked sections preserved so the upsell story still works.
 */
export default function ModuleSwitcher() {
  const { user } = useAuth();
  const { active: activeModules } = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const currentId = moduleFromPath(location.pathname);

  const groups = useMemo(() => {
    const avail = [], upgrade = [];
    if (!user) return { avail, upgrade };
    for (const m of MODULES) {
      if (m.hidden) continue;
      if (!isRoleEligible(m, user.role)) continue;
      if (m.locked || !isEntitled(m, activeModules)) upgrade.push(m);
      else avail.push(m);
    }
    return { avail, upgrade };
  }, [user, activeModules]);

  // Apply search filter (matches label OR description, case-insensitive)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const match = (m) =>
      m.label?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q) ||
      m.id?.toLowerCase().includes(q);
    return {
      avail: groups.avail.filter(match),
      upgrade: groups.upgrade.filter(match),
    };
  }, [groups, query]);

  // Reset search when popover closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

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

  const totalShown = filtered.avail.length + filtered.upgrade.length;

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
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[640px] max-w-[92vw] p-0 max-h-[min(640px,80vh)] flex flex-col"
        data-testid="module-switcher-popover"
      >
        {/* ---- Sticky search header ---- */}
        <div className="px-3 py-2.5 border-b border-zinc-100 flex items-center gap-2 bg-white sticky top-0 z-10">
          <MagnifyingGlass size={14} className="text-zinc-400"/>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            className="h-7 border-0 px-0 focus-visible:ring-0 text-sm placeholder:text-zinc-400"
            autoFocus
            data-testid="module-search"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">esc</kbd>
        </div>

        {/* ---- Scrollable body ---- */}
        <div className="overflow-y-auto flex-1 p-3">
          {totalShown === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              No modules match <span className="font-mono">"{query}"</span>
            </div>
          ) : (
            <>
              {filtered.avail.length > 0 && (
                <>
                  <SectionLabel>Active modules · {filtered.avail.length}</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {filtered.avail.map(m => (
                      <ModuleTile
                        key={m.id} m={m} onClick={() => go(m)}
                        active={m.id === current.id}
                        testid={`module-${m.id}`}
                      />
                    ))}
                  </div>
                </>
              )}

              {filtered.upgrade.length > 0 && (
                <>
                  <SectionLabel>
                    <SparkleIcon size={10} weight="fill" className="inline mr-1"/>
                    Upgrade to unlock · {filtered.upgrade.length}
                  </SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {filtered.upgrade.map(m => (
                      <ModuleTile
                        key={m.id} m={m} onClick={() => upgrade(m)}
                        locked
                        testid={`module-upgrade-${m.id}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Subcomponents ---------- */

function SectionLabel({ children }) {
  return (
    <div className="px-1 pb-1.5 pt-0.5 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase flex items-center">
      {children}
    </div>
  );
}

function ModuleTile({ m, active = false, locked = false, onClick, testid }) {
  const Icon = m.icon;
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`group text-left flex items-start gap-2.5 px-2.5 py-2.5 rounded-md border transition-all relative ${
        active
          ? "bg-zinc-100 border-zinc-300 shadow-sm"
          : locked
          ? "border-transparent hover:border-zinc-200 hover:bg-zinc-50 opacity-75"
          : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      <span
        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${m.color} ${
          locked ? "grayscale" : ""
        }`}
      >
        <Icon size={15} weight="fill"/>
      </span>
      <span className="flex-1 min-w-0 pt-0.5">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-zinc-900 truncate">{m.label}</span>
          {active && (
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              ACTIVE
            </span>
          )}
          {locked && (
            <Lock size={10} weight="fill" className="text-zinc-400"/>
          )}
        </span>
        <span className="block text-[11px] text-zinc-500 line-clamp-2 leading-snug mt-0.5">
          {m.description}
        </span>
      </span>
    </button>
  );
}
