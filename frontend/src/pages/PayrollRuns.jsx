import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Play, LockSimple, ArrowSquareOut, FileArrowDown, DownloadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS_COLOR = {
  draft: "bg-zinc-100 text-zinc-700",
  computing: "bg-amber-100 text-amber-800",
  computed: "bg-blue-100 text-blue-800",
  finalised: "bg-purple-100 text-purple-800",
  published: "bg-emerald-100 text-emerald-800",
};

export default function PayrollRuns() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(null);     // selected run id → show payslips
  const [slips, setSlips] = useState([]);

  const load = async () => {
    try { const r = await api.get("/payroll-runs"); setRows(r.data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api.post("/payroll-runs", { period_month: month, notes });
      toast.success("Run created"); setOpen(false); setMonth(""); setNotes(""); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const act = async (rid, path, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      const r = await api.post(`/payroll-runs/${rid}/${path}`);
      toast.success(`Run ${r.data.status}`); load(); if (active === rid) loadSlips(rid);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const loadSlips = async (rid) => {
    setActive(rid);
    try { const r = await api.get(`/payslips?run_id=${rid}`); setSlips(r.data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const download = async (url, filename) => {
    try {
      const r = await api.get(url, { responseType: "blob" });
      const blob = new Blob([r.data], { type: r.headers["content-type"] || "application/octet-stream" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const totalGross = rows.reduce((s, r) => s + (r.total_gross || 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.total_net || 0), 0);

  return (
    <AppShell title="Payroll runs">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total runs" value={rows.length} testid="stat-total-runs"/>
        <StatCard label="Cumulative gross" value={inr(totalGross)} testid="stat-total-gross"/>
        <StatCard label="Cumulative net" value={inr(totalNet)} testid="stat-total-net"/>
        <StatCard label="Published" value={rows.filter(r=>r.status==="published").length} hint="Visible to employees" testid="stat-published"/>
      </div>

      <SectionCard
        title="Monthly cycles"
        subtitle="Draft → Compute → Finalise → Publish. Each cycle pro-rates salaries by LOP from approved leaves."
        testid="section-runs"
        action={
          <Button size="sm" onClick={()=>setOpen(true)} data-testid="create-run-btn" className="gap-1.5">
            <Plus size={14} weight="bold"/> New run
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Working days</TableHead>
              <TableHead className="text-right">Employees</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right w-72">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-8">No runs yet — click "New run" to create one.</TableCell></TableRow>
            )}
            {rows.map(r => (
              <TableRow key={r.id} data-testid={`run-row-${r.period_month}`}>
                <TableCell className="font-medium">{r.period_label}</TableCell>
                <TableCell><Badge className={STATUS_COLOR[r.status] || ""}>{r.status}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{r.working_days}</TableCell>
                <TableCell className="text-right tabular-nums">{r.total_employees}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.total_gross)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{inr(r.total_net)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Button size="sm" variant="outline" onClick={()=>loadSlips(r.id)} data-testid={`view-slips-${r.period_month}`}>View slips</Button>
                    {(r.status === "draft" || r.status === "computed") && (
                      <Button size="sm" onClick={()=>act(r.id, "compute")} data-testid={`compute-${r.period_month}`} className="gap-1">
                        <Play size={12} weight="fill"/> Compute
                      </Button>
                    )}
                    {r.status === "computed" && (
                      <Button size="sm" variant="secondary" onClick={()=>act(r.id, "finalise", "Finalise? Payslips become immutable.")} data-testid={`finalise-${r.period_month}`}>Finalise</Button>
                    )}
                    {r.status === "finalised" && (
                      <Button size="sm" onClick={()=>act(r.id, "publish", "Publish payslips to employees?")} data-testid={`publish-${r.period_month}`} className="gap-1">
                        <LockSimple size={12} weight="fill"/> Publish
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {active && (
        <SectionCard title={`Payslips — ${rows.find(r => r.id === active)?.period_label}`}
          subtitle="Click Download for an individual PDF payslip."
          testid="section-payslips"
          action={
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1"
                onClick={()=>download(`/payroll-runs/${active}/exports/bank-advice`, `bank_advice_${active}.csv`)}
                data-testid="dl-bank"><FileArrowDown size={14}/> Bank advice</Button>
              <Button size="sm" variant="outline" className="gap-1"
                onClick={()=>download(`/payroll-runs/${active}/exports/form-24q`, `form_24q_${active}.csv`)}
                data-testid="dl-24q"><FileArrowDown size={14}/> Form 24Q</Button>
              <Button size="sm" variant="outline" className="gap-1"
                onClick={()=>download(`/payroll-runs/${active}/exports/pf-ecr`, `pf_ecr_${active}.csv`)}
                data-testid="dl-pfecr"><FileArrowDown size={14}/> PF ECR</Button>
              <Button size="sm" variant="outline" className="gap-1"
                onClick={()=>download(`/payroll-runs/${active}/exports/esic-monthly`, `esic_${active}.csv`)}
                data-testid="dl-esic"><FileArrowDown size={14}/> ESIC</Button>
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Paid days</TableHead>
                <TableHead className="text-right">LOP</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slips.map(s => (
                <TableRow key={s.id}>
                  <TableCell><div className="font-medium">{s.employee_name}</div><div className="text-xs text-zinc-500">{s.employee_code}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{s.paid_days}/{s.working_days}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.lop_days}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(s.actual_gross)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(s.total_deductions)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{inr(s.actual_net)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="gap-1"
                      onClick={()=>download(`/payslips/${s.id}/pdf`, `payslip_${s.period_month}_${s.employee_code}.pdf`)}
                      data-testid={`dl-slip-${s.employee_code}`}>
                      <DownloadSimple size={14}/> PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="create-run-dialog">
          <DialogHeader><DialogTitle>New payroll run</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Period (YYYY-MM)</Label>
              <Input value={month} onChange={e=>setMonth(e.target.value)} placeholder="2026-04" data-testid="run-month-input"/>
              <p className="text-xs text-zinc-500 mt-1">Working days and LOP will be auto-calculated for this month.</p>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g., Q4 bonus not included" data-testid="run-notes-input"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={create} data-testid="run-submit-btn">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
