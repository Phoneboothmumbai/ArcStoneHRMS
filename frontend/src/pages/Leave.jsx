import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus, CalendarBlank, CheckCircle, XCircle, Clock, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function Leave() {
  const { user } = useAuth();
  const [tab, setTab] = useState("mine");
  return (
    <AppShell title="Leave">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[
          { k: "mine", label: "My leave" },
          { k: "calendar", label: "Team calendar" },
          { k: "holidays", label: "Holidays" },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            data-testid={`leave-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
              tab === t.k ? "border-zinc-950 text-zinc-950 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >{t.label}</button>
        ))}
      </div>
      {tab === "mine" && <MyLeave />}
      {tab === "calendar" && <TeamCalendar />}
      {tab === "holidays" && <HolidaysList />}
    </AppShell>
  );
}

/* --------- My leave: balances + history + apply --------- */
function MyLeave() {
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leave_type_id: "", start_date: "", end_date: "", half_day_start: false, half_day_end: false, reason: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const meRes = await api.get("/employees/me").catch(() => null);
    if (!meRes) return;
    setMe(meRes.data);
    const [t, r] = await Promise.all([
      api.get("/leave-types"),
      api.get("/leave"),
    ]);
    setTypes(t.data);
    setReqs(r.data);
    const b = await api.get(`/leave-balances/employee/${meRes.data.id}`);
    setBalances(b.data.balances);
  };
  useEffect(() => { load(); }, []);

  const selectedType = types.find(t => t.id === form.leave_type_id);
  const selectedBal = balances.find(b => b.leave_type_id === form.leave_type_id);

  const submit = async () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date || !form.reason) {
      return toast.error("All fields required");
    }
    setBusy(true);
    try {
      await api.post("/leave", form);
      toast.success("Leave submitted for approval");
      setOpen(false);
      setForm({ leave_type_id: "", start_date: "", end_date: "", half_day_start: false, half_day_end: false, reason: "" });
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Submit failed");
    } finally { setBusy(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      await api.post(`/leave/cancel/${id}`);
      toast.success("Cancelled"); await load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {balances.slice(0, 4).map(b => (
          <div key={b.id} className="bg-white border border-zinc-200 rounded-lg p-5" data-testid={`bal-card-${b.leave_type_code}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ background: b.type?.color || "#64748b" }}/>
              <div className="tiny-label">{b.type?.name || b.leave_type_code}</div>
            </div>
            <div className="font-display font-bold text-3xl tracking-tight" data-testid={`bal-avail-${b.leave_type_code}`}>
              {Number(b.available ?? 0).toFixed(1)}
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              {Number(b.used ?? 0).toFixed(1)} used · {Number(b.pending ?? 0).toFixed(1)} pending · {Number(b.allotted ?? 0).toFixed(1)} allotted
            </div>
          </div>
        ))}
      </div>

      {balances.length > 4 && (
        <SectionCard title={`All ${balances.length} balances`} testid="section-all-balances">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Leave type</TableHead>
                <TableHead>Allotted</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map(b => (
                <TableRow key={b.id} data-testid={`bal-row-${b.leave_type_code}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: b.type?.color }}/>
                      <span className="font-medium">{b.type?.name}</span>
                      <Badge variant="outline" className="text-[10px]">{b.leave_type_code}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{Number(b.allotted ?? 0).toFixed(1)}</TableCell>
                  <TableCell>{Number(b.used ?? 0).toFixed(1)}</TableCell>
                  <TableCell>{Number(b.pending ?? 0).toFixed(1)}</TableCell>
                  <TableCell className="font-medium">{Number(b.available ?? 0).toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <div className="mt-6">
        <SectionCard
          title="My leave requests"
          testid="section-my-requests"
          action={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="apply-leave-btn"><Plus size={14} weight="bold"/> Apply leave</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Apply for leave</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Leave type</Label>
                    <Select value={form.leave_type_id} onValueChange={v => setForm(f => ({ ...f, leave_type_id: v }))}>
                      <SelectTrigger className="mt-1" data-testid="apply-type-select"><SelectValue placeholder="Pick a type"/></SelectTrigger>
                      <SelectContent>
                        {types.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ background: t.color }}/>
                              <span>{t.name}</span>
                              <span className="text-xs text-zinc-400">({t.code})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedBal && (
                      <div className="text-xs text-zinc-500 mt-1.5">Available: <b>{Number(selectedBal.available ?? 0).toFixed(1)}</b> days</div>
                    )}
                    {selectedType?.notice_days > 0 && (
                      <div className="text-xs text-amber-600 mt-1">Requires {selectedType.notice_days} days advance notice</div>
                    )}
                    {selectedType?.requires_document && (
                      <div className="text-xs text-amber-600 mt-1">Document required after {selectedType.document_after_days} days</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start date</Label>
                      <Input type="date" className="mt-1" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} data-testid="apply-start"/>
                    </div>
                    <div>
                      <Label>End date</Label>
                      <Input type="date" className="mt-1" value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} data-testid="apply-end"/>
                    </div>
                  </div>
                  {selectedType?.allow_half_day && (
                    <div className="flex items-center gap-4 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={form.half_day_start} onChange={e=>setForm(f=>({...f,half_day_start:e.target.checked}))} data-testid="apply-halfstart"/>
                        Half day (start)
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={form.half_day_end} onChange={e=>setForm(f=>({...f,half_day_end:e.target.checked}))} data-testid="apply-halfend"/>
                        Half day (end)
                      </label>
                    </div>
                  )}
                  <div>
                    <Label>Reason</Label>
                    <Textarea className="mt-1" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} data-testid="apply-reason"/>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
                  <Button onClick={submit} disabled={busy} data-testid="apply-submit">{busy?"Submitting…":"Submit"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        >
          {reqs.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No leave applied yet.</div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied on</TableHead>
                <TableHead/>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reqs.filter(r => !me || r.employee_id === me.id).map(r => (
                <TableRow key={r.id} data-testid={`req-row-${r.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: r.leave_type_color || "#64748b" }}/>
                      <span>{r.leave_type_name || r.leave_type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.start_date} → {r.end_date}</TableCell>
                  <TableCell>{Number(r.days ?? 1).toFixed(1)}</TableCell>
                  <TableCell><StatusBadge status={r.status}/></TableCell>
                  <TableCell className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {(r.status === "pending" || r.status === "approved") && (
                      <Button size="sm" variant="ghost" className="text-red-600 gap-1" onClick={()=>cancel(r.id)} data-testid={`cancel-req-${r.id}`}>
                        <X size={14}/> Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: ["bg-amber-50 border-amber-200 text-amber-700", Clock],
    approved: ["bg-emerald-50 border-emerald-200 text-emerald-700", CheckCircle],
    rejected: ["bg-red-50 border-red-200 text-red-700", XCircle],
    cancelled: ["bg-zinc-50 border-zinc-200 text-zinc-600", X],
  };
  const [cls, Icon] = map[status] || map.pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider border rounded-full ${cls}`}><Icon size={12}/> {status}</span>;
}

/* --------- Team calendar --------- */
function TeamCalendar() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/leave/team-calendar").then(r => setRows(r.data)); }, []);
  return (
    <SectionCard title="Who's on leave (next 60 days)" testid="section-team-calendar">
      {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">All clear — nobody is on leave in the next 60 days.</div>}
      <div className="divide-y divide-zinc-100">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-4 py-3" data-testid={`cal-row-${i}`}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.leave_type_color || "#64748b" }}/>
            <div className="flex-1">
              <div className="font-medium text-sm">{r.employee_name}</div>
              <div className="text-xs text-zinc-500">{r.leave_type_name} · {r.start_date} → {r.end_date} ({Number(r.days ?? 1).toFixed(1)}d)</div>
            </div>
            <StatusBadge status={r.status}/>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* --------- Holidays --------- */
function HolidaysList() {
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  useEffect(() => {
    api.get(`/holidays?year=${year}`).then(r => setRows(r.data));
  }, [year]);

  const grouped = useMemo(() => {
    const m = {};
    rows.forEach(h => {
      const key = h.date.slice(0, 7);
      (m[key] = m[key] || []).push(h);
    });
    return m;
  }, [rows]);

  return (
    <SectionCard
      title={`Holidays ${year}`}
      subtitle={`${rows.length} holidays configured · ${rows.filter(h=>h.kind==='mandatory').length} mandatory`}
      testid="section-holidays"
      action={
        <Select value={String(year)} onValueChange={v=>setYear(Number(v))}>
          <SelectTrigger className="w-28 h-9" data-testid="holiday-year"><SelectValue/></SelectTrigger>
          <SelectContent>
            {[2025, 2026, 2027].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      }
    >
      {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No holidays configured for {year}.</div>}
      <div className="space-y-4">
        {Object.entries(grouped).map(([mo, hs]) => (
          <div key={mo}>
            <div className="tiny-label mb-2">{new Date(mo+"-01").toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
            <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-md">
              {hs.map(h => (
                <div key={h.id} className="flex items-center gap-4 px-4 py-2.5" data-testid={`holiday-${h.id}`}>
                  <CalendarBlank size={16} className="text-zinc-400 flex-shrink-0"/>
                  <div className="w-28 text-sm font-mono-alt">{h.date}</div>
                  <div className="flex-1 text-sm font-medium">{h.name}</div>
                  <Badge variant="outline" className={`text-[10px] uppercase ${h.kind === 'mandatory' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}`}>{h.kind}</Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
