import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, PencilSimple, Trash, MapPin, CalendarBlank, Users, Database, Trash as TrashIcon, Warning, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const TABS = [
  { k:"today",       l:"Today's Board" },
  { k:"register",    l:"Monthly Register" },
  { k:"shifts",      l:"Shifts" },
  { k:"assignments", l:"Shift assignments" },
  { k:"sites",       l:"Work sites (geo-fence)" },
  { k:"demo",        l:"Demo data (HR)" },
];

export default function AttendanceAdmin() {
  const [tab, setTab] = useState("today");
  return (
    <AppShell title="Attendance Administration">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200 overflow-x-auto">
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            data-testid={`attadmin-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors whitespace-nowrap ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "today"       && <TodayBoardTab/>}
      {tab === "register"    && <MonthlyRegisterTab/>}
      {tab === "shifts"      && <ShiftsTab/>}
      {tab === "assignments" && <AssignmentsTab/>}
      {tab === "sites"       && <SitesTab/>}
      {tab === "demo"        && <DemoDataTab/>}
    </AppShell>
  );
}

// ============================== TODAY'S BOARD ==============================
const STATUS_STYLE = {
  present:  { bg:"bg-emerald-50",  text:"text-emerald-700", border:"border-emerald-200", label:"Present" },
  late:     { bg:"bg-amber-50",    text:"text-amber-700",   border:"border-amber-200",   label:"Late" },
  half_day: { bg:"bg-orange-50",   text:"text-orange-700",  border:"border-orange-200",  label:"Half-day" },
  absent:   { bg:"bg-red-50",      text:"text-red-700",     border:"border-red-200",     label:"Absent" },
  on_leave: { bg:"bg-violet-50",   text:"text-violet-700",  border:"border-violet-200",  label:"On leave" },
  holiday:  { bg:"bg-sky-50",      text:"text-sky-700",     border:"border-sky-200",     label:"Holiday" },
  week_off: { bg:"bg-zinc-100",    text:"text-zinc-600",    border:"border-zinc-200",    label:"Week off" },
};

function StatusPill({ s }) {
  const st = STATUS_STYLE[s] || STATUS_STYLE.absent;
  return <Badge variant="outline" className={`text-[10px] ${st.bg} ${st.text} ${st.border}`}>{st.label}</Badge>;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try { const d = new Date(iso); return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); } catch { return "—"; }
}

function TodayBoardTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/attendance/live-board?on_date=${date}`);
      setData(r.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  const rows = data?.rows || [];
  const counts = data?.counts || {};
  const filtered = useMemo(() => rows.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (q && !(r.employee_name?.toLowerCase().includes(q.toLowerCase()) || r.employee_code?.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [rows, filter, q]);

  const kpis = [
    { k:"present",  label:"Present",   color:"text-emerald-700" },
    { k:"late",     label:"Late",      color:"text-amber-700" },
    { k:"half_day", label:"Half-day",  color:"text-orange-700" },
    { k:"on_leave", label:"On leave",  color:"text-violet-700" },
    { k:"absent",   label:"Absent",    color:"text-red-700" },
    { k:"wfh",      label:"WFH",       color:"text-sky-700" },
    { k:"holiday",  label:"Holiday",   color:"text-sky-700" },
    { k:"week_off", label:"Week off",  color:"text-zinc-600" },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title={`Live attendance · ${date}`}
        subtitle={loading ? "Loading…" : `${rows.length} employees tracked`}
        testid="section-today-board"
        action={
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40" value={date} onChange={e=>setDate(e.target.value)} data-testid="today-board-date"/>
            <Button size="sm" variant="outline" onClick={load} data-testid="today-board-refresh">Refresh</Button>
          </div>
        }
      >
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-4">
          {kpis.map(k => (
            <button key={k.k}
              onClick={()=>setFilter(f => f===k.k ? "all" : k.k)}
              data-testid={`today-board-kpi-${k.k}`}
              className={`text-left p-3 rounded border transition-colors ${filter===k.k?"border-zinc-950 bg-zinc-50":"border-zinc-200 hover:border-zinc-400"}`}
            >
              <div className={`text-xl font-semibold ${k.color}`}>{counts[k.k] ?? 0}</div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wide">{k.label}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Input placeholder="Search by name or code…" className="max-w-xs" value={q} onChange={e=>setQ(e.target.value)} data-testid="today-board-search"/>
          <Badge variant="outline" className="text-[10px]">{filter === "all" ? "All statuses" : STATUS_STYLE[filter]?.label}</Badge>
          {filter !== "all" && <button className="text-xs text-zinc-500 underline" onClick={()=>setFilter("all")}>Clear</button>}
          <div className="ml-auto text-xs text-zinc-500">{filtered.length} shown</div>
        </div>

        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead>Hours</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-10">No employees match this filter.</TableCell></TableRow>
            )}
            {filtered.map(r => (
              <TableRow key={r.employee_id} data-testid={`today-board-row-${r.employee_code}`}>
                <TableCell>
                  <div className="font-medium text-sm">{r.employee_name}</div>
                  <div className="text-xs text-zinc-500">{r.employee_code} · {r.job_title || "—"}</div>
                </TableCell>
                <TableCell className="text-sm">{r.department_name || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.employee_type}</Badge></TableCell>
                <TableCell>
                  <StatusPill s={r.status}/>
                  {r.leave_type && <span className="ml-1 text-[10px] text-zinc-500 capitalize">({r.leave_type})</span>}
                </TableCell>
                <TableCell className="font-mono-alt text-xs">{fmtTime(r.check_in)}{r.is_late && <span className="ml-1 text-amber-600">late</span>}</TableCell>
                <TableCell className="font-mono-alt text-xs">{fmtTime(r.check_out)}</TableCell>
                <TableCell className="font-mono-alt text-xs">{r.hours != null ? r.hours.toFixed(2) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

// ============================== MONTHLY REGISTER ==============================
const CODE_STYLE = {
  P:   "bg-emerald-100 text-emerald-700",
  "P*":"bg-amber-100 text-amber-700",
  HD:  "bg-orange-100 text-orange-700",
  A:   "bg-red-100 text-red-700",
  L:   "bg-violet-100 text-violet-700",
  H:   "bg-sky-100 text-sky-700",
  WO:  "bg-zinc-100 text-zinc-500",
};

function MonthlyRegisterTab() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/attendance/register?month=${month}`);
      setData(r.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const dates = data?.dates || [];
  const rows = (data?.rows || []).filter(r =>
    !q || r.employee_name?.toLowerCase().includes(q.toLowerCase()) || r.employee_code?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <SectionCard
      title={`Monthly register · ${month}`}
      subtitle={loading ? "Loading…" : `${rows.length} employees × ${dates.length} days — P=Present · P*=Late · HD=Half-day · A=Absent · L=Leave · H=Holiday · WO=Week-off`}
      testid="section-monthly-register"
      action={
        <div className="flex items-center gap-2">
          <Input type="month" className="w-40" value={month} onChange={e=>setMonth(e.target.value)} data-testid="register-month"/>
          <Input placeholder="Search…" className="w-44" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="text-left px-2 py-2 sticky left-0 bg-white z-10 min-w-[180px]">Employee</th>
              {dates.map(d => (
                <th key={d} className="px-1 py-2 text-center font-mono-alt text-[10px] text-zinc-500">{d.slice(-2)}</th>
              ))}
              <th className="px-2 py-2 text-right">P</th>
              <th className="px-2 py-2 text-right">A</th>
              <th className="px-2 py-2 text-right">L</th>
              <th className="px-2 py-2 text-right">HD</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={dates.length + 5} className="text-center text-zinc-500 py-10">No data.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.employee_id} className="border-b border-zinc-100 hover:bg-zinc-50" data-testid={`register-row-${r.employee_code}`}>
                <td className="px-2 py-1 sticky left-0 bg-white z-10">
                  <div className="font-medium">{r.employee_name}</div>
                  <div className="text-[10px] text-zinc-500">{r.employee_code}</div>
                </td>
                {r.days.map(d => (
                  <td key={d.date} className="px-0.5 py-1 text-center">
                    <span className={`inline-block px-1 py-0.5 rounded font-mono-alt text-[10px] ${CODE_STYLE[d.code] || "bg-zinc-50 text-zinc-400"}`}>{d.code}</span>
                  </td>
                ))}
                <td className="px-2 py-1 text-right font-semibold text-emerald-700">{r.summary.present}</td>
                <td className="px-2 py-1 text-right font-semibold text-red-700">{r.summary.absent}</td>
                <td className="px-2 py-1 text-right font-semibold text-violet-700">{r.summary.leave}</td>
                <td className="px-2 py-1 text-right font-semibold text-orange-700">{r.summary.half_day}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ============================== DEMO DATA ==============================
function DemoDataTab() {
  const [count, setCount] = useState(50);
  const [years, setYears] = useState(2);
  const [reset, setReset] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [wiping, setWiping] = useState(false);

  const seed = async () => {
    if (!window.confirm(`Seed ${count} demo employees × ${years} years of data?\nThis inserts thousands of records. Reset=${reset}.`)) return;
    setRunning(true); setResult(null);
    try {
      const r = await api.post(`/demo/seed-employees?count=${count}&years=${years}&reset=${reset}`, null, { timeout: 180000 });
      setResult(r.data);
      toast.success(`Seeded ${r.data.stats.employees} demo employees`);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Seed failed (timeout?)"); }
    finally { setRunning(false); }
  };

  const wipe = async () => {
    if (!window.confirm("Delete ALL DEMO-prefixed employees and their data? This cannot be undone.")) return;
    setWiping(true);
    try {
      const r = await api.post("/demo/wipe-demo");
      toast.success(`Removed ${r.data.removed} demo employees`);
      setResult(null);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setWiping(false); }
  };

  return (
    <SectionCard
      title="Demo data seeder"
      subtitle="One-click generate realistic employees + 2 years of attendance, leaves, payslips, goals & tickets so you can kick every module's tyres."
      testid="section-demo-data"
    >
      <div className="rounded border border-amber-200 bg-amber-50 p-3 mb-5 flex gap-2 text-sm text-amber-800">
        <Warning size={18} weight="fill" className="mt-0.5 flex-none"/>
        <div>
          <b>Staging only.</b> Inserts thousands of rows (50 × 500 days ≈ 25 000 attendance records). Demo employees are prefixed <code className="text-xs bg-white px-1 rounded">DEMO####</code> and can be wiped at any time.
          Their login password is <code className="text-xs bg-white px-1 rounded">Demo@12345</code>, emails <code className="text-xs bg-white px-1 rounded">demo{"{N}"}@acme.io</code>.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <Label>Employees</Label>
          <Input type="number" min={1} max={500} className="mt-1" value={count} onChange={e=>setCount(Number(e.target.value))} data-testid="demo-count"/>
        </div>
        <div>
          <Label>Years of history</Label>
          <Input type="number" min={1} max={5} className="mt-1" value={years} onChange={e=>setYears(Number(e.target.value))} data-testid="demo-years"/>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reset} onChange={e=>setReset(e.target.checked)} data-testid="demo-reset"/>
            Wipe existing demo data first
          </label>
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={seed} disabled={running || wiping} data-testid="demo-seed-btn" className="gap-1.5">
            <Database size={14} weight="bold"/>{running ? "Seeding…" : "Seed demo data"}
          </Button>
          <Button variant="outline" onClick={wipe} disabled={wiping || running} data-testid="demo-wipe-btn" className="gap-1.5 text-red-600">
            <TrashIcon size={14}/>{wiping ? "Wiping…" : "Wipe demo"}
          </Button>
        </div>
      </div>

      {running && (
        <div className="text-xs text-zinc-500 italic mb-3">This can take 1–2 minutes for 50 employees × 2 years. Please keep the tab open.</div>
      )}

      {result && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-800 mb-3 font-medium"><CheckCircle size={18} weight="fill"/> Seed complete</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {Object.entries(result.stats).map(([k,v]) => (
              <div key={k} className="bg-white rounded px-3 py-2 border border-emerald-100">
                <div className="text-[11px] uppercase text-zinc-500 tracking-wide">{k.replace(/_/g," ")}</div>
                <div className="text-lg font-semibold text-zinc-900">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-zinc-600 mt-3">{result.login_hint}</div>
        </div>
      )}
    </SectionCard>
  );
}

// ============================== SHIFTS (existing) ==============================
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
