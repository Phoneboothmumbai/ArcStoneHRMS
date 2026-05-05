import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ShieldCheck, MagnifyingGlass } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const ACTION_BADGE = (a) => {
  if (!a) return "bg-zinc-100 text-zinc-700";
  if (a.startsWith("delete") || a.includes("reject") || a.includes("terminate")) return "bg-red-50 text-red-700 border-red-200";
  if (a.includes("approve") || a.includes("create")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (a.includes("update") || a.includes("edit")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (a.includes("login") || a.includes("auth")) return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
};
const fmtTs = ts => ts ? new Date(ts).toLocaleString("en-IN") : "—";

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (q) params.actor_id = q;
      if (action !== "all") params.event = action;
      const { data } = await api.get("/audit/events", { params });
      setRows(Array.isArray(data) ? data : (data?.events || []));
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Failed to load audit log"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, action]);

  const distinctActions = [...new Set(rows.map(r => r.event || r.action).filter(Boolean))].sort();

  return (
    <AppShell title="Audit Log">
      <Toaster richColors position="top-right"/>
      <SectionCard
        title={`${rows.length} events`}
        subtitle="Immutable trail of administrative actions across the company. Used for compliance review."
        testid="section-audit"
        action={
          <div className="flex gap-2">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"/>
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search user / target…" className="h-9 w-52 pl-8" data-testid="audit-search"/>
            </div>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-44 h-9" data-testid="audit-action-select"><SelectValue placeholder="All actions"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {distinctActions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }>
        {loading && <div className="text-sm text-zinc-500 py-8 text-center">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="audit-empty">
            No audit events match your filters.
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr className="text-left text-xs uppercase text-zinc-500">
                  <th className="py-2 px-3">When</th><th>User</th><th>Action</th><th>Target</th><th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map(r => (
                  <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50" data-testid={`audit-row-${r.id}`}>
                    <td className="py-2 px-3 text-xs text-zinc-500 whitespace-nowrap">{fmtTs(r.created_at || r.timestamp)}</td>
                    <td className="text-zinc-700 text-xs">{r.user_name || r.user_id || "system"}</td>
                    <td><Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${ACTION_BADGE(r.action)}`}>{r.action}</Badge></td>
                    <td className="text-zinc-700 text-xs">{r.target_id || "—"}</td>
                    <td className="text-zinc-500 text-xs max-w-md truncate">{JSON.stringify(r.metadata || r.details || {}).slice(0, 150)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <div className="text-center text-xs text-zinc-500 py-2 bg-zinc-50">Showing latest 200 of {rows.length} events. Refine filters to see more.</div>}
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
