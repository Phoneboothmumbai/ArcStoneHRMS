import { Link } from "react-router-dom";
import { useHasModule } from "../context/ModulesContext";
import { LockKey, ArrowRight } from "@phosphor-icons/react";

/**
 * <Gate module="procurement"> ... </Gate>
 *   Renders children only if the company has the module enabled.
 *   If `hideWhenLocked`, renders nothing. Otherwise renders an upgrade stub.
 */
export default function Gate({ module: moduleId, children, hideWhenLocked, fallback }) {
  const ok = useHasModule(moduleId);
  if (ok) return children;
  if (hideWhenLocked) return null;
  if (fallback !== undefined) return fallback;
  return <ModuleLocked moduleId={moduleId} />;
}

export function ModuleLocked({ moduleId }) {
  return (
    <div className="bg-white border border-dashed border-zinc-300 rounded-lg p-10 text-center" data-testid={`locked-${moduleId}`}>
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto">
        <LockKey size={22} weight="duotone" className="text-zinc-600" />
      </div>
      <div className="font-display font-semibold text-lg mt-4">This module isn't active for your company</div>
      <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto">
        Your administrator hasn't enabled the <b>{moduleId.replace(/_/g, " ")}</b> module yet.
        Head to Billing &amp; Modules to request activation.
      </p>
      <Link to="/app/billing" className="inline-flex items-center gap-1.5 mt-6 text-sm text-zinc-950 font-medium hover:underline" data-testid={`locked-cta-${moduleId}`}>
        Request activation <ArrowRight size={14} weight="bold" />
      </Link>
    </div>
  );
}
