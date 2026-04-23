import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Package, CheckCircle, ClockCountdown, LockKey, Download } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function BillingAndModules() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState({ modules: [], bundles: [] });
  const [mine, setMine] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requesting, setRequesting] = useState(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [cat, m, rq] = await Promise.all([
      api.get("/modules/catalog"),
      api.get(`/modules/company/${user.company_id}`),
      api.get("/modules/activation_requests"),
    ]);
    setCatalog(cat.data); setMine(m.data); setRequests(rq.data);
  };
  useEffect(() => { if (user?.company_id) load(); /* eslint-disable-next-line */ }, [user]);

  const active = new Set(mine.filter((r) => ["active", "trial"].includes(r.status)).map((r) => r.module_id));

  const submitRequest = async () => {
    if (!requesting) return;
    try {
      await api.post(`/modules/company/${user.company_id}/request_activation`, { module_id: requesting.id, message });
      toast.success("Request sent to your administrator");
      setRequesting(null); setMessage(""); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const downloadExport = async () => {
    try {
      const res = await api.post(`/tenant/${user.company_id}/export`, {}, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const a = document.createElement("a"); a.href = url; a.download = `tenant-export.zip`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) { toast.error("Export failed"); }
  };

  return (
    <AppShell title="Billing & Modules">
      <Toaster richColors />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatBlock label="Active modules" value={mine.filter(r => r.status === "active").length} />
        <StatBlock label="Trials running" value={mine.filter(r => r.status === "trial").length} tone="amber" />
        <StatBlock label="Open requests" value={requests.filter(r => r.status === "pending").length} />
      </div>

      <SectionCard
        title="Your active modules"
        subtitle="Modules currently enabled for your company"
        testid="section-active"
        action={
          <Button variant="outline" className="border-zinc-300" onClick={downloadExport} data-testid="export-tenant-btn">
            <Download size={14} className="mr-1.5" /> Export my data
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {mine.filter(r => ["active", "trial"].includes(r.status)).map((r) => {
            const m = catalog.modules.find(x => x.id === r.module_id);
            if (!m) return null;
            return (
              <div key={r.module_id} className="border border-emerald-200 bg-emerald-50/30 rounded-lg p-4" data-testid={`active-mod-${r.module_id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle size={16} weight="fill" className="text-emerald-600" />
                  <div className="font-display font-semibold">{m.name}</div>
                  {r.status === "trial" && <Badge className="bg-amber-500 hover:bg-amber-500 text-white uppercase text-[10px]">Trial</Badge>}
                </div>
                <p className="text-xs text-zinc-600 mt-1">{m.description}</p>
                {r.status === "trial" && r.trial_until && (
                  <div className="text-xs text-amber-700 mt-2 flex items-center gap-1"><ClockCountdown size={12} /> Trial ends {new Date(r.trial_until).toLocaleDateString()}</div>
                )}
              </div>
            );
          })}
          {!mine.filter(r => ["active", "trial"].includes(r.status)).length && <div className="text-sm text-zinc-500">No modules active yet.</div>}
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Available add-ons" subtitle="Request activation — your administrator will enable it for you" testid="section-available">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {catalog.modules.filter((m) => !active.has(m.id) && !m.included_by_default).map((m) => {
              const pending = requests.some((r) => r.module_id === m.id && r.status === "pending");
              return (
                <div key={m.id} className="bg-white border border-zinc-200 rounded-lg p-4" data-testid={`avail-${m.id}`}>
                  <div className="flex items-center gap-2">
                    <Package size={14} weight="bold" className="text-zinc-500" />
                    <div className="font-display font-semibold text-sm">{m.name}</div>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1.5 line-clamp-2">{m.description}</p>
                  <div className="text-[11px] tracking-wider uppercase text-zinc-500 mt-2">{m.category}</div>
                  <Button size="sm" variant="outline" className="w-full mt-3 border-zinc-300" onClick={() => setRequesting(m)} disabled={pending} data-testid={`request-${m.id}`}>
                    {pending ? "Request pending" : "Request activation"}
                  </Button>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="My activation requests" subtitle="Status of modules you've requested" testid="section-requests">
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-zinc-100 pb-3 last:border-0 text-sm" data-testid={`req-${r.id}`}>
                <div>
                  <div className="font-medium">{r.module_id}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">Requested {new Date(r.created_at).toLocaleString()}</div>
                </div>
                <Badge variant="outline" className="uppercase text-[10px]">{r.status}</Badge>
              </li>
            ))}
            {!requests.length && <li className="text-sm text-zinc-500">No requests yet.</li>}
          </ul>
        </SectionCard>
      </div>

      <Dialog open={!!requesting} onOpenChange={(v) => !v && setRequesting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request activation — {requesting?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600">Your administrator will review and enable this module for your company.</p>
          <Textarea placeholder="(Optional) Why do you need this?" value={message} onChange={(e) => setMessage(e.target.value)} data-testid="request-message" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequesting(null)}>Cancel</Button>
            <Button className="bg-zinc-950 hover:bg-zinc-800" onClick={submitRequest} data-testid="confirm-request">Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatBlock({ label, value, tone }) {
  const color = tone === "amber" ? "text-amber-600" : "text-zinc-950";
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6">
      <div className="tiny-label">{label}</div>
      <div className={`font-display font-bold text-4xl mt-3 tracking-tight ${color}`}>{value}</div>
    </div>
  );
}
