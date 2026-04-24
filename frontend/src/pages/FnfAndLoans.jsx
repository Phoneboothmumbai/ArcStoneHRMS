import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Calculator } from "@phosphor-icons/react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const FNF_STATUS = {
  draft:"bg-zinc-100 text-zinc-700",
  computed:"bg-blue-100 text-blue-800",
  approved:"bg-purple-100 text-purple-800",
  paid:"bg-emerald-100 text-emerald-800",
};
const LOAN_STATUS = {
  active:"bg-amber-100 text-amber-800",
  closed:"bg-emerald-100 text-emerald-800",
  waived:"bg-zinc-100 text-zinc-700",
  on_hold:"bg-blue-100 text-blue-800",
};

export default function FnfAndLoans() {
  const [tab, setTab] = useState("fnf");
  return (
    <AppShell title="F&F & Loans">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[{k:"fnf",l:"Final settlements"},{k:"loans",l:"Employee loans"}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} data-testid={`fnf-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>
            {t.l}
          </button>
        ))}
      </div>
      {tab === "fnf" ? <FnFTab/> : <LoansTab/>}
    </AppShell>
  );
}

function FnFTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employee_id:"", last_working_day:"", notice_served_days:30, bonus_pending:0, other_deductions:0, notes:"" });
  const [employees, setEmployees] = useState([]);
  const [detail, setDetail] = useState(null);

  const load = async () => { try { const r = await api.get("/fnf"); setRows(r.data); } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); } };
  useEffect(() => { load(); api.get("/employees").then(r => setEmployees(r.data)); }, []);

  const compute = async () => {
    try {
      const r = await api.post("/fnf/compute", f);
      toast.success("F&F computed"); setDetail(r.data); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const act = async (fid, path, body, msg) => {
    if (msg && !window.confirm(msg)) return;
    try { await api.post(`/fnf/${fid}/${path}`, body || {}); toast.success("Done"); load(); setDetail(null); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total settlements" value={rows.length} testid="fnf-stat-total"/>
        <StatCard label="Pending approval" value={rows.filter(r=>r.status==="computed").length} testid="fnf-stat-pending"/>
        <StatCard label="Ready to pay" value={rows.filter(r=>r.status==="approved").length} testid="fnf-stat-ready"/>
        <StatCard label="Paid this year" value={rows.filter(r=>r.status==="paid").length} testid="fnf-stat-paid"/>
      </div>
      <SectionCard title="Settlements" subtitle="Computes pending salary, leave encashment, gratuity (≥5 yrs, 15/26), notice recovery, loan recovery."
        testid="section-fnf"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="fnf-new-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New F&F</Button>}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead>Last working day</TableHead>
            <TableHead className="text-right">Earnings</TableHead><TableHead className="text-right">Deductions</TableHead>
            <TableHead className="text-right">Net</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-6">No settlements yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell><div className="font-medium">{r.employee_name}</div><div className="text-xs text-zinc-500">{r.employee_code}</div></TableCell>
                <TableCell><Badge className={FNF_STATUS[r.status]}>{r.status}</Badge></TableCell>
                <TableCell>{r.last_working_day}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.total_earnings)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.total_deductions)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{inr(r.net_payable)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={()=>setDetail(r)}>View</Button>
                    {r.status === "computed" && <Button size="sm" onClick={()=>act(r.id, "approve")}>Approve</Button>}
                    {r.status === "approved" && <Button size="sm" onClick={()=>{ const ref=prompt("NEFT/UTR reference?")||""; act(r.id,"mark-paid",{payment_reference:ref},"Mark as paid?"); }}>Mark paid</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Compute F&F settlement</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Employee</Label>
              <Select value={f.employee_id} onValueChange={v=>setF({...f, employee_id:v})}>
                <SelectTrigger data-testid="fnf-emp"><SelectValue placeholder="Select employee"/></SelectTrigger>
                <SelectContent>{employees.map(e=>(<SelectItem key={e.id} value={e.id}>{e.name} · {e.employee_code || e.email}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div><Label>Last working day</Label><Input type="date" value={f.last_working_day} onChange={e=>setF({...f, last_working_day:e.target.value})} data-testid="fnf-lwd"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Notice served (days)</Label><Input type="number" value={f.notice_served_days} onChange={e=>setF({...f, notice_served_days:+e.target.value})}/></div>
              <div><Label>Bonus pending</Label><Input type="number" value={f.bonus_pending} onChange={e=>setF({...f, bonus_pending:+e.target.value})}/></div>
            </div>
            <div><Label>Other deductions</Label><Input type="number" value={f.other_deductions} onChange={e=>setF({...f, other_deductions:+e.target.value})}/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={compute} className="gap-1.5"><Calculator size={14}/> Compute</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={()=>setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.employee_name} · {detail?.status?.toUpperCase()}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-zinc-500">Pending salary:</span> <b>{inr(detail.pending_salary_amount)}</b> ({detail.pending_salary_days}d)</div>
                <div><span className="text-zinc-500">Leave encash:</span> <b>{inr(detail.leave_encashment_amount)}</b> ({detail.leave_encashment_days}d)</div>
                <div><span className="text-zinc-500">Gratuity:</span> <b>{inr(detail.gratuity_amount)}</b></div>
                <div><span className="text-zinc-500">Bonus:</span> <b>{inr(detail.bonus_pending)}</b></div>
                <div><span className="text-zinc-500">Notice recovery:</span> <b>{inr(detail.notice_recovery_amount)}</b></div>
                <div><span className="text-zinc-500">Loan recovery:</span> <b>{inr(detail.loan_recovery)}</b></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>{(detail.components||[]).map((c,i)=>(
                  <TableRow key={i}><TableCell>{c.label}</TableCell><TableCell><Badge variant={c.kind==="earning"?"default":"destructive"}>{c.kind}</Badge></TableCell><TableCell className="text-right tabular-nums">{inr(c.amount)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
              <div className="border-t pt-3 mt-3 flex items-center justify-between">
                <span className="text-sm text-zinc-500">Net payable</span>
                <span className="text-2xl font-bold">{inr(detail.net_payable)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoansTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employee_id:"", loan_type:"salary_advance", principal:0, emi_monthly:0, tenure_months:6, interest_pct:0, start_month:"", notes:"" });
  const [employees, setEmployees] = useState([]);

  const load = async () => { try { const r = await api.get("/loans"); setRows(r.data); } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); } };
  useEffect(() => { load(); api.get("/employees").then(r=>setEmployees(r.data)); }, []);
  const save = async () => {
    try { await api.post("/loans", f); toast.success("Loan created"); setOpen(false); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <>
      <SectionCard title="Employee loans" subtitle="Salary advances, personal loans, medical, housing. Auto-builds amortisation schedule."
        testid="section-loans"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="loan-new-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New loan</Button>}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Principal</TableHead><TableHead className="text-right">EMI</TableHead>
            <TableHead className="text-right">Tenure</TableHead><TableHead className="text-right">Outstanding</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-6">No loans yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.employee_name}</TableCell>
                <TableCell className="capitalize">{r.loan_type.replace(/_/g," ")}</TableCell>
                <TableCell><Badge className={LOAN_STATUS[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.principal)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.emi_monthly)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.tenure_months}m</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{inr(r.outstanding)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New loan</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Employee</Label>
              <Select value={f.employee_id} onValueChange={v=>setF({...f, employee_id:v})}>
                <SelectTrigger data-testid="loan-emp"><SelectValue placeholder="Select"/></SelectTrigger>
                <SelectContent>{employees.map(e=>(<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={f.loan_type} onValueChange={v=>setF({...f, loan_type:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{["personal","salary_advance","medical","housing","other"].map(t=>(<SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g," ")}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Principal</Label><Input type="number" value={f.principal} onChange={e=>setF({...f, principal:+e.target.value})}/></div>
              <div><Label>EMI / month</Label><Input type="number" value={f.emi_monthly} onChange={e=>setF({...f, emi_monthly:+e.target.value})}/></div>
              <div><Label>Tenure (months)</Label><Input type="number" value={f.tenure_months} onChange={e=>setF({...f, tenure_months:+e.target.value})}/></div>
              <div><Label>Interest % (flat)</Label><Input type="number" value={f.interest_pct} onChange={e=>setF({...f, interest_pct:+e.target.value})}/></div>
            </div>
            <div><Label>Start month (YYYY-MM)</Label><Input value={f.start_month} onChange={e=>setF({...f, start_month:e.target.value})} placeholder="2026-04"/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="loan-save-btn">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
