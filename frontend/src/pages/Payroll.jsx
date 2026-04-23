import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, PencilSimple, Trash, LockSimple, CurrencyInr } from "@phosphor-icons/react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Payroll() {
  const [tab, setTab] = useState("compensations");
  return (
    <AppShell title="Payroll">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[
          {k:"compensations",l:"Employee CTC"},
          {k:"structures",l:"Salary structures"},
          {k:"components",l:"Components"},
        ].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            data-testid={`pay-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "components" && <ComponentsTab/>}
      {tab === "structures" && <StructuresTab/>}
      {tab === "compensations" && <CompensationsTab/>}
    </AppShell>
  );
}

function ComponentsTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);
  const load = () => api.get("/salary-components").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const blank = () => ({ name:"", code:"", kind:"earning", category:"basic",
    calculation_type:"fixed", default_value:0, is_taxable:true, is_in_ctc:true,
    is_pf_applicable:false, is_esic_applicable:false, is_pt_applicable:false,
    display_on_payslip:true, hra_exempt_sec10:false, lta_exempt:false, sort_order:10 });
  const save = async () => {
    try {
      if (f.id) await api.put(`/salary-components/${f.id}`, f);
      else await api.post("/salary-components", f);
      toast.success("Saved"); setOpen(false); setF(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Disable component?")) return; await api.delete(`/salary-components/${id}`); toast.success("Disabled"); load(); };

  return (
    <SectionCard title={`${rows.length} components`} subtitle="Earnings, deductions, and employer-cost line items. Statutory ones are locked." testid="section-components"
      action={<Button size="sm" className="gap-1.5" onClick={()=>{ setF(blank()); setOpen(true); }} data-testid="add-comp-btn"><Plus size={14} weight="bold"/> Add component</Button>}
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead>Component</TableHead><TableHead>Kind</TableHead><TableHead>Calculation</TableHead>
          <TableHead>Taxable</TableHead><TableHead>PF</TableHead><TableHead>ESIC</TableHead><TableHead/>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(c => (
            <TableRow key={c.id} data-testid={`comp-row-${c.code}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="outline" className="text-[10px]">{c.code}</Badge>
                  {c.is_locked && <LockSimple size={12} className="text-zinc-400" title="Statutory — locked"/>}
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className={`text-[10px] uppercase ${c.kind==='earning'?'bg-emerald-50 border-emerald-200 text-emerald-700':c.kind==='deduction'?'bg-red-50 border-red-200 text-red-700':'bg-zinc-50'}`}>{c.kind}</Badge></TableCell>
              <TableCell className="text-xs">
                {c.calculation_type === "pct_of_ctc" && `${c.default_value}% of CTC`}
                {c.calculation_type === "pct_of_basic" && `${c.default_value}% of Basic`}
                {c.calculation_type === "fixed" && `₹${c.default_value}`}
                {c.calculation_type === "statutory" && `Statutory (${c.default_value}%)`}
              </TableCell>
              <TableCell>{c.is_taxable ? "Yes" : "No"}</TableCell>
              <TableCell>{c.is_pf_applicable ? "Yes" : "—"}</TableCell>
              <TableCell>{c.is_esic_applicable ? "Yes" : "—"}</TableCell>
              <TableCell className="text-right">
                {!c.is_locked && (
                  <>
                    <Button size="sm" variant="outline" onClick={()=>{ setF({...c}); setOpen(true); }}><PencilSimple size={14}/></Button>
                    <Button size="sm" variant="ghost" className="text-red-600 ml-1" onClick={()=>del(c.id)}><Trash size={14}/></Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={v=>{ setOpen(v); if (!v) setF(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{f?.id ? "Edit component" : "New component"}</DialogTitle></DialogHeader>
          {f && <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="comp-name"/></div>
              <div><Label>Code</Label><Input className="mt-1" value={f.code} onChange={e=>setF({...f,code:e.target.value.toUpperCase()})} maxLength={10} data-testid="comp-code"/></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Kind</Label>
                <Select value={f.kind} onValueChange={v=>setF({...f,kind:v})}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="earning">Earning</SelectItem><SelectItem value="deduction">Deduction</SelectItem><SelectItem value="employer_cost">Employer Cost</SelectItem></SelectContent>
                </Select></div>
              <div><Label>Calculation</Label>
                <Select value={f.calculation_type} onValueChange={v=>setF({...f,calculation_type:v})}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed ₹</SelectItem>
                    <SelectItem value="pct_of_ctc">% of CTC</SelectItem>
                    <SelectItem value="pct_of_basic">% of Basic</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label>Default value</Label><Input type="number" step="0.01" className="mt-1" value={f.default_value} onChange={e=>setF({...f,default_value:Number(e.target.value)})}/></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {[
                ["is_taxable","Taxable"],["is_in_ctc","Part of CTC"],
                ["is_pf_applicable","Counts toward PF wages"],["is_esic_applicable","Counts toward ESIC"],
                ["is_pt_applicable","Counts toward PT"],["display_on_payslip","Show on payslip"],
                ["hra_exempt_sec10","HRA exempt (Sec 10(13A))"],["lta_exempt","LTA exempt"],
              ].map(([k,lbl])=>(
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!f[k]} onChange={e=>setF({...f,[k]:e.target.checked})}/>
                  <span>{lbl}</span>
                </label>
              ))}
            </div>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={()=>{ setOpen(false); setF(null); }}>Cancel</Button><Button onClick={save} data-testid="comp-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function StructuresTab() {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/salary-structures").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  return (
    <SectionCard title={`${rows.length} salary structures`} subtitle="Reusable CTC templates per grade/band. Assign to new hires to auto-fill their compensation." testid="section-structures">
      <div className="grid grid-cols-2 gap-4">
        {rows.map(s => (
          <div key={s.id} className="bg-white border border-zinc-200 rounded-lg p-5" data-testid={`struct-card-${s.id}`}>
            <div className="tiny-label mb-1">{s.applies_to_grades?.join(" · ") || "All grades"}</div>
            <div className="font-display font-semibold">{s.name}</div>
            <div className="text-xs text-zinc-500 mt-1">Target CTC: {inr(s.target_ctc_annual)}/year</div>
            <div className="mt-3 divide-y divide-zinc-100 text-xs">
              {(s.lines||[]).slice(0, 6).map(l => (
                <div key={l.component_code} className="flex items-center justify-between py-1.5">
                  <span className="text-zinc-600">{l.component_name}</span>
                  <span className="font-mono-alt">
                    {l.calculation_type === "fixed" ? `₹${l.value}` :
                     l.calculation_type === "pct_of_ctc" ? `${l.value}% CTC` :
                     l.calculation_type === "pct_of_basic" ? `${l.value}% Basic` :
                     "Statutory"}
                  </span>
                </div>
              ))}
              {s.lines?.length > 6 && <div className="text-zinc-400 py-1">+ {s.lines.length - 6} more…</div>}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function CompensationsTab() {
  const [rows, setRows] = useState([]);
  const [structures, setStructures] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employee_id:"", structure_id:"", ctc_annual:0, effective_from:"", tax_regime:"new", revised_reason:"" });
  const [preview, setPreview] = useState(null);

  const load = async () => {
    const [a, st, e] = await Promise.all([
      api.get("/compensation/all"),
      api.get("/salary-structures"),
      api.get("/employees"),
    ]);
    setRows(a.data); setStructures(st.data); setEmployees(e.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const { data } = await api.post("/compensation/assign", f);
      toast.success("Compensation assigned");
      setPreview(data);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const totals = {
    assigned: rows.length,
    totalCTC: rows.reduce((a, r) => a + (r.ctc_annual || 0), 0),
    unassigned: employees.filter(e => !rows.find(r => r.employee_id === e.id)).length,
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Employees with CTC" value={totals.assigned} testid="stat-assigned"/>
        <StatCard label="Total CTC / year" value={inr(totals.totalCTC)} testid="stat-totalctc"/>
        <StatCard label="Unassigned" value={totals.unassigned} testid="stat-unassigned"/>
      </div>

      <SectionCard title="Employee compensation" subtitle="One current CTC per employee. Revisions create a new version with effective_from." testid="section-compensations"
        action={<Dialog open={open} onOpenChange={v=>{setOpen(v); if(!v){setF({employee_id:"",structure_id:"",ctc_annual:0,effective_from:"",tax_regime:"new",revised_reason:""}); setPreview(null);}}}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5" data-testid="assign-btn"><Plus size={14} weight="bold"/> Assign CTC</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Assign / revise compensation</DialogTitle></DialogHeader>
            {!preview && <div className="space-y-3 py-2">
              <div><Label>Employee</Label>
                <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}>
                  <SelectTrigger className="mt-1" data-testid="assign-emp"><SelectValue placeholder="Pick"/></SelectTrigger>
                  <SelectContent>{employees.map(e=><SelectItem key={e.id} value={e.id}>{e.name} · {e.employee_code}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Structure (template)</Label>
                  <Select value={f.structure_id} onValueChange={v=>setF({...f,structure_id:v})}>
                    <SelectTrigger className="mt-1" data-testid="assign-struct"><SelectValue placeholder="Default"/></SelectTrigger>
                    <SelectContent>{structures.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>CTC (annual ₹)</Label>
                  <Input type="number" step="1000" className="mt-1" value={f.ctc_annual} onChange={e=>setF({...f,ctc_annual:Number(e.target.value)})} data-testid="assign-ctc"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Effective from</Label><Input type="date" className="mt-1" value={f.effective_from} onChange={e=>setF({...f,effective_from:e.target.value})} data-testid="assign-effective"/></div>
                <div><Label>Tax regime</Label>
                  <Select value={f.tax_regime} onValueChange={v=>setF({...f,tax_regime:v})}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="new">New regime (default 2020+)</SelectItem><SelectItem value="old">Old regime</SelectItem></SelectContent>
                  </Select></div>
              </div>
              <div><Label>Revision reason (optional)</Label><Input className="mt-1" value={f.revised_reason} onChange={e=>setF({...f,revised_reason:e.target.value})} placeholder="Appraisal / promotion / market correction"/></div>
            </div>}

            {preview && <CompensationBreakdown sal={preview}/>}

            <DialogFooter>
              {!preview && <><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
                <Button onClick={submit} data-testid="assign-submit">Assign</Button></>}
              {preview && <Button onClick={()=>setOpen(false)}>Done</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>}
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>Structure</TableHead><TableHead>CTC/yr</TableHead>
            <TableHead>Gross/mo</TableHead><TableHead>Net/mo</TableHead><TableHead>Regime</TableHead><TableHead>From</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-zinc-500">No CTCs assigned yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id} data-testid={`comp-row-${r.employee_id}`}>
                <TableCell><div className="font-medium">{r.employee_name}</div><div className="text-xs text-zinc-500">{r.employee_code}</div></TableCell>
                <TableCell className="text-xs">{r.structure_name || "Custom"}</TableCell>
                <TableCell className="font-mono-alt">{inr(r.ctc_annual)}</TableCell>
                <TableCell className="font-mono-alt">{inr(r.gross_monthly)}</TableCell>
                <TableCell className="font-mono-alt font-medium">{inr(r.net_monthly_estimate)}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.tax_regime}</Badge></TableCell>
                <TableCell className="text-xs">{r.effective_from}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}

function CompensationBreakdown({ sal }) {
  const earnings = sal.lines.filter(l => l.kind === "earning");
  const deductions = sal.lines.filter(l => l.kind === "deduction");
  const employer = sal.lines.filter(l => l.kind === "employer_cost");
  return (
    <div className="py-2 space-y-4" data-testid="comp-preview">
      <div className="bg-zinc-50 border border-zinc-200 rounded-md p-4">
        <div className="tiny-label">Monthly summary</div>
        <div className="grid grid-cols-3 gap-4 mt-2">
          <div><div className="text-xs text-zinc-500">Gross</div><div className="font-display font-bold text-xl">{inr(sal.gross_monthly)}</div></div>
          <div><div className="text-xs text-zinc-500">Deductions</div><div className="font-display font-bold text-xl text-red-600">-{inr(deductions.reduce((a,d)=>a+d.monthly_amount,0))}</div></div>
          <div><div className="text-xs text-zinc-500">Net estimate</div><div className="font-display font-bold text-xl text-emerald-600">{inr(sal.net_monthly_estimate)}</div></div>
        </div>
      </div>
      <Breakdown title="Earnings" lines={earnings} color="text-emerald-700"/>
      <Breakdown title="Deductions" lines={deductions} color="text-red-600"/>
      {employer.length > 0 && <Breakdown title="Employer contributions (not in take-home)" lines={employer} color="text-zinc-500" small/>}
    </div>
  );
}

function Breakdown({ title, lines, color, small }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <div className={`tiny-label mb-2 ${color}`}>{title}</div>
      <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-md">
        {lines.map(l => (
          <div key={l.component_code} className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span>{l.component_name}</span>
              <Badge variant="outline" className="text-[10px]">{l.component_code}</Badge>
            </div>
            <div className={`font-mono-alt ${small?"text-zinc-500":""}`}>{inr(l.monthly_amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
