import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Buildings, FilePdf, ArrowClockwise, Wallet, ClipboardText, Warning, ArrowRight, Lightning } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";

export default function BranchDashboard() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/org/branches").then(r => {
      setBranches(r.data);
      if (r.data.length && !branchId) setBranchId(r.data[0].id);
    }).catch(e => toast.error(formatApiError(e?.response?.data?.detail)));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/branches/${branchId}/ops-summary`).then(r => setData(r.data))
      .catch(e => toast.error(formatApiError(e?.response?.data?.detail)));
  }, [branchId]);

  const tiles = useMemo(() => {
    if (!data) return null;
    const expCount = data.expiring_critical.length + data.expiring_soon.length;
    const recDue = data.recurring_due_next_7d.length;
    const overBudget = data.budget.over_threshold.length;
    const pending = data.expenses.pending_approval;
    return [
      {
        label: "Docs expiring", value: expCount,
        sub: data.expiring_critical.length > 0 ? `${data.expiring_critical.length} critical` : "next 30 days",
        color: data.expiring_critical.length > 0 ? "text-red-600" : expCount > 0 ? "text-amber-700" : "text-emerald-700",
        icon: <FilePdf size={18}/>, link: "/app/branch-operations",
      },
      {
        label: "Recurring due", value: recDue,
        sub: "next 7 days", color: recDue > 0 ? "text-amber-700" : "text-zinc-600",
        icon: <ArrowClockwise size={18}/>, link: "/app/branch-operations",
      },
      {
        label: "Budget burn", value: `${data.budget.pct}%`,
        sub: `${fmtINR(data.budget.utilized)} / ${fmtINR(data.budget.total)}`,
        color: overBudget > 0 ? "text-red-600" : data.budget.pct >= 60 ? "text-amber-700" : "text-emerald-700",
        icon: <Wallet size={18}/>, link: "/app/budgets",
      },
      {
        label: "Pending approvals", value: pending,
        sub: `${data.expenses.approved_this_month} approved this month`,
        color: pending > 0 ? "text-amber-700" : "text-emerald-700",
        icon: <ClipboardText size={18}/>, link: "/app/approvals",
      },
    ];
  }, [data]);

  return (
    <AppShell title="Branch Manager Dashboard">
      <Toaster richColors position="top-right"/>
      <div className="mb-4 flex items-center gap-3">
        <Buildings size={18} className="text-zinc-500"/>
        <Label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Branch</Label>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-72 h-9" data-testid="bdash-branch-select"><SelectValue/></SelectTrigger>
          <SelectContent>
            {branches.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.name}{b.is_head_office ? " · HQ" : ""}{b.city ? ` · ${b.city}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-zinc-100 ml-auto">{data.fiscal_year}</Badge>}
      </div>

      {!data ? (
        <SectionCard title="Loading branch summary…" testid="section-loading">
          <div className="text-sm text-zinc-500">Pulling docs, recurring schedule, budget burn and approvals…</div>
        </SectionCard>
      ) : (
        <>
          {/* Top tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {tiles?.map((t, i) => (
              <Link key={i} to={t.link} className="border border-zinc-200 rounded-lg p-4 hover:shadow-sm hover:border-zinc-400 transition" data-testid={`bdash-tile-${i}`}>
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-zinc-500 mb-1">
                  <span>{t.label}</span>{t.icon}
                </div>
                <div className={`text-3xl font-bold ${t.color}`}>{t.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{t.sub}</div>
              </Link>
            ))}
          </div>

          {/* Two-column detailed lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Expiring docs */}
            <SectionCard title="Documents expiring" subtitle={`Critical (≤7d) on top · auto-renew 30 days out`} testid="section-bdash-docs"
              action={<Link to="/app/branch-operations"><Button size="sm" variant="outline" className="h-8 gap-1 text-xs">Manage <ArrowRight size={11}/></Button></Link>}>
              {data.expiring_critical.length === 0 && data.expiring_soon.length === 0 ? (
                <div className="border border-dashed border-emerald-200 bg-emerald-50/50 rounded-md py-6 text-center text-xs text-emerald-800" data-testid="bdash-docs-empty">
                  ✓ No documents expiring in the next 30 days.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {[...data.expiring_critical, ...data.expiring_soon].slice(0, 8).map(d => {
                    const days = d.days_until_expiry ?? Math.ceil((new Date(d.expiry_date) - new Date()) / 86400000);
                    const danger = days <= 7;
                    return (
                      <li key={d.id} className="py-2 flex items-center justify-between gap-2" data-testid={`bdash-doc-${d.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{d.title}</div>
                          <div className="text-xs text-zinc-500">{d.vendor_name || "—"} · expires {fmtDate(d.expiry_date)}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider flex-none ${danger ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {days < 0 ? `Expired ${Math.abs(days)}d` : `${days}d left`}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            {/* Recurring due */}
            <SectionCard title="Recurring expenses due" subtitle="Auto-firing in the next 7 days" testid="section-bdash-recurring"
              action={<Link to="/app/branch-operations"><Button size="sm" variant="outline" className="h-8 gap-1 text-xs">Manage <ArrowRight size={11}/></Button></Link>}>
              {data.recurring_due_next_7d.length === 0 ? (
                <div className="border border-dashed border-zinc-200 rounded-md py-6 text-center text-xs text-zinc-500" data-testid="bdash-rec-empty">
                  Nothing scheduled for the next 7 days.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {data.recurring_due_next_7d.slice(0, 8).map(r => (
                    <li key={r.id} className="py-2 flex items-center gap-2" data-testid={`bdash-rec-${r.id}`}>
                      <Lightning size={14} className={`flex-none ${r.mode === "AUTO_SUBMIT" ? "text-emerald-600" : "text-amber-600"}`}/>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{r.name}</div>
                        <div className="text-xs text-zinc-500">{r.vendor_name || "—"} · day {r.day_of_month} · {fmtINR(r.amount)}</div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider flex-none ${r.mode === "AUTO_SUBMIT" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {r.mode === "AUTO_SUBMIT" ? "auto" : "draft"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Budget envelopes over threshold */}
            <SectionCard title="Budget envelopes — watchlist" subtitle="At soft-warn threshold (80%) or above" testid="section-bdash-budget"
              action={<Link to="/app/budgets"><Button size="sm" variant="outline" className="h-8 gap-1 text-xs">Manage <ArrowRight size={11}/></Button></Link>}>
              {data.budget.over_threshold.length === 0 ? (
                <div className="border border-dashed border-emerald-200 bg-emerald-50/50 rounded-md py-6 text-center text-xs text-emerald-800" data-testid="bdash-bud-empty">
                  ✓ All budget envelopes are within healthy limits.
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.budget.over_threshold.map(b => (
                    <li key={b.id} className="border border-zinc-200 rounded-md p-3" data-testid={`bdash-bud-${b.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{b.name}</div>
                          <div className="text-xs text-zinc-500">{fmtINR(b.utilized)} / {fmtINR(b.amount)}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] uppercase tracking-wider flex-none ${b.pct >= 100 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          {b.pct}% used
                        </Badge>
                      </div>
                      <div className="h-1.5 bg-zinc-100 rounded-full mt-2 overflow-hidden">
                        <div className={`h-full ${b.pct >= 100 ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${Math.min(b.pct, 100)}%` }}/>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Quick numbers */}
            <SectionCard title="This month at a glance" subtitle="Activity for the current period" testid="section-bdash-numbers">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Recurring runs" value={data.expenses.recurring_runs_this_month}/>
                <Stat label="Approved" value={data.expenses.approved_this_month} sub="expense claims"/>
                <Stat label="Pending" value={data.expenses.pending_approval} color={data.expenses.pending_approval > 0 ? "text-amber-700" : ""}/>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/app/branch-operations"><Button size="sm" variant="outline" className="h-8 text-xs gap-1" data-testid="bdash-cta-upload"><FilePdf size={11}/>Upload doc</Button></Link>
                <Link to="/app/branch-operations"><Button size="sm" variant="outline" className="h-8 text-xs gap-1" data-testid="bdash-cta-recurring"><ArrowClockwise size={11}/>Add recurring</Button></Link>
                <Link to="/app/expenses"><Button size="sm" variant="outline" className="h-8 text-xs gap-1" data-testid="bdash-cta-onetime"><Warning size={11}/>One-time expense</Button></Link>
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value, sub, color = "text-zinc-900" }) {
  return (
    <div className="border border-zinc-200 rounded-md p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
