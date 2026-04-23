import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Badge } from "../components/ui/badge";

export default function MySubmissions() {
  const [rows, setRows] = useState([]);
  useEffect(() => { (async () => { const { data } = await api.get("/approvals/mine"); setRows(data); })(); }, []);

  return (
    <AppShell title="My submissions">
      <SectionCard title="Every request I've raised" subtitle="Track progress through every approval step" testid="section-submissions">
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="border border-zinc-200 rounded-lg p-5" data-testid={`sub-${r.id}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-display font-semibold">{r.title}</div>
                  <div className="text-xs text-zinc-500 mt-1">{r.request_type.replace("_", " ")} · {new Date(r.created_at).toLocaleString()}</div>
                </div>
                <StatusPill status={r.status} />
              </div>
              <div className="mt-4 flex gap-3 flex-wrap">
                {r.steps.map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                    s.status === "approved" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                    s.status === "rejected" ? "bg-red-50 border-red-200 text-red-700" :
                    s.step === r.current_step && r.status === "pending" ? "bg-zinc-950 border-zinc-950 text-white" :
                    "bg-zinc-50 border-zinc-200 text-zinc-600"
                  }`}>
                    <div className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px]">{s.step}</div>
                    <span>{s.approver_name}</span>
                    <span className="opacity-60">·</span>
                    <span className="capitalize">{s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!rows.length && <div className="text-sm text-zinc-500">Nothing submitted yet.</div>}
        </div>
      </SectionCard>
    </AppShell>
  );
}

function StatusPill({ status }) {
  const map = { pending: "bg-amber-50 text-amber-700 border-amber-200", approved: "bg-emerald-50 text-emerald-700 border-emerald-200", rejected: "bg-red-50 text-red-700 border-red-200" };
  return <Badge variant="outline" className={`uppercase text-[10px] tracking-wider border ${map[status]}`}>{status}</Badge>;
}
