import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, PencilSimple, Trash, CalendarBlank } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function LeaveAdmin() {
  const [tab, setTab] = useState("types");
  return (
    <AppShell title="Leave Administration">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[{k:"types",l:"Leave types"},{k:"holidays",l:"Holidays"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            data-testid={`leaveadmin-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
              tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"
            }`}>{t.l}</button>
        ))}
      </div>
      {tab === "types" && <LeaveTypesTab/>}
      {tab === "holidays" && <HolidaysTab/>}
    </AppShell>
  );
}

function LeaveTypesTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);

  const load = async () => {
    const { data } = await api.get("/leave-types");
    setRows(data);
  };
  useEffect(() => { load(); }, []);

  const blank = () => ({
    name:"", code:"", color:"#64748b", default_days_per_year:0,
    accrual_cadence:"yearly", carry_forward:false, carry_forward_cap:null,
    encashable:false, encashment_cap:null, is_paid:true,
    requires_document:false, document_after_days:3,
    applies_to_gender:"any", min_service_months:0,
    allow_half_day:true, allow_negative_balance:false,
    max_consecutive_days:null, notice_days:0, is_active:true, sort_order:10,
    applies_to_grades:[], applies_to_employment_types:[],
  });

  const save = async () => {
    try {
      const payload = { ...f };
      if (f.id) {
        await api.put(`/leave-admin/types/${f.id}`, payload);
      } else {
        await api.post("/leave-admin/types", payload);
      }
      toast.success("Saved"); setOpen(false); setF(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const del = async (id) => {
    if (!window.confirm("Disable this leave type? (Existing balances remain)")) return;
    await api.delete(`/leave-admin/types/${id}`);
    toast.success("Disabled"); load();
  };

  return (
    <SectionCard title={`${rows.length} leave types`} subtitle="Configure policies per type. Each type drives its own balance ledger." testid="section-leave-types"
      action={<Button size="sm" className="gap-1.5" onClick={()=>{ setF(blank()); setOpen(true); }} data-testid="add-type-btn"><Plus size={14} weight="bold"/> Add type</Button>}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Days/yr</TableHead>
            <TableHead>Accrual</TableHead>
            <TableHead>Carry fwd</TableHead>
            <TableHead>Encashable</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead/>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(t => (
            <TableRow key={t.id} data-testid={`type-row-${t.code}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }}/>
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="outline" className="text-[10px]">{t.code}</Badge>
                </div>
              </TableCell>
              <TableCell>{t.default_days_per_year.toFixed(1)}</TableCell>
              <TableCell><span className="text-xs capitalize">{t.accrual_cadence.replace(/_/g," ")}</span></TableCell>
              <TableCell>{t.carry_forward ? `Yes${t.carry_forward_cap?" (cap "+t.carry_forward_cap+")":""}` : "No"}</TableCell>
              <TableCell>{t.encashable ? "Yes" : "No"}</TableCell>
              <TableCell>{t.is_paid ? "Yes" : "No"}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={()=>{ setF({...t}); setOpen(true); }} data-testid={`edit-type-${t.code}`}><PencilSimple size={14}/></Button>
                <Button size="sm" variant="ghost" className="text-red-600 ml-1" onClick={()=>del(t.id)} data-testid={`del-type-${t.code}`}><Trash size={14}/></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={v=>{ setOpen(v); if(!v) setF(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{f?.id ? "Edit leave type" : "New leave type"}</DialogTitle></DialogHeader>
          {f && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>Name</Label>
                  <Input className="mt-1" value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="form-name"/>
                </div>
                <div>
                  <Label>Code</Label>
                  <Input className="mt-1" value={f.code} onChange={e=>setF({...f,code:e.target.value.toUpperCase()})} maxLength={8} data-testid="form-code"/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Color</Label>
                  <Input type="color" className="mt-1 h-9 p-1" value={f.color} onChange={e=>setF({...f,color:e.target.value})}/>
                </div>
                <div>
                  <Label>Default days/year</Label>
                  <Input type="number" step="0.5" className="mt-1" value={f.default_days_per_year} onChange={e=>setF({...f,default_days_per_year:Number(e.target.value)})}/>
                </div>
                <div>
                  <Label>Accrual cadence</Label>
                  <Select value={f.accrual_cadence} onValueChange={v=>setF({...f,accrual_cadence:v})}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {["yearly","monthly","quarterly","on_joining","none"].map(c=><SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gender eligibility</Label>
                  <Select value={f.applies_to_gender} onValueChange={v=>setF({...f,applies_to_gender:v})}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="female">Female only</SelectItem>
                      <SelectItem value="male">Male only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Min. service months</Label>
                  <Input type="number" className="mt-1" value={f.min_service_months} onChange={e=>setF({...f,min_service_months:Number(e.target.value)})}/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Notice days</Label>
                  <Input type="number" className="mt-1" value={f.notice_days} onChange={e=>setF({...f,notice_days:Number(e.target.value)})}/>
                </div>
                <div>
                  <Label>Max consecutive</Label>
                  <Input type="number" className="mt-1" value={f.max_consecutive_days||""} onChange={e=>setF({...f,max_consecutive_days: e.target.value===""?null:Number(e.target.value)})}/>
                </div>
                <div>
                  <Label>Carry fwd cap</Label>
                  <Input type="number" className="mt-1" value={f.carry_forward_cap||""} onChange={e=>setF({...f,carry_forward_cap: e.target.value===""?null:Number(e.target.value)})}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  ["is_paid","Paid leave (counts as salary)"],
                  ["carry_forward","Carry forward to next year"],
                  ["encashable","Encashable on F&F"],
                  ["requires_document","Requires medical / proof doc"],
                  ["allow_half_day","Allow half-day"],
                  ["allow_negative_balance","Allow negative balance (LOP style)"],
                ].map(([k,lbl])=>(
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!f[k]} onChange={e=>setF({...f,[k]:e.target.checked})}/>
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={()=>{ setOpen(false); setF(null); }}>Cancel</Button>
            <Button onClick={save} data-testid="form-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function HolidaysTab() {
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);

  const load = async () => {
    const { data } = await api.get(`/holidays?year=${year}`);
    setRows(data);
  };
  useEffect(() => { load(); }, [year]);

  const save = async () => {
    try {
      if (f.id) await api.put(`/holidays/${f.id}`, f);
      else await api.post("/holidays", f);
      toast.success("Saved"); setOpen(false); setF(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete holiday?")) return;
    await api.delete(`/holidays/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <SectionCard title={`${rows.length} holidays for ${year}`} testid="section-holidays-admin"
      action={
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={v=>setYear(Number(v))}>
            <SelectTrigger className="w-24 h-9"><SelectValue/></SelectTrigger>
            <SelectContent>{[2025,2026,2027].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={()=>{ setF({ date:"", name:"", kind:"mandatory", notes:"" }); setOpen(true); }} data-testid="add-holiday-btn"><Plus size={14} weight="bold"/> Add holiday</Button>
        </div>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead/>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(h => (
            <TableRow key={h.id} data-testid={`holiday-admin-row-${h.id}`}>
              <TableCell className="font-mono-alt text-sm">{h.date}</TableCell>
              <TableCell>{h.name}</TableCell>
              <TableCell><Badge variant="outline" className={`text-[10px] uppercase ${h.kind==='mandatory'?'bg-emerald-50 border-emerald-200 text-emerald-700':''}`}>{h.kind}</Badge></TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={()=>{ setF({...h}); setOpen(true); }}><PencilSimple size={14}/></Button>
                <Button size="sm" variant="ghost" className="text-red-600 ml-1" onClick={()=>del(h.id)}><Trash size={14}/></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={v=>{ setOpen(v); if(!v) setF(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{f?.id ? "Edit holiday" : "New holiday"}</DialogTitle></DialogHeader>
          {f && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" className="mt-1" value={f.date} onChange={e=>setF({...f,date:e.target.value})} data-testid="hol-date"/>
                </div>
                <div>
                  <Label>Kind</Label>
                  <Select value={f.kind} onValueChange={v=>setF({...f,kind:v})}>
                    <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mandatory">Mandatory (excluded from leave count)</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                      <SelectItem value="restricted">Restricted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Name</Label>
                <Input className="mt-1" value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="hol-name"/>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input className="mt-1" value={f.notes||""} onChange={e=>setF({...f,notes:e.target.value})}/>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={()=>{ setOpen(false); setF(null); }}>Cancel</Button>
            <Button onClick={save} data-testid="hol-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
