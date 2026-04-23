import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Plus, ClockClockwise, Timer, PencilLine, MapPin, CheckCircle, XCircle, Clock } from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";

export default function Attendance() {
  const { user } = useAuth();
  const [tab, setTab] = useState("today");
  const tabs = [
    { k: "today", l: "Today" },
    { k: "log", l: "My log" },
    { k: "regularization", l: "Regularization" },
    { k: "overtime", l: "Overtime" },
    { k: "timesheet", l: "Timesheet" },
    ...(user?.role !== "employee" ? [{ k: "register", l: "Register (MIS)" }] : []),
  ];
  return (
    <AppShell title="Attendance">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            data-testid={`att-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 whitespace-nowrap transition-colors ${
              tab === t.k ? "border-zinc-950 text-zinc-950 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}>{t.l}</button>
        ))}
      </div>
      {tab === "today" && <TodayPanel/>}
      {tab === "log" && <LogPanel/>}
      {tab === "regularization" && <RegularizationPanel/>}
      {tab === "overtime" && <OvertimePanel/>}
      {tab === "timesheet" && <TimesheetPanel/>}
      {tab === "register" && <RegisterPanel/>}
    </AppShell>
  );
}

function statusBadge(st) {
  const map = {
    pending: ["bg-amber-50 border-amber-200 text-amber-700", Clock],
    approved: ["bg-emerald-50 border-emerald-200 text-emerald-700", CheckCircle],
    rejected: ["bg-red-50 border-red-200 text-red-700", XCircle],
  };
  const [cls, Icon] = map[st] || map.pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded-full ${cls}`}><Icon size={12}/> {st}</span>;
}

/* --------- Today Panel: check-in / check-out --------- */
function TodayPanel() {
  const [today, setToday] = useState(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("wfo");
  const [sites, setSites] = useState([]);
  const [myShift, setMyShift] = useState(null);

  const load = async () => {
    const [t, st, ass] = await Promise.all([
      api.get("/attendance/today"),
      api.get("/work-sites").catch(() => ({ data: [] })),
      api.get("/shift-assignments").catch(() => ({ data: [] })),
    ]);
    setToday(t.data); setSites(st.data);
    if (ass.data?.length) {
      const a = ass.data[0];
      setMyShift({ code: a.shift_code, name: a.shift_name });
    }
  };
  useEffect(() => { load(); }, []);

  const getCoords = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { timeout: 5000 }
      );
    });

  const checkin = async () => {
    setBusy(true);
    try {
      const coords = type === "wfh" ? {} : await getCoords();
      await api.post("/attendance/checkin", { type, location: type.toUpperCase(), ...coords });
      toast.success("Checked in");
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Check-in failed");
    } finally { setBusy(false); }
  };

  const checkout = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/attendance/checkout");
      toast.success(`Checked out — ${data.hours}h logged`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Check-out failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6">
      <div className="bg-white border border-zinc-200 rounded-lg p-8" data-testid="today-panel">
        <div className="tiny-label mb-2">Today · {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}</div>
        {!today?.check_in && (
          <>
            <div className="font-display font-bold text-4xl mb-6 tracking-tight">Not checked in</div>
            <div className="mb-4">
              <Label>Work mode</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1 w-64" data-testid="checkin-type"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wfo">Office (WFO)</SelectItem>
                  <SelectItem value="wfh">Work from home (WFH)</SelectItem>
                  <SelectItem value="field">Field work</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="lg" onClick={checkin} disabled={busy} className="gap-2" data-testid="checkin-btn">
              <ClockClockwise size={18} weight="bold"/> {busy ? "Checking in…" : "Check in"}
            </Button>
            {type !== "wfh" && sites.length > 0 && (
              <div className="text-xs text-zinc-500 mt-3 inline-flex items-center gap-1">
                <MapPin size={12}/> Location access required — we verify you're within an allowed site.
              </div>
            )}
          </>
        )}
        {today?.check_in && !today?.check_out && (
          <>
            <div className="tiny-label mb-2">Checked in at</div>
            <div className="font-display font-bold text-4xl mb-2 tracking-tight" data-testid="checked-in-time">
              {new Date(today.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            {today.is_late && (
              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px]">LATE BY {today.late_minutes}M</Badge>
            )}
            <div className="mt-6">
              <Button size="lg" onClick={checkout} disabled={busy} variant="outline" className="gap-2" data-testid="checkout-btn">
                <Timer size={18} weight="bold"/> {busy ? "Checking out…" : "Check out"}
              </Button>
            </div>
          </>
        )}
        {today?.check_in && today?.check_out && (
          <>
            <div className="tiny-label mb-2">Day complete</div>
            <div className="font-display font-bold text-4xl mb-1 tracking-tight">{today.hours}h</div>
            <div className="text-sm text-zinc-500">In at {new Date(today.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Out at {new Date(today.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            {today.is_half_day && <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px] mt-2">HALF DAY</Badge>}
          </>
        )}
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <div className="tiny-label mb-3">My shift</div>
        {myShift ? (
          <>
            <div className="font-display font-semibold text-lg">{myShift.name}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{myShift.code}</div>
          </>
        ) : <div className="text-sm text-zinc-500">No shift assigned — using company default.</div>}
        {today && <div className="mt-6 text-xs text-zinc-500">Today: {today.type?.toUpperCase()} · {today.location}</div>}
      </div>
    </div>
  );
}

function LogPanel() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/attendance").then(r => setRows(r.data)); }, []);
  return (
    <SectionCard title="My attendance log" testid="section-att-log">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead><TableHead>Check-in</TableHead><TableHead>Check-out</TableHead>
            <TableHead>Hours</TableHead><TableHead>Type</TableHead><TableHead>Shift</TableHead><TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id} data-testid={`att-row-${r.id}`}>
              <TableCell className="font-mono-alt text-xs">{r.date}</TableCell>
              <TableCell>{r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
              <TableCell>{r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
              <TableCell>{r.hours || "—"}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.type}</Badge></TableCell>
              <TableCell className="text-xs">{r.shift_code || "—"}</TableCell>
              <TableCell className="space-x-1">
                {r.is_late && <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px]">LATE</Badge>}
                {r.is_half_day && <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700 text-[10px]">HD</Badge>}
                {r.is_regularized && <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 text-[10px]">REG</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function RegularizationPanel() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date:"", kind:"missed_punch", expected_check_in:"", expected_check_out:"", reason:"" });

  const load = () => api.get("/regularization").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const submit = async () => {
    try { await api.post("/regularization", f); toast.success("Submitted"); setOpen(false); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  return (
    <SectionCard title="Regularization requests" testid="section-reg"
      action={<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" className="gap-1.5" data-testid="new-reg-btn"><Plus size={14} weight="bold"/> Request</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Regularization request</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" className="mt-1" value={f.date} onChange={e=>setF({...f,date:e.target.value})} data-testid="reg-date"/></div>
              <div><Label>Kind</Label>
                <Select value={f.kind} onValueChange={v=>setF({...f,kind:v})}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="missed_punch">Missed punch</SelectItem>
                    <SelectItem value="wrong_location">Wrong location</SelectItem>
                    <SelectItem value="wrong_shift">Wrong shift</SelectItem>
                    <SelectItem value="forgot_checkout">Forgot checkout</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Expected check-in (HH:MM)</Label><Input placeholder="09:30" className="mt-1" value={f.expected_check_in} onChange={e=>setF({...f,expected_check_in:e.target.value})}/></div>
              <div><Label>Expected check-out</Label><Input placeholder="18:30" className="mt-1" value={f.expected_check_out} onChange={e=>setF({...f,expected_check_out:e.target.value})}/></div>
            </div>
            <div><Label>Reason</Label><Textarea className="mt-1" value={f.reason} onChange={e=>setF({...f,reason:e.target.value})} data-testid="reg-reason"/></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={submit} data-testid="reg-submit">Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    >
      {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No regularization requests.</div>}
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Kind</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map(r=>(
            <TableRow key={r.id} data-testid={`reg-row-${r.id}`}>
              <TableCell className="font-mono-alt text-xs">{r.date}</TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.kind.replace(/_/g," ")}</Badge></TableCell>
              <TableCell className="text-sm">{r.reason}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function OvertimePanel() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date:"", hours:0, rate_multiplier:1.5, reason:"" });
  const load = () => api.get("/overtime").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const submit = async () => {
    try { await api.post("/overtime", f); toast.success("Submitted"); setOpen(false); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  return (
    <SectionCard title="Overtime requests" testid="section-ot"
      action={<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" className="gap-1.5" data-testid="new-ot-btn"><Plus size={14} weight="bold"/> Request OT</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Overtime request</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Date</Label><Input type="date" className="mt-1" value={f.date} onChange={e=>setF({...f,date:e.target.value})} data-testid="ot-date"/></div>
              <div><Label>Hours</Label><Input type="number" step="0.5" min="0" max="12" className="mt-1" value={f.hours} onChange={e=>setF({...f,hours:Number(e.target.value)})} data-testid="ot-hours"/></div>
              <div><Label>Rate</Label>
                <Select value={String(f.rate_multiplier)} onValueChange={v=>setF({...f,rate_multiplier:Number(v)})}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="1">1.0x</SelectItem><SelectItem value="1.5">1.5x</SelectItem><SelectItem value="2">2.0x</SelectItem></SelectContent>
                </Select></div>
            </div>
            <div><Label>Reason</Label><Textarea className="mt-1" value={f.reason} onChange={e=>setF({...f,reason:e.target.value})}/></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={submit} data-testid="ot-submit">Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    >
      {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No overtime requests.</div>}
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Hours</TableHead><TableHead>Rate</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map(r=>(
            <TableRow key={r.id} data-testid={`ot-row-${r.id}`}>
              <TableCell className="font-mono-alt text-xs">{r.date}</TableCell>
              <TableCell>{r.hours}h</TableCell>
              <TableCell>{r.rate_multiplier}x</TableCell>
              <TableCell className="text-sm">{r.reason}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function TimesheetPanel() {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/timesheets").then(r => setRows(r.data));
  useEffect(() => { load(); }, []);
  const [open, setOpen] = useState(false);
  const mondayOf = (d) => {
    const x = new Date(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7);
    return x.toISOString().slice(0,10);
  };
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [days, setDays] = useState(() => Array.from({length:7}, (_,i)=>{
    const d = new Date(); d.setDate(d.getDate() - (d.getDay()+6)%7 + i);
    return { date: d.toISOString().slice(0,10), entries: [{ project:"", task:"", hours:0 }] };
  }));
  const save = async () => {
    try { await api.post("/timesheets", { week_start: weekStart, days });
      toast.success("Saved draft"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const submit = async (id) => {
    try { await api.post(`/timesheets/submit/${id}`); toast.success("Submitted"); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  return (
    <SectionCard title="Weekly timesheets" testid="section-ts"
      action={<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" className="gap-1.5" data-testid="new-ts-btn"><Plus size={14} weight="bold"/> New week</Button></DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Weekly timesheet (week of {weekStart})</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {days.map((d,i)=>(
              <div key={i} className="border border-zinc-200 rounded-md p-3">
                <div className="font-medium text-sm mb-2">{d.date} · {new Date(d.date).toLocaleDateString([], {weekday:"short"})}</div>
                {d.entries.map((e, j)=>(
                  <div key={j} className="grid grid-cols-[1fr_1fr_100px_36px] gap-2 mb-2">
                    <Input placeholder="Project" value={e.project} onChange={ev=>setDays(ds=>ds.map((d2,k)=>k!==i?d2:{...d2,entries:d2.entries.map((e2,l)=>l!==j?e2:{...e2,project:ev.target.value})}))} data-testid={`ts-proj-${i}-${j}`}/>
                    <Input placeholder="Task" value={e.task||""} onChange={ev=>setDays(ds=>ds.map((d2,k)=>k!==i?d2:{...d2,entries:d2.entries.map((e2,l)=>l!==j?e2:{...e2,task:ev.target.value})}))}/>
                    <Input type="number" step="0.25" placeholder="hrs" value={e.hours} onChange={ev=>setDays(ds=>ds.map((d2,k)=>k!==i?d2:{...d2,entries:d2.entries.map((e2,l)=>l!==j?e2:{...e2,hours:Number(ev.target.value)})}))} data-testid={`ts-hrs-${i}-${j}`}/>
                    <Button variant="ghost" size="sm" onClick={()=>setDays(ds=>ds.map((d2,k)=>k!==i?d2:{...d2,entries:d2.entries.filter((_,l)=>l!==j)}))}>×</Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={()=>setDays(ds=>ds.map((d2,k)=>k!==i?d2:{...d2,entries:[...d2.entries,{project:"",task:"",hours:0}]}))}>+ Add line</Button>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="ts-save">Save draft</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    >
      {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No timesheets yet.</div>}
      <Table>
        <TableHeader><TableRow><TableHead>Week of</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader>
        <TableBody>
          {rows.map(r=>(
            <TableRow key={r.id} data-testid={`ts-row-${r.id}`}>
              <TableCell className="font-mono-alt text-xs">{r.week_start}</TableCell>
              <TableCell>{r.total_hours}h</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell className="text-right">{r.status === "draft" && <Button size="sm" onClick={()=>submit(r.id)} data-testid={`ts-submit-${r.id}`}>Submit</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

function RegisterPanel() {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  useEffect(() => { api.get(`/attendance/register?month=${month}`).then(r => setData(r.data)); }, [month]);

  const codeColor = {
    P: "text-emerald-700", "P*": "text-amber-700", A: "text-red-600",
    L: "text-blue-700", H: "text-violet-700", WO: "text-zinc-400", HD: "text-amber-600",
  };

  return (
    <SectionCard
      title={`Attendance register · ${month}`}
      subtitle="P=Present · P*=Late · A=Absent · L=Leave · H=Holiday · WO=Weekly off · HD=Half day"
      testid="section-register"
      action={
        <Input type="month" className="w-40 h-9" value={month} onChange={e=>setMonth(e.target.value)} data-testid="register-month"/>
      }
    >
      {!data && <div className="text-sm text-zinc-500">Loading…</div>}
      {data && (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 sticky left-0 bg-white border-b">Employee</th>
                {data.dates.map(d => <th key={d} className="py-2 px-1 border-b text-center w-7">{d.slice(-2)}</th>)}
                <th className="py-2 px-2 border-b">P</th>
                <th className="py-2 px-2 border-b">A</th>
                <th className="py-2 px-2 border-b">L</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.employee_id} className="hover:bg-zinc-50" data-testid={`reg-row-${r.employee_id}`}>
                  <td className="py-1.5 px-2 sticky left-0 bg-white border-b whitespace-nowrap">
                    <div className="font-medium">{r.employee_name}</div>
                    <div className="text-[10px] text-zinc-500">{r.employee_code}</div>
                  </td>
                  {r.days.map(d => (
                    <td key={d.date} className={`text-center py-1 border-b ${codeColor[d.code] || ""}`}>{d.code}</td>
                  ))}
                  <td className="text-center py-1 border-b font-medium">{r.summary.present}</td>
                  <td className="text-center py-1 border-b text-red-600">{r.summary.absent}</td>
                  <td className="text-center py-1 border-b text-blue-600">{r.summary.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
