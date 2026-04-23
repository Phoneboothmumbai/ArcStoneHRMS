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
import { Plus, PencilSimple, Trash, MapPin } from "@phosphor-icons/react";
import { toast } from "sonner";

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function AttendanceAdmin() {
  const [tab, setTab] = useState("shifts");
  return (
    <AppShell title="Attendance Administration">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[{k:"shifts",l:"Shifts"},{k:"assignments",l:"Shift assignments"},{k:"sites",l:"Work sites (geo-fence)"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            data-testid={`attadmin-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "shifts" && <ShiftsTab/>}
      {tab === "assignments" && <AssignmentsTab/>}
      {tab === "sites" && <SitesTab/>}
    </AppShell>
  );
}

function ShiftsTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);
  const load = () => api.get("/shifts").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const blank = () => ({ name:"", code:"", category:"general", start_time:"09:00", end_time:"18:00",
    break_minutes:60, is_overnight:false, grace_minutes:15, half_day_threshold_hours:4.5,
    min_hours_for_full_day:8, weekly_offs:[6], color:"#0ea5e9", is_default:false, sort_order:10 });
  const save = async () => {
    try { const payload = { ...f };
      if (f.id) await api.put(`/shifts/${f.id}`, payload);
      else await api.post("/shifts", payload);
      toast.success("Saved"); setOpen(false); setF(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const del = async (id) => { if(!window.confirm("Disable shift?")) return; await api.delete(`/shifts/${id}`); toast.success("Disabled"); load(); };
  const toggleWO = (idx) => setF(x => ({ ...x, weekly_offs: x.weekly_offs.includes(idx) ? x.weekly_offs.filter(w=>w!==idx) : [...x.weekly_offs, idx].sort() }));

  return (
    <SectionCard title={`${rows.length} shifts`} testid="section-shifts"
      action={<Button size="sm" className="gap-1.5" onClick={()=>{ setF(blank()); setOpen(true); }} data-testid="add-shift-btn"><Plus size={14} weight="bold"/> Add shift</Button>}
    >
      <Table>
        <TableHeader><TableRow>
          <TableHead>Shift</TableHead><TableHead>Time</TableHead><TableHead>Break</TableHead>
          <TableHead>Grace</TableHead><TableHead>Weekly offs</TableHead><TableHead>Default</TableHead><TableHead/>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(s => (
            <TableRow key={s.id} data-testid={`shift-row-${s.code}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }}/>
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="outline" className="text-[10px]">{s.code}</Badge>
                </div>
                <div className="text-xs text-zinc-500 capitalize">{s.category}</div>
              </TableCell>
              <TableCell className="font-mono-alt text-xs">{s.start_time} → {s.end_time}{s.is_overnight?" (overnight)":""}</TableCell>
              <TableCell>{s.break_minutes}m</TableCell>
              <TableCell>{s.grace_minutes}m</TableCell>
              <TableCell className="text-xs">{(s.weekly_offs||[]).map(i=>WEEKDAYS[i]).join(", ")||"—"}</TableCell>
              <TableCell>{s.is_default ? <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 text-[10px]">DEFAULT</Badge> : "—"}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={()=>{ setF({...s}); setOpen(true); }}><PencilSimple size={14}/></Button>
                <Button size="sm" variant="ghost" className="text-red-600 ml-1" onClick={()=>del(s.id)}><Trash size={14}/></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={v=>{ setOpen(v); if(!v) setF(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{f?.id ? "Edit shift" : "New shift"}</DialogTitle></DialogHeader>
          {f && <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="shift-form-name"/></div>
              <div><Label>Code</Label><Input className="mt-1" value={f.code} onChange={e=>setF({...f,code:e.target.value.toUpperCase()})} maxLength={8} data-testid="shift-form-code"/></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Start</Label><Input type="time" className="mt-1" value={f.start_time} onChange={e=>setF({...f,start_time:e.target.value})}/></div>
              <div><Label>End</Label><Input type="time" className="mt-1" value={f.end_time} onChange={e=>setF({...f,end_time:e.target.value})}/></div>
              <div><Label>Break (min)</Label><Input type="number" className="mt-1" value={f.break_minutes} onChange={e=>setF({...f,break_minutes:Number(e.target.value)})}/></div>
              <div><Label>Grace (min)</Label><Input type="number" className="mt-1" value={f.grace_minutes} onChange={e=>setF({...f,grace_minutes:Number(e.target.value)})}/></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Category</Label>
                <Select value={f.category} onValueChange={v=>setF({...f,category:v})}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent>{["general","morning","afternoon","night","split","flexible"].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Half-day ≥ hrs</Label><Input type="number" step="0.5" className="mt-1" value={f.half_day_threshold_hours} onChange={e=>setF({...f,half_day_threshold_hours:Number(e.target.value)})}/></div>
              <div><Label>Full-day ≥ hrs</Label><Input type="number" step="0.5" className="mt-1" value={f.min_hours_for_full_day} onChange={e=>setF({...f,min_hours_for_full_day:Number(e.target.value)})}/></div>
              <div><Label>Color</Label><Input type="color" className="mt-1 h-9 p-1" value={f.color} onChange={e=>setF({...f,color:e.target.value})}/></div>
            </div>
            <div>
              <Label>Weekly offs</Label>
              <div className="flex gap-2 mt-1">
                {WEEKDAYS.map((d,i)=>(
                  <button key={i} type="button"
                    onClick={()=>toggleWO(i)}
                    className={`px-3 py-1 text-xs rounded border ${f.weekly_offs.includes(i)?"bg-zinc-950 text-white border-zinc-950":"bg-white text-zinc-700 border-zinc-200"}`}
                  >{d}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!f.is_overnight} onChange={e=>setF({...f,is_overnight:e.target.checked})}/>
                Overnight shift (crosses midnight)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!f.is_default} onChange={e=>setF({...f,is_default:e.target.checked})}/>
                Set as default (for unassigned employees)
              </label>
            </div>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={()=>{ setOpen(false); setF(null); }}>Cancel</Button><Button onClick={save} data-testid="shift-form-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function AssignmentsTab() {
  const [rows, setRows] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [emps, setEmps] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employee_id:"", shift_id:"", from_date:"", to_date:"", notes:"" });
  const load = async () => {
    const [a, s, e] = await Promise.all([api.get("/shift-assignments"), api.get("/shifts"), api.get("/employees")]);
    setRows(a.data); setShifts(s.data); setEmps(e.data);
  };
  useEffect(() => { load(); }, []);
  const submit = async () => {
    try { await api.post("/shift-assignments", f); toast.success("Assigned"); setOpen(false);
      setF({ employee_id:"", shift_id:"", from_date:"", to_date:"", notes:"" }); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const del = async (id) => { if(!window.confirm("Remove assignment?")) return; await api.delete(`/shift-assignments/${id}`); toast.success("Removed"); load(); };

  return (
    <SectionCard title={`${rows.length} shift assignments`} testid="section-assignments"
      action={<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" className="gap-1.5" data-testid="add-assign-btn"><Plus size={14} weight="bold"/> Assign shift</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign shift to employee</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Employee</Label>
              <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}>
                <SelectTrigger className="mt-1" data-testid="assign-emp"><SelectValue placeholder="Pick employee"/></SelectTrigger>
                <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.name} · {e.employee_code}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label>Shift</Label>
              <Select value={f.shift_id} onValueChange={v=>setF({...f,shift_id:v})}>
                <SelectTrigger className="mt-1" data-testid="assign-shift"><SelectValue placeholder="Pick shift"/></SelectTrigger>
                <SelectContent>{shifts.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><Input type="date" className="mt-1" value={f.from_date} onChange={e=>setF({...f,from_date:e.target.value})} data-testid="assign-from"/></div>
              <div><Label>To (optional)</Label><Input type="date" className="mt-1" value={f.to_date||""} onChange={e=>setF({...f,to_date:e.target.value||null})}/></div>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={submit} data-testid="assign-submit">Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    >
      {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No shift assignments yet.</div>}
      <Table>
        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Shift</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead/></TableRow></TableHeader>
        <TableBody>
          {rows.map(a=>(
            <TableRow key={a.id} data-testid={`assign-row-${a.id}`}>
              <TableCell className="font-medium">{a.employee_name}</TableCell>
              <TableCell>{a.shift_name} <Badge variant="outline" className="text-[10px] ml-1">{a.shift_code}</Badge></TableCell>
              <TableCell className="font-mono-alt text-xs">{a.from_date}</TableCell>
              <TableCell className="font-mono-alt text-xs">{a.to_date || "open"}</TableCell>
              <TableCell className="text-right"><Button size="sm" variant="ghost" className="text-red-600" onClick={()=>del(a.id)}><Trash size={14}/></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function SitesTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(null);
  const load = () => api.get("/work-sites").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const blank = () => ({ name:"", latitude:0, longitude:0, radius_meters:100, branch_id:null, ip_whitelist:[] });
  const save = async () => {
    try {
      if (f.id) await api.put(`/work-sites/${f.id}`, f);
      else await api.post("/work-sites", f);
      toast.success("Saved"); setOpen(false); setF(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const del = async (id) => { if(!window.confirm("Disable site?")) return; await api.delete(`/work-sites/${id}`); toast.success("Disabled"); load(); };

  return (
    <SectionCard title={`${rows.length} work sites`} subtitle="Employees checking in outside these sites (+radius) are blocked." testid="section-sites"
      action={<Button size="sm" className="gap-1.5" onClick={()=>{ setF(blank()); setOpen(true); }} data-testid="add-site-btn"><Plus size={14} weight="bold"/> Add site</Button>}
    >
      <Table>
        <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Coordinates</TableHead><TableHead>Radius</TableHead><TableHead/></TableRow></TableHeader>
        <TableBody>
          {rows.map(s=>(
            <TableRow key={s.id} data-testid={`site-row-${s.id}`}>
              <TableCell><div className="flex items-center gap-2"><MapPin size={14} className="text-zinc-400"/>{s.name}</div></TableCell>
              <TableCell className="font-mono-alt text-xs">{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</TableCell>
              <TableCell>{s.radius_meters}m</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={()=>{ setF({...s}); setOpen(true); }}><PencilSimple size={14}/></Button>
                <Button size="sm" variant="ghost" className="text-red-600 ml-1" onClick={()=>del(s.id)}><Trash size={14}/></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={v=>{ setOpen(v); if(!v) setF(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{f?.id ? "Edit site" : "New work site"}</DialogTitle></DialogHeader>
          {f && <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input className="mt-1" value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="site-name"/></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Latitude</Label><Input type="number" step="0.0001" className="mt-1" value={f.latitude} onChange={e=>setF({...f,latitude:Number(e.target.value)})} data-testid="site-lat"/></div>
              <div><Label>Longitude</Label><Input type="number" step="0.0001" className="mt-1" value={f.longitude} onChange={e=>setF({...f,longitude:Number(e.target.value)})} data-testid="site-lng"/></div>
              <div><Label>Radius (m)</Label><Input type="number" className="mt-1" value={f.radius_meters} onChange={e=>setF({...f,radius_meters:Number(e.target.value)})}/></div>
            </div>
            <p className="text-xs text-zinc-500">Tip: Google Maps → right-click the office → click coordinates to copy them.</p>
          </div>}
          <DialogFooter><Button variant="ghost" onClick={()=>{ setOpen(false); setF(null); }}>Cancel</Button><Button onClick={save} data-testid="site-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
