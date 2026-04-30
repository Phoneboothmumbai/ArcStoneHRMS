import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Plus, Wallet, ChartBar, FloppyDisk, Trash, Warning, CheckCircle } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const FY_OPTIONS = ["FY2025", "FY2026", "FY2027"];

export default function Budgets() {
  const [tab, setTab] = useState("envelopes");
  const [fy, setFy] = useState("FY2026");
  const [rows, setRows] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [branches, setBranches] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);

  function blank() {
    return {
      name: "", description: "", branch_id: "",
      department_id: "", cost_center: "", category: "",
      fiscal_year: fy, period: "yearly", period_label: fy,
      amount: "", currency: "INR",
      soft_warn_pct: 80, hard_block_pct: 100, allow_override: true,
    };
  }

  const load = async () => {
    try {
      const [b, list, dash] = await Promise.all([
        api.get("/org/branches"),
        api.get(`/budgets?fiscal_year=${fy}`),
        api.get(`/budgets/dashboard?fiscal_year=${fy}`),
      ]);
      setBranches(b.data); setRows(list.data); setDashboard(dash.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fy]);

  const submit = async () => {
    if (!form.branch_id) return toast.error("Branch is required");
    if (!form.name || !form.amount) return toast.error("Name and amount are required");
    setBusy(true);
    try {
      await api.post("/budgets", {
        ...form,
        amount: Number(form.amount),
        soft_warn_pct: Number(form.soft_warn_pct),
        hard_block_pct: Number(form.hard_block_pct),
        department_id: form.department_id || null,
        cost_center: form.cost_center || null,
        category: form.category || null,
      });
      toast.success("Budget envelope created");
      setOpen(false); setForm(blank()); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Save failed"); }
    finally { setBusy(false); }
  };

  const archive = async (id) => {
    if (!window.confirm("Archive this envelope? Utilization tracking stops.")) return;
    try { await api.delete(`/budgets/${id}`); toast.success("Archived"); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <AppShell title="Budgets">
      <Toaster richColors position="top-right"/>
      <div className="mb-4 flex items-center gap-3">
        <Wallet size={18} className="text-zinc-500"/>
        <Label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Fiscal year</Label>
        <Select value={fy} onValueChange={setFy}>
          <SelectTrigger className="w-32 h-9" data-testid="budget-fy-select"><SelectValue/></SelectTrigger>
          <SelectContent>{FY_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Dashboard cards */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <DashCard label="Envelopes" value={dashboard.envelope_count} icon={<Wallet size={16}/>}/>
          <DashCard label="Total budget" value={fmtINR(dashboard.total_amount)}/>
          <DashCard label="Utilized" value={fmtINR(dashboard.total_utilized)}
            sub={<span className={`text-xs ${dashboard.utilization_pct >= 80 ? "text-amber-700" : "text-emerald-700"}`}>{dashboard.utilization_pct}% used</span>}/>
          <DashCard label="Remaining" value={fmtINR(dashboard.total_remaining)}/>
        </div>
      )}

      <SectionCard
        title={`${rows.length} budget envelopes · ${fy}`}
        subtitle="Branch × Department × Cost-Center × Category. Soft-warn at 80%, hard-block at 100% (admin override)."
        testid="section-envelopes"
        action={
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setForm(blank()); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-9" data-testid="budget-new-btn"><Plus size={14}/> New envelope</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New budget envelope</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="col-span-2"><Label>Name *</Label>
                  <Input className="mt-1" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Bengaluru HQ — IT Travel — FY26" data-testid="budget-name"/>
                </div>
                <div><Label>Branch *</Label>
                  <Select value={form.branch_id} onValueChange={v => setForm({...form, branch_id: v})}>
                    <SelectTrigger className="mt-1" data-testid="budget-branch"><SelectValue placeholder="Select branch"/></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_head_office ? " · HQ" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Cost center</Label>
                  <Input className="mt-1" value={form.cost_center} onChange={e => setForm({...form, cost_center: e.target.value})} placeholder="IT, Marketing, Ops…" data-testid="budget-cc"/>
                </div>
                <div><Label>Category</Label>
                  <Input className="mt-1" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="travel, stationery_general…" data-testid="budget-category"/>
                </div>
                <div><Label>Fiscal year *</Label>
                  <Select value={form.fiscal_year} onValueChange={v => setForm({...form, fiscal_year: v, period_label: v})}>
                    <SelectTrigger className="mt-1" data-testid="budget-fy"><SelectValue/></SelectTrigger>
                    <SelectContent>{FY_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Period</Label>
                  <Select value={form.period} onValueChange={v => setForm({...form, period: v})}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yearly">Yearly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Amount (₹) *</Label>
                  <Input className="mt-1" type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="500000" data-testid="budget-amount"/>
                </div>
                <div><Label>Soft-warn % (default 80)</Label>
                  <Input className="mt-1" type="number" value={form.soft_warn_pct} onChange={e => setForm({...form, soft_warn_pct: e.target.value})}/>
                </div>
                <div><Label>Hard-block % (default 100)</Label>
                  <Input className="mt-1" type="number" value={form.hard_block_pct} onChange={e => setForm({...form, hard_block_pct: e.target.value})}/>
                </div>
                <label className="col-span-2 flex items-center gap-2 text-sm">
                  <Switch checked={form.allow_override} onCheckedChange={v => setForm({...form, allow_override: v})} data-testid="budget-override"/>
                  Allow admin override at hard-block (recommended)
                </label>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={busy} data-testid="budget-save-btn">
                  <FloppyDisk size={14} className="mr-1.5"/> {busy ? "Saving…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {rows.length === 0 ? (
          <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="budget-empty">
            No envelopes yet for {fy}. Create your first one for a branch.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map(r => {
              const pct = r.utilization_pct;
              const danger = pct >= r.hard_block_pct;
              const warn = pct >= r.soft_warn_pct && !danger;
              const color = danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500";
              return (
                <article key={r.id} className="border border-zinc-200 rounded-lg p-4 hover:shadow-sm transition-shadow" data-testid={`budget-card-${r.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-1">
                        {r.cost_center && <Badge variant="outline" className="text-[10px]">CC: {r.cost_center}</Badge>}
                        {r.category && <Badge variant="outline" className="text-[10px]">cat: {r.category}</Badge>}
                        <Badge variant="outline" className="text-[10px]">{r.period}</Badge>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => archive(r.id)} data-testid={`budget-archive-${r.id}`}><Trash size={12}/></Button>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xl font-bold">{fmtINR(r.utilized)}</span>
                      <span className="text-xs text-zinc-500">of {fmtINR(r.amount)}</span>
                    </div>
                    <div className="h-2 bg-zinc-100 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }}/>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className={`font-medium ${danger ? "text-red-600" : warn ? "text-amber-700" : "text-emerald-700"}`}>
                        {danger ? <Warning size={11} className="inline mr-1"/> : warn ? <Warning size={11} className="inline mr-1"/> : <CheckCircle size={11} className="inline mr-1"/>}
                        {pct}% used
                      </span>
                      <span className="text-zinc-500">{fmtINR(r.remaining)} remaining</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}

function DashCard({ label, value, sub, icon }) {
  return (
    <div className="border border-zinc-200 rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {icon}{label}
      </div>
      <div className="text-2xl font-bold text-zinc-900">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}
