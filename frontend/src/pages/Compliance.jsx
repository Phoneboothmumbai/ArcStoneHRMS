import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../context/AuthContext";
import { Bell, Buildings, Plus, PushPin, Megaphone, Wrench } from "@phosphor-icons/react";
import { toast } from "sonner";

const CAT_COLOR = {
  payroll: "bg-amber-50 text-amber-700 border-amber-200",
  labour_law: "bg-violet-50 text-violet-700 border-violet-200",
  tax: "bg-rose-50 text-rose-700 border-rose-200",
  social_security: "bg-emerald-50 text-emerald-700 border-emerald-200",
  leave: "bg-sky-50 text-sky-700 border-sky-200",
  other: "bg-zinc-50 text-zinc-700 border-zinc-200",
};

export default function Compliance() {
  const { user } = useAuth();
  const [tab, setTab] = useState("bulletins");
  const isHR = ["super_admin", "company_admin", "country_head", "region_head"].includes(user?.role);

  return (
    <AppShell title="Compliance">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[{k:"bulletins",l:"Compliance bulletins",icon:Megaphone},{k:"lwf",l:"State LWF rules",icon:Wrench}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} data-testid={`compl-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors flex items-center gap-1.5 ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>
            <t.icon size={14}/> {t.l}
          </button>
        ))}
      </div>
      {tab === "bulletins" && <BulletinsTab isHR={isHR}/>}
      {tab === "lwf" && <LWFTab isHR={isHR}/>}
    </AppShell>
  );
}

function BulletinsTab({ isHR }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title:"", summary:"", body_markdown:"", category:"other", impact_states:"", effective_from:"", source_url:"", pinned:false });

  const load = async () => {
    try { const r = await api.get("/compliance-bulletins"); setRows(r.data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/compliance-bulletins", {
        ...f,
        impact_states: f.impact_states ? f.impact_states.split(",").map(s=>s.trim()).filter(Boolean) : [],
      });
      toast.success("Bulletin published");
      setOpen(false); setF({ title:"", summary:"", body_markdown:"", category:"other", impact_states:"", effective_from:"", source_url:"", pinned:false });
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <SectionCard title={`${rows.length} bulletin(s)`}
      subtitle="Stay current with statutory changes — PF, ESIC, PT, LWF, Form 24Q schema and more."
      testid="section-bulletins"
      action={isHR && <Button size="sm" className="gap-1.5" onClick={()=>setOpen(true)} data-testid="bulletin-new"><Plus size={14} weight="bold"/> New bulletin</Button>}>
      {rows.length === 0 && <div className="rounded border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">No bulletins yet.</div>}
      <div className="space-y-3">
        {rows.map(b => (
          <article key={b.id} className="border border-zinc-200 rounded-lg p-4 hover:shadow-sm transition-shadow" data-testid={`bulletin-${b.id}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {b.pinned && <PushPin size={14} weight="fill" className="text-amber-600"/>}
                  <Badge variant="outline" className={`text-[10px] uppercase ${CAT_COLOR[b.category]||CAT_COLOR.other}`}>{b.category.replace("_"," ")}</Badge>
                  {b.effective_from && <span className="text-[11px] text-zinc-500">effective {b.effective_from}</span>}
                  {(b.impact_states||[]).length > 0 && <span className="text-[11px] text-zinc-500">· {b.impact_states.join(", ")}</span>}
                </div>
                <h3 className="font-semibold text-sm">{b.title}</h3>
                <p className="text-sm text-zinc-600 mt-1">{b.summary}</p>
                {b.body_markdown && <div className="text-xs text-zinc-700 mt-2 whitespace-pre-line">{b.body_markdown}</div>}
                {b.source_url && <a href={b.source_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline mt-2 inline-block">Source ↗</a>}
              </div>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Publish compliance bulletin</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
            <div><Label>Title *</Label>
              <Input className="mt-1" value={f.title} onChange={e=>setF({...f,title:e.target.value})} data-testid="bulletin-title"/>
            </div>
            <div><Label>Summary *</Label>
              <Input className="mt-1" value={f.summary} onChange={e=>setF({...f,summary:e.target.value})} data-testid="bulletin-summary"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={f.category} onValueChange={v=>setF({...f,category:v})}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {["payroll","labour_law","tax","social_security","leave","other"].map(c=><SelectItem key={c} value={c}>{c.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Effective from</Label>
                <Input type="date" className="mt-1" value={f.effective_from} onChange={e=>setF({...f,effective_from:e.target.value})}/>
              </div>
            </div>
            <div><Label>Impact states (comma-separated codes, e.g. IN-MH,IN-KA, or ALL)</Label>
              <Input className="mt-1" value={f.impact_states} onChange={e=>setF({...f,impact_states:e.target.value})}/>
            </div>
            <div><Label>Body (markdown)</Label>
              <textarea className="mt-1 w-full border border-zinc-200 rounded p-2 text-sm" rows={5}
                value={f.body_markdown} onChange={e=>setF({...f,body_markdown:e.target.value})}/>
            </div>
            <div><Label>Source URL</Label>
              <Input className="mt-1" value={f.source_url} onChange={e=>setF({...f,source_url:e.target.value})} placeholder="https://www.epfindia.gov.in/..."/>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.pinned} onChange={e=>setF({...f,pinned:e.target.checked})}/>
              Pin to top
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={submit} data-testid="bulletin-publish">Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function LWFTab({ isHR }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    try { const r = await api.get("/lwf-rules"); setRows(r.data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const startEdit = (r) => { setEditing(r); setForm({
    employee_amount: r.employee_amount, employer_amount: r.employer_amount,
    cycle: r.cycle, deduction_months: r.deduction_months.join(","), applicable: r.applicable,
  }); };

  const saveEdit = async () => {
    try {
      await api.put(`/lwf-rules/${editing.id}`, {
        ...form,
        employee_amount: Number(form.employee_amount), employer_amount: Number(form.employer_amount),
        deduction_months: typeof form.deduction_months === "string"
          ? form.deduction_months.split(",").map(x => Number(x.trim())).filter(Boolean)
          : form.deduction_months,
      });
      toast.success("Updated");
      setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <SectionCard title={`Labour Welfare Fund — ${rows.length} states configured`}
      subtitle="Per-state employee + employer LWF contributions. Auto-deducted in payroll for employees whose branch belongs to the state, in the configured cycle months."
      testid="section-lwf">
      <Table>
        <TableHeader><TableRow>
          <TableHead>State</TableHead><TableHead>Employee ₹</TableHead><TableHead>Employer ₹</TableHead>
          <TableHead>Cycle</TableHead><TableHead>Months</TableHead><TableHead>Active</TableHead><TableHead/>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id} data-testid={`lwf-row-${r.state_code}`}>
              <TableCell>
                <div className="font-medium">{r.state_name}</div>
                <div className="text-xs text-zinc-500 font-mono-alt">{r.state_code}</div>
              </TableCell>
              <TableCell className="font-mono-alt">₹{r.employee_amount.toFixed(2)}</TableCell>
              <TableCell className="font-mono-alt">₹{r.employer_amount.toFixed(2)}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] capitalize">{r.cycle.replace("_", "-")}</Badge></TableCell>
              <TableCell className="text-xs font-mono-alt">{r.deduction_months.map(m=>String(m).padStart(2,"0")).join(", ")}</TableCell>
              <TableCell>{r.applicable ? <Badge variant="outline" className="text-[10px] bg-emerald-50 border-emerald-200 text-emerald-700">Yes</Badge> : <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-500">No</Badge>}</TableCell>
              <TableCell className="text-right">
                {isHR && <Button size="sm" variant="outline" onClick={()=>startEdit(r)} data-testid={`lwf-edit-${r.state_code}`}>Edit</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={v=>!v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit LWF — {editing?.state_name}</DialogTitle></DialogHeader>
          {editing && <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Employee ₹</Label>
                <Input type="number" step="0.25" className="mt-1" value={form.employee_amount} onChange={e=>setForm({...form,employee_amount:e.target.value})}/>
              </div>
              <div><Label>Employer ₹</Label>
                <Input type="number" step="0.25" className="mt-1" value={form.employer_amount} onChange={e=>setForm({...form,employer_amount:e.target.value})}/>
              </div>
            </div>
            <div><Label>Cycle</Label>
              <Select value={form.cycle} onValueChange={v=>setForm({...form,cycle:v})}>
                <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                <SelectContent>{["monthly","half_yearly","yearly"].map(c=><SelectItem key={c} value={c}>{c.replace("_","-")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Deduction months (comma-separated 1-12)</Label>
              <Input className="mt-1" value={form.deduction_months} onChange={e=>setForm({...form,deduction_months:e.target.value})}/>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.applicable} onChange={e=>setForm({...form,applicable:e.target.checked})}/>
              Applicable in payroll
            </label>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} data-testid="lwf-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
