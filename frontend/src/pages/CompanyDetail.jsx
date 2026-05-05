import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ArrowLeft, Buildings, Users, Stack, Calendar } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function CompanyDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`/companies/${id}`);
        if (alive) setC(r.data);
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Failed to load company");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  return (
    <AppShell title={c?.name || "Company"}>
      <div className="space-y-5" data-testid="company-detail">
        <Link to="/app/companies" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900" data-testid="company-back-link">
          <ArrowLeft size={12}/> Back to companies
        </Link>

        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : !c ? (
          <div className="text-sm text-zinc-500">Company not found.</div>
        ) : (
          <>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold tracking-tight">{c.name}</h2>
                  <Badge variant="outline" className="uppercase text-[10px]">{c.plan}</Badge>
                  <span className="text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">{c.status}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {c.industry || "—"}{c.country ? ` · ${c.country}` : ""}
                  {c.id ? <> · <span className="font-mono">{c.id.slice(0, 12)}</span></> : null}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <StatCard label="Employees" value={c.employee_count ?? 0} icon={Users}/>
              <StatCard label="Plan" value={c.plan || "—"} icon={Stack}/>
              <StatCard label="Status" value={c.status || "—"} icon={Buildings}/>
              <StatCard label="Onboarded" value={(c.created_at || "").slice(0, 10) || "—"} icon={Calendar}/>
            </div>

            <SectionCard title="Tenant configuration" subtitle="Read-only summary. Module entitlements & seat caps are managed under Modules." testid="company-cfg">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="Company ID" value={<span className="font-mono text-xs">{c.id}</span>}/>
                <Field label="Reseller ID" value={c.reseller_id ? <span className="font-mono text-xs">{c.reseller_id}</span> : "Direct"}/>
                <Field label="Industry" value={c.industry || "—"}/>
                <Field label="Plan" value={c.plan || "—"}/>
                <Field label="Country" value={c.country || "—"}/>
                <Field label="Status" value={c.status || "—"}/>
                <Field label="Created" value={(c.created_at || "").slice(0, 10) || "—"}/>
                <Field label="Updated" value={(c.updated_at || "").slice(0, 10) || "—"}/>
              </dl>
            </SectionCard>

            <SectionCard title="Quick actions" subtitle="Open this tenant's data inside the platform shell." testid="company-actions">
              <div className="flex items-center gap-2 flex-wrap">
                <Link to="/app/modules"><Button size="sm" variant="outline" data-testid="company-modules-link">Manage modules</Button></Link>
                <Link to="/app/audit-log"><Button size="sm" variant="outline" data-testid="company-audit-link">Audit log</Button></Link>
                <Link to="/app/employees"><Button size="sm" variant="outline" data-testid="company-employees-link">View employees</Button></Link>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</dt>
      <dd className="text-sm text-zinc-900 mt-0.5">{value}</dd>
    </div>
  );
}
