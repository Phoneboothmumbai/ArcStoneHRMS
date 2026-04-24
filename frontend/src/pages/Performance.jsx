import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Plus, Target, Trash, Calendar, ShieldCheck, Star, TrendUp, Flag, PaperPlaneTilt, CheckCircle,
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

// ─── helpers ──────────────────────────────────────────────────────────────
const GOAL_STATUS_COLORS = {
  draft: "bg-zinc-100 text-zinc-700",
  active: "bg-blue-100 text-blue-700",
  on_track: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-amber-100 text-amber-800",
  completed: "bg-violet-100 text-violet-700",
  missed: "bg-red-100 text-red-700",
  archived: "bg-zinc-200 text-zinc-500",
};
const CYCLE_STATUS_COLORS = {
  draft: "bg-zinc-100 text-zinc-700",
  open: "bg-blue-100 text-blue-700",
  in_review: "bg-amber-100 text-amber-800",
  calibration: "bg-violet-100 text-violet-700",
  closed: "bg-zinc-200 text-zinc-600",
};
const REVIEW_STATUS_COLORS = {
  pending: "bg-zinc-100 text-zinc-700",
  in_progress: "bg-amber-100 text-amber-800",
  submitted: "bg-blue-100 text-blue-700",
  calibrated: "bg-violet-100 text-violet-700",
  shared: "bg-emerald-100 text-emerald-700",
};
const PIP_STATUS_COLORS = {
  draft: "bg-zinc-100 text-zinc-700",
  active: "bg-amber-100 text-amber-800",
  on_track: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-red-100 text-red-700",
  passed: "bg-violet-100 text-violet-700",
  failed: "bg-red-200 text-red-800",
  cancelled: "bg-zinc-200 text-zinc-600",
};

const err = (e) => toast.error(formatApiError(e?.response?.data?.detail));
const newKr = () => ({ id: crypto.randomUUID(), title: "", metric_type: "percent", target: 100, current: 0, unit: "", weight: 1 });

// ─── PerformanceOverview (landing) ────────────────────────────────────────
export default function PerformanceOverview() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [pips, setPips] = useState([]);

  const load = async () => {
    try {
      const [g, r, c, p] = await Promise.all([
        api.get("/goals"),
        api.get("/reviews"),
        api.get("/review-cycles"),
        api.get("/pips"),
      ]);
      setGoals(g.data); setReviews(r.data); setCycles(c.data); setPips(p.data);
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const avgProgress = goals.length
    ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length)
    : 0;
  const openCycle = cycles.find((c) => c.status === "open" || c.status === "in_review");
  const myPending = reviews.filter((r) => r.status === "pending" || r.status === "in_progress");

  return (
    <AppShell title="Performance">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active goals" value={goals.filter(g => !["archived","missed","completed"].includes(g.status)).length} testid="stat-active-goals"/>
        <StatCard label="Avg progress" value={`${avgProgress}%`} hint="Across all visible goals" testid="stat-avg-progress"/>
        <StatCard label="Pending reviews" value={myPending.length} hint="Assigned to you" testid="stat-pending-reviews"/>
        <StatCard label="Active PIPs" value={pips.filter(p => p.status === "active").length} testid="stat-active-pips"/>
      </div>

      <SectionCard
        title={openCycle ? `Active cycle — ${openCycle.name}` : "No active cycle"}
        subtitle={openCycle ? `${openCycle.period_start} → ${openCycle.period_end} · ${openCycle.cadence}` : "HR can open a review cycle from Review cycles."}
        testid="section-active-cycle"
        action={openCycle ? <Badge className={CYCLE_STATUS_COLORS[openCycle.status]}>{openCycle.status}</Badge> : null}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link to="/app/performance/goals" className="group border border-zinc-200 rounded-lg p-4 bg-white hover:border-pink-300 hover:shadow-sm transition" data-testid="tile-goals">
            <div className="flex items-center gap-2 text-pink-700 mb-2"><Target size={18} weight="bold"/> <span className="font-semibold">Goals & OKRs</span></div>
            <p className="text-sm text-zinc-500">Track objectives and update key-result progress.</p>
            <p className="text-xs text-zinc-400 mt-3">{goals.length} goal{goals.length===1?"":"s"} · {avgProgress}% avg</p>
          </Link>
          <Link to="/app/performance/reviews" className="group border border-zinc-200 rounded-lg p-4 bg-white hover:border-blue-300 hover:shadow-sm transition" data-testid="tile-reviews">
            <div className="flex items-center gap-2 text-blue-700 mb-2"><ShieldCheck size={18} weight="bold"/> <span className="font-semibold">Reviews</span></div>
            <p className="text-sm text-zinc-500">Self / manager / peer. Rate competencies, share feedback.</p>
            <p className="text-xs text-zinc-400 mt-3">{myPending.length} waiting on you</p>
          </Link>
          <Link to="/app/performance/pips" className="group border border-zinc-200 rounded-lg p-4 bg-white hover:border-amber-300 hover:shadow-sm transition" data-testid="tile-pips">
            <div className="flex items-center gap-2 text-amber-700 mb-2"><Flag size={18} weight="bold"/> <span className="font-semibold">PIPs</span></div>
            <p className="text-sm text-zinc-500">Performance improvement plans with milestones.</p>
            <p className="text-xs text-zinc-400 mt-3">{pips.length} total</p>
          </Link>
        </div>
      </SectionCard>

      <SectionCard title="Recent goals" testid="section-recent-goals">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Progress</TableHead><TableHead className="text-right">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.slice(0, 6).map(g => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.owner_name}</TableCell>
                <TableCell>{g.title}</TableCell>
                <TableCell><Badge className={GOAL_STATUS_COLORS[g.status] || ""}>{g.status.replace("_"," ")}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{g.progress}%</TableCell>
                <TableCell className="text-right text-zinc-500">{g.due_date || "—"}</TableCell>
              </TableRow>
            ))}
            {goals.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-zinc-500">No goals yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}

// ─── PerformanceCycles (HR) ───────────────────────────────────────────────
export function PerformanceCycles() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank());
  function blank() {
    return { name:"", cadence:"annual", period_start:"", period_end:"", self_review_due:"", manager_review_due:"", calibration_due:"", notes:"", include_self:true, include_manager:true, include_peer:false, include_skip_level:false };
  }
  const load = async () => { try { const r = await api.get("/review-cycles"); setRows(r.data); } catch (e) { err(e); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f };
      // Remove empty due-dates
      ["self_review_due","manager_review_due","calibration_due"].forEach(k => { if (!body[k]) delete body[k]; });
      await api.post("/review-cycles", body);
      toast.success("Cycle created"); setOpen(false); setF(blank()); load();
    } catch (e) { err(e); }
  };
  const setStatus = async (id, status) => { try { await api.post(`/review-cycles/${id}/status`, { status }); toast.success(`Moved to ${status}`); load(); } catch (e) { err(e); } };
  const del = async (id) => { if (!window.confirm("Delete cycle?")) return; try { await api.delete(`/review-cycles/${id}`); load(); } catch (e) { err(e); } };

  return (
    <AppShell title="Review cycles">
      <SectionCard
        title="Review cycles"
        subtitle="draft → open → in_review → calibration → closed. Open a cycle to start collecting reviews."
        testid="section-cycles"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-cycle-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New cycle</Button>}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Cadence</TableHead><TableHead>Window</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right w-80">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-zinc-500">No cycles yet.</TableCell></TableRow>}
            {rows.map(c => (
              <TableRow key={c.id} data-testid={`cycle-row-${c.id}`}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="capitalize">{c.cadence.replace("_"," ")}</TableCell>
                <TableCell className="text-xs text-zinc-500">{c.period_start} → {c.period_end}</TableCell>
                <TableCell><Badge className={CYCLE_STATUS_COLORS[c.status]}>{c.status.replace("_"," ")}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    {c.status === "draft" && <Button size="sm" onClick={()=>setStatus(c.id,"open")} data-testid={`cycle-open-${c.id}`}>Open</Button>}
                    {c.status === "open" && <Button size="sm" variant="secondary" onClick={()=>setStatus(c.id,"in_review")}>Start reviews</Button>}
                    {c.status === "in_review" && <Button size="sm" variant="secondary" onClick={()=>setStatus(c.id,"calibration")}>Calibrate</Button>}
                    {c.status === "calibration" && <Button size="sm" onClick={()=>setStatus(c.id,"closed")}>Close</Button>}
                    {(c.status === "draft" || c.status === "closed") && (
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={()=>del(c.id)} data-testid={`cycle-del-${c.id}`}><Trash size={14}/></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="new-cycle-dialog">
          <DialogHeader><DialogTitle>New review cycle</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="FY26 Annual" data-testid="cycle-name"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cadence</Label>
                <Select value={f.cadence} onValueChange={v=>setF({...f,cadence:v})}>
                  <SelectTrigger data-testid="cycle-cadence"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="half_yearly">Half yearly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="adhoc">Ad-hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Types</Label>
                <div className="flex gap-2 flex-wrap items-center h-9 text-xs">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={f.include_self} onChange={e=>setF({...f,include_self:e.target.checked})}/> Self</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={f.include_manager} onChange={e=>setF({...f,include_manager:e.target.checked})}/> Mgr</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={f.include_peer} onChange={e=>setF({...f,include_peer:e.target.checked})}/> Peer</label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period start</Label><Input type="date" value={f.period_start} onChange={e=>setF({...f,period_start:e.target.value})} data-testid="cycle-start"/></div>
              <div><Label>Period end</Label><Input type="date" value={f.period_end} onChange={e=>setF({...f,period_end:e.target.value})} data-testid="cycle-end"/></div>
            </div>
            <div><Label>Notes (optional)</Label><Textarea rows={2} value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="cycle-save">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── PerformanceGoals (OKR / KPI tracker) ─────────────────────────────────
export function PerformanceGoals() {
  const { user } = useAuth();
  const isHR = ["super_admin","company_admin","country_head","region_head"].includes(user?.role);
  const isManager = isHR || ["branch_manager","sub_manager","assistant_manager"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState(blank());
  function blank() {
    return { cycle_id: "", owner_employee_id: user?.employee_id || "", kind: "okr", title: "", description: "", priority: "medium", weight: 1, start_date: "", due_date: "", key_results: [newKr()] };
  }

  const load = async () => {
    try {
      const [g, c] = await Promise.all([api.get("/goals"), api.get("/review-cycles")]);
      setRows(g.data); setCycles(c.data);
      if (isManager) { const e = await api.get("/employees"); setEmployees(e.data); }
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f };
      if (!body.cycle_id) delete body.cycle_id;
      if (!body.start_date) delete body.start_date;
      if (!body.due_date) delete body.due_date;
      body.key_results = (body.key_results || []).filter(kr => kr.title).map(kr => ({
        ...kr, target: Number(kr.target) || 0, current: Number(kr.current) || 0, weight: Number(kr.weight) || 1,
      }));
      if (editing) {
        await api.patch(`/goals/${editing.id}`, body);
        toast.success("Goal updated");
      } else {
        await api.post("/goals", body);
        toast.success("Goal created");
      }
      setOpen(false); setEditing(null); setF(blank()); load();
    } catch (e) { err(e); }
  };
  const del = async (id) => { if (!window.confirm("Delete goal?")) return; try { await api.delete(`/goals/${id}`); load(); } catch (e) { err(e); } };
  const updateKR = async (gid, kr_id, current) => {
    try { await api.post(`/goals/${gid}/kr-progress`, { kr_id, current: Number(current) || 0 }); load(); }
    catch (e) { err(e); }
  };

  const openEdit = (g) => {
    setEditing(g);
    setF({
      cycle_id: g.cycle_id || "", owner_employee_id: g.owner_employee_id,
      kind: g.kind, title: g.title, description: g.description || "",
      priority: g.priority, weight: g.weight, start_date: g.start_date || "",
      due_date: g.due_date || "", key_results: (g.key_results && g.key_results.length) ? g.key_results.map(k => ({...k})) : [newKr()],
    });
    setOpen(true);
  };

  const goalsCount = rows.length;
  const completed = rows.filter(g => g.status === "completed").length;
  const atRisk = rows.filter(g => g.status === "at_risk").length;
  const avg = goalsCount ? Math.round(rows.reduce((s,g)=>s+(g.progress||0),0)/goalsCount) : 0;

  return (
    <AppShell title="Goals & OKRs">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total goals" value={goalsCount} testid="stat-goals-total"/>
        <StatCard label="Avg progress" value={`${avg}%`} testid="stat-goals-avg"/>
        <StatCard label="Completed" value={completed} testid="stat-goals-completed"/>
        <StatCard label="At risk" value={atRisk} testid="stat-goals-at-risk"/>
      </div>

      <SectionCard
        title="Goals"
        subtitle="Set objectives and track progress via weighted key results."
        testid="section-goals"
        action={<Button size="sm" onClick={()=>{setEditing(null); setF(blank()); setOpen(true);}} data-testid="new-goal-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New goal</Button>}
      >
        <div className="space-y-3">
          {rows.length === 0 && <p className="text-center py-6 text-zinc-500">No goals yet.</p>}
          {rows.map(g => (
            <div key={g.id} className="border border-zinc-200 rounded-lg p-4 bg-white" data-testid={`goal-${g.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{g.title}</h3>
                    <Badge className={GOAL_STATUS_COLORS[g.status]}>{g.status.replace("_"," ")}</Badge>
                    <Badge variant="outline" className="uppercase text-[10px]">{g.kind}</Badge>
                    {g.priority !== "medium" && <Badge variant="outline" className="capitalize">{g.priority}</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Owner · {g.owner_name} {g.due_date && <>· due {g.due_date}</>}</p>
                  {g.description && <p className="text-sm text-zinc-700 mt-2">{g.description}</p>}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-zinc-500 mb-1"><span>Progress</span><span className="tabular-nums">{g.progress}%</span></div>
                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-pink-500 transition-all" style={{width:`${Math.min(100,g.progress)}%`}}/></div>
                  </div>
                  {g.key_results?.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {g.key_results.map(kr => (
                        <div key={kr.id} className="flex items-center gap-2 text-sm" data-testid={`kr-${kr.id}`}>
                          <span className="text-zinc-400">›</span>
                          <span className="flex-1">{kr.title}</span>
                          <Input type="number" className="w-24 h-8 text-xs" defaultValue={kr.current}
                            onBlur={e => { if (Number(e.target.value) !== kr.current) updateKR(g.id, kr.id, e.target.value); }}
                            data-testid={`kr-input-${kr.id}`}
                            disabled={user?.employee_id !== g.owner_employee_id && !isHR}/>
                          <span className="text-xs text-zinc-500 tabular-nums w-16 text-right">/ {kr.target}{kr.unit ? " " + kr.unit : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 flex-col items-end">
                  <Button size="sm" variant="ghost" onClick={()=>openEdit(g)} data-testid={`goal-edit-${g.id}`}>Edit</Button>
                  {(isHR || user?.employee_id === g.owner_employee_id) && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={()=>del(g.id)} data-testid={`goal-del-${g.id}`}><Trash size={14}/></Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v){setEditing(null);}}}>
        <DialogContent className="sm:max-w-2xl" data-testid="goal-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit goal" : "New goal"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kind</Label>
                <Select value={f.kind} onValueChange={v=>setF({...f,kind:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="okr">OKR</SelectItem>
                    <SelectItem value="kpi">KPI</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={f.priority} onValueChange={v=>setF({...f,priority:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Title</Label><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="Scale ARR to ₹2 Cr" data-testid="goal-title"/></div>
            <div><Label>Description (optional)</Label><Textarea rows={2} value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>
            {isManager && !editing && (
              <div>
                <Label>Owner</Label>
                <Select value={f.owner_employee_id} onValueChange={v=>setF({...f,owner_employee_id:v})}>
                  <SelectTrigger data-testid="goal-owner"><SelectValue placeholder="Pick owner"/></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} — {e.job_title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cycle (optional)</Label>
                <Select value={f.cycle_id || "__none__"} onValueChange={v=>setF({...f,cycle_id: v === "__none__" ? "" : v})}>
                  <SelectTrigger><SelectValue placeholder="No cycle"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No cycle</SelectItem>
                    {cycles.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Due date</Label><Input type="date" value={f.due_date} onChange={e=>setF({...f,due_date:e.target.value})}/></div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Key results</Label>
                <Button size="sm" variant="outline" onClick={()=>setF({...f, key_results:[...f.key_results, newKr()]})} data-testid="add-kr" className="h-7 text-xs gap-1"><Plus size={12}/> KR</Button>
              </div>
              <div className="space-y-2">
                {f.key_results.map((kr, idx) => (
                  <div key={kr.id} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
                    <Input value={kr.title} onChange={e=>{const ks=[...f.key_results]; ks[idx]={...kr,title:e.target.value}; setF({...f,key_results:ks});}} placeholder="Land 10 enterprise deals" data-testid={`kr-title-${idx}`}/>
                    <Input type="number" value={kr.current} onChange={e=>{const ks=[...f.key_results]; ks[idx]={...kr,current:e.target.value}; setF({...f,key_results:ks});}} placeholder="Current"/>
                    <Input type="number" value={kr.target} onChange={e=>{const ks=[...f.key_results]; ks[idx]={...kr,target:e.target.value}; setF({...f,key_results:ks});}} placeholder="Target"/>
                    <Button size="sm" variant="ghost" className="text-red-600 p-0 h-8 w-8" onClick={()=>{const ks=f.key_results.filter((_,i)=>i!==idx); setF({...f,key_results: ks.length ? ks : [newKr()]});}}><Trash size={14}/></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>{setOpen(false); setEditing(null);}}>Cancel</Button>
            <Button onClick={save} data-testid="goal-save">{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── PerformanceReviews ───────────────────────────────────────────────────
export function PerformanceReviews() {
  const { user } = useAuth();
  const isHR = ["super_admin","company_admin","country_head","region_head"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [form, setForm] = useState({ overall_rating: 0, competencies: [], strengths: "", improvements: "", comments: "", promotion_recommendation: "" });

  const [nf, setNF] = useState({ cycle_id: "", subject_employee_id: "", reviewer_employee_id: "", review_type: "manager" });
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    try {
      const [r, c] = await Promise.all([api.get("/reviews"), api.get("/review-cycles")]);
      setRows(r.data); setCycles(c.data);
      if (isHR) { const e = await api.get("/employees"); setEmployees(e.data); }
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const openReview = (rv) => {
    setReviewing(rv);
    setForm({
      overall_rating: rv.overall_rating || 0,
      competencies: (rv.competencies || []).map(c => ({...c})),
      strengths: rv.strengths || "", improvements: rv.improvements || "",
      comments: rv.comments || "", goals_comment: rv.goals_comment || "",
      promotion_recommendation: rv.promotion_recommendation || "",
    });
    setOpen(true);
  };

  const submitReview = async () => {
    try {
      const body = { ...form };
      if (!body.promotion_recommendation) delete body.promotion_recommendation;
      await api.post(`/reviews/${reviewing.id}/submit`, body);
      toast.success("Review submitted");
      setOpen(false); setReviewing(null); load();
    } catch (e) { err(e); }
  };

  const createReview = async () => {
    try {
      const body = { ...nf };
      if (!body.reviewer_employee_id) delete body.reviewer_employee_id;
      await api.post("/reviews", body);
      toast.success("Review created");
      setNewOpen(false); setNF({ cycle_id: "", subject_employee_id: "", reviewer_employee_id: "", review_type: "manager" });
      load();
    } catch (e) { err(e); }
  };

  const share = async (rid) => { try { await api.post(`/reviews/${rid}/share`); toast.success("Shared with subject"); load(); } catch (e) { err(e); } };

  const readOnly = reviewing && (reviewing.status === "submitted" || reviewing.status === "shared" || reviewing.status === "calibrated")
    && user?.employee_id !== reviewing.reviewer_employee_id && !isHR;

  return (
    <AppShell title="Reviews">
      <SectionCard
        title="Review queue"
        subtitle={isHR ? "All reviews in your company. Assign, review, share." : "Your review tasks and any shared with you."}
        testid="section-reviews"
        action={isHR ? <Button size="sm" onClick={()=>setNewOpen(true)} data-testid="new-review-btn" className="gap-1.5"><Plus size={14} weight="bold"/> Assign review</Button> : null}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead><TableHead>Reviewer</TableHead><TableHead>Type</TableHead>
              <TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-zinc-500">No reviews yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id} data-testid={`review-row-${r.id}`}>
                <TableCell className="font-medium">{r.subject_name}</TableCell>
                <TableCell>{r.reviewer_name || "—"}</TableCell>
                <TableCell className="capitalize">{r.review_type.replace("_"," ")}</TableCell>
                <TableCell className="text-xs text-zinc-500">{r.cycle_name}</TableCell>
                <TableCell><Badge className={REVIEW_STATUS_COLORS[r.status]}>{r.status.replace("_"," ")}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{r.overall_rating ? `${r.overall_rating}/5` : "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={()=>openReview(r)} data-testid={`review-open-${r.id}`}>Open</Button>
                    {isHR && r.status === "submitted" && (
                      <Button size="sm" onClick={()=>share(r.id)} data-testid={`review-share-${r.id}`} className="gap-1"><PaperPlaneTilt size={12}/> Share</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Review form */}
      <Dialog open={open} onOpenChange={(v)=>{setOpen(v); if(!v){setReviewing(null);}}}>
        <DialogContent className="sm:max-w-2xl" data-testid="review-dialog">
          <DialogHeader>
            <DialogTitle>{reviewing?.review_type === "self" ? "Self review" : "Review"} — {reviewing?.subject_name}</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
              <div className="text-xs text-zinc-500">Cycle: {reviewing.cycle_name} · Status: <Badge className={REVIEW_STATUS_COLORS[reviewing.status]}>{reviewing.status}</Badge></div>
              <div>
                <Label>Overall rating (1 = low, 5 = outstanding)</Label>
                <div className="flex gap-2 mt-2">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} disabled={readOnly} type="button"
                      className={`h-10 w-10 rounded-full border-2 flex items-center justify-center font-semibold transition ${form.overall_rating===n ? "bg-pink-500 text-white border-pink-500" : "bg-white border-zinc-200 hover:border-pink-300"}`}
                      onClick={()=>setForm({...form, overall_rating: n})} data-testid={`rating-${n}`}>{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Competencies</Label>
                <div className="space-y-2 mt-2">
                  {form.competencies.map((c, idx) => (
                    <div key={c.competency} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                      <span className="text-sm">{c.competency}</span>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} disabled={readOnly} type="button"
                            className={`h-7 w-7 text-xs rounded border ${c.rating===n ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 hover:border-zinc-400"}`}
                            onClick={()=>{const cs=[...form.competencies]; cs[idx]={...c,rating:n}; setForm({...form,competencies:cs});}}
                            data-testid={`comp-${c.competency}-${n}`}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div><Label>Strengths</Label><Textarea rows={2} disabled={readOnly} value={form.strengths} onChange={e=>setForm({...form,strengths:e.target.value})}/></div>
              <div><Label>Areas to improve</Label><Textarea rows={2} disabled={readOnly} value={form.improvements} onChange={e=>setForm({...form,improvements:e.target.value})}/></div>
              <div><Label>Overall comments</Label><Textarea rows={2} disabled={readOnly} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}/></div>
              {reviewing.review_type === "manager" && (
                <div>
                  <Label>Promotion recommendation</Label>
                  <Select value={form.promotion_recommendation || "__none__"} onValueChange={v=>setForm({...form,promotion_recommendation: v==="__none__" ? "" : v})}>
                    <SelectTrigger disabled={readOnly}><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No recommendation</SelectItem>
                      <SelectItem value="strong_yes">Strong yes</SelectItem><SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="maybe">Maybe</SelectItem><SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>{setOpen(false); setReviewing(null);}}>Close</Button>
            {!readOnly && <Button onClick={submitReview} data-testid="review-submit">Submit</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign new review */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Assign review</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Cycle</Label>
              <Select value={nf.cycle_id} onValueChange={v=>setNF({...nf,cycle_id:v})}>
                <SelectTrigger data-testid="new-review-cycle"><SelectValue placeholder="Pick cycle"/></SelectTrigger>
                <SelectContent>{cycles.filter(c => c.status !== "closed").map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={nf.review_type} onValueChange={v=>setNF({...nf,review_type:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self</SelectItem><SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="peer">Peer</SelectItem><SelectItem value="skip_level">Skip level</SelectItem>
                  <SelectItem value="upward">Upward</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject employee</Label>
              <Select value={nf.subject_employee_id} onValueChange={v=>setNF({...nf,subject_employee_id:v})}>
                <SelectTrigger data-testid="new-review-subject"><SelectValue placeholder="Pick employee"/></SelectTrigger>
                <SelectContent className="max-h-72">{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {nf.review_type !== "self" && nf.review_type !== "manager" && (
              <div>
                <Label>Reviewer</Label>
                <Select value={nf.reviewer_employee_id} onValueChange={v=>setNF({...nf,reviewer_employee_id:v})}>
                  <SelectTrigger><SelectValue placeholder="Pick reviewer"/></SelectTrigger>
                  <SelectContent className="max-h-72">{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setNewOpen(false)}>Cancel</Button>
            <Button onClick={createReview} data-testid="new-review-save">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── PerformanceNineBox (HR) ──────────────────────────────────────────────
const BOX_COLORS = {
  1: "bg-red-50 border-red-200", 2: "bg-orange-50 border-orange-200", 3: "bg-amber-50 border-amber-200",
  4: "bg-yellow-50 border-yellow-200", 5: "bg-blue-50 border-blue-200", 6: "bg-cyan-50 border-cyan-200",
  7: "bg-emerald-50 border-emerald-200", 8: "bg-teal-50 border-teal-200", 9: "bg-violet-50 border-violet-200",
};

export function PerformanceNineBox() {
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState("");
  const [grid, setGrid] = useState({});
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employee_id: "", performance: "medium", potential: "medium", notes: "" });

  const load = async () => {
    try {
      const c = await api.get("/review-cycles");
      setCycles(c.data);
      if (!cycleId && c.data.length) setCycleId(c.data[0].id);
      const e = await api.get("/employees"); setEmployees(e.data);
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const reload = async (cid) => {
    try {
      const r = await api.get(`/nine-box${cid ? `?cycle_id=${cid}` : ""}`);
      setGrid(r.data.grid || {});
    } catch (e) { err(e); }
  };
  useEffect(() => { if (cycleId) reload(cycleId); }, [cycleId]);

  const place = async () => {
    try {
      await api.post("/nine-box", { ...f, cycle_id: cycleId });
      toast.success("Placed"); setOpen(false);
      setF({ employee_id: "", performance: "medium", potential: "medium", notes: "" });
      reload(cycleId);
    } catch (e) { err(e); }
  };

  // Grid layout: rows = potential (high→low); cols = performance (low→high).
  const pm = [
    ["high", ["3","6","9"]], ["medium", ["2","5","8"]], ["low", ["1","4","7"]],
  ];
  const boxLabel = {
    1:"Underperformer", 2:"Inconsistent", 3:"Dilemma / Enigma",
    4:"Solid Contributor", 5:"Core Player", 6:"High Potential",
    7:"Trusted Pro", 8:"High Performer", 9:"Star — Future Leader",
  };

  return (
    <AppShell title="9-Box grid">
      <SectionCard
        title="Talent calibration"
        subtitle="Calibrate performance × potential to identify stars, core players, and outliers."
        testid="section-ninebox"
        action={
          <div className="flex gap-2 items-center">
            <Select value={cycleId} onValueChange={setCycleId}>
              <SelectTrigger className="w-56" data-testid="9box-cycle"><SelectValue placeholder="Pick cycle"/></SelectTrigger>
              <SelectContent>{cycles.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={()=>setOpen(true)} disabled={!cycleId} data-testid="place-btn" className="gap-1.5"><Plus size={14} weight="bold"/> Place</Button>
          </div>
        }
      >
        <div className="flex gap-2">
          <div className="flex flex-col justify-between py-4 text-xs font-medium text-zinc-500 tracking-wide">
            <span>↑ High potential</span><span>Medium</span><span>↓ Low potential</span>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-2">
              {pm.map(([pot, boxes]) =>
                boxes.map(bn => (
                  <div key={bn} className={`${BOX_COLORS[bn] || "bg-zinc-50 border-zinc-200"} border-2 rounded-lg p-3 min-h-[140px]`} data-testid={`box-${bn}`}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Box {bn}</div>
                    <div className="text-xs font-medium mb-2">{boxLabel[bn]}</div>
                    <div className="space-y-1">
                      {(grid[bn] || []).map(p => (
                        <div key={p.id} className="text-xs bg-white rounded px-2 py-1 border border-zinc-200" title={p.notes || ""}>
                          {p.employee_name}
                        </div>
                      ))}
                      {(!grid[bn] || grid[bn].length === 0) && <div className="text-xs text-zinc-400 italic">Empty</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs font-medium text-zinc-500 tracking-wide">
              <span>↓ Low performance</span><span>Medium</span><span>High performance ↑</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="place-dialog">
          <DialogHeader><DialogTitle>Place employee</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Employee</Label>
              <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}>
                <SelectTrigger data-testid="place-emp"><SelectValue placeholder="Pick employee"/></SelectTrigger>
                <SelectContent className="max-h-72">{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Performance</Label>
                <Select value={f.performance} onValueChange={v=>setF({...f,performance:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Potential</Label>
                <Select value={f.potential} onValueChange={v=>setF({...f,potential:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={place} data-testid="place-save">Place</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── PerformancePIPs ──────────────────────────────────────────────────────
export function PerformancePIPs() {
  const { user } = useAuth();
  const isHR = ["super_admin","company_admin","country_head","region_head"].includes(user?.role);
  const isManager = isHR || ["branch_manager","sub_manager","assistant_manager"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(null);
  const [outcome, setOutcome] = useState({ outcome: "passed", outcome_notes: "" });
  const [f, setF] = useState(blank());
  function blank() {
    return { employee_id: "", start_date: "", end_date: "", concerns_markdown: "", expectations_markdown: "", milestones: [] };
  }

  const load = async () => {
    try {
      const r = await api.get("/pips"); setRows(r.data);
      if (isManager) { const e = await api.get("/employees"); setEmployees(e.data); }
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f, milestones: f.milestones.filter(m => m.title && m.due_date).map(m => ({...m, id: m.id || crypto.randomUUID(), status: m.status || "pending"})) };
      await api.post("/pips", body);
      toast.success("PIP created"); setOpen(false); setF(blank()); load();
    } catch (e) { err(e); }
  };
  const closeOutcome = async () => {
    try {
      await api.post(`/pips/${outcomeOpen.id}/outcome`, outcome);
      toast.success("PIP closed"); setOutcomeOpen(null); load();
    } catch (e) { err(e); }
  };
  const flipMilestone = async (pid, mid, status) => {
    try { await api.post(`/pips/${pid}/milestones/${mid}/status`, { status }); load(); } catch (e) { err(e); }
  };

  return (
    <AppShell title="PIPs — Performance Improvement Plans">
      <SectionCard
        title="PIPs"
        subtitle="Structured 30/60/90-day plans with milestones and outcome."
        testid="section-pips"
        action={isManager ? <Button size="sm" onClick={()=>setOpen(true)} data-testid="new-pip-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New PIP</Button> : null}
      >
        <div className="space-y-3">
          {rows.length === 0 && <p className="text-center py-6 text-zinc-500">No PIPs.</p>}
          {rows.map(p => (
            <div key={p.id} className="border border-zinc-200 rounded-lg p-4 bg-white" data-testid={`pip-${p.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.employee_name}</h3>
                    <Badge className={PIP_STATUS_COLORS[p.status]}>{p.status.replace("_"," ")}</Badge>
                    {p.outcome && <Badge variant="outline">Outcome: {p.outcome}</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{p.start_date} → {p.end_date}</p>
                  <div className="mt-3 prose prose-sm max-w-none text-sm whitespace-pre-wrap text-zinc-700">{p.concerns_markdown}</div>
                  {p.milestones?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {p.milestones.map(m => (
                        <div key={m.id} className="flex items-center gap-2 text-sm" data-testid={`pip-ms-${m.id}`}>
                          <Badge className={m.status==="met"?"bg-emerald-100 text-emerald-700":m.status==="missed"?"bg-red-100 text-red-700":"bg-zinc-100 text-zinc-600"}>{m.status}</Badge>
                          <span className="flex-1">{m.title}</span>
                          <span className="text-xs text-zinc-500">due {m.due_date}</span>
                          {isManager && m.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>flipMilestone(p.id, m.id, "met")} data-testid={`ms-met-${m.id}`}>Met</Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={()=>flipMilestone(p.id, m.id, "missed")}>Missed</Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {isManager && p.status === "active" && (
                  <Button size="sm" variant="secondary" onClick={()=>{setOutcome({outcome:"passed",outcome_notes:""}); setOutcomeOpen(p);}} data-testid={`pip-close-${p.id}`}>Close</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl" data-testid="pip-dialog">
          <DialogHeader><DialogTitle>New PIP</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <div>
              <Label>Employee</Label>
              <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}>
                <SelectTrigger data-testid="pip-emp"><SelectValue placeholder="Pick employee"/></SelectTrigger>
                <SelectContent className="max-h-72">{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="date" value={f.start_date} onChange={e=>setF({...f,start_date:e.target.value})} data-testid="pip-start"/></div>
              <div><Label>End</Label><Input type="date" value={f.end_date} onChange={e=>setF({...f,end_date:e.target.value})} data-testid="pip-end"/></div>
            </div>
            <div><Label>Concerns (markdown)</Label><Textarea rows={3} value={f.concerns_markdown} onChange={e=>setF({...f,concerns_markdown:e.target.value})} placeholder="Specific, measurable concerns and impact" data-testid="pip-concerns"/></div>
            <div><Label>Expectations (optional)</Label><Textarea rows={2} value={f.expectations_markdown} onChange={e=>setF({...f,expectations_markdown:e.target.value})}/></div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Milestones</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={()=>setF({...f, milestones:[...f.milestones, {id:crypto.randomUUID(), title:"", due_date:"", status:"pending"}]})}><Plus size={12}/> Add</Button>
              </div>
              <div className="space-y-2">
                {f.milestones.map((m,idx) => (
                  <div key={m.id} className="grid grid-cols-[1fr_140px_32px] gap-2 items-center">
                    <Input value={m.title} onChange={e=>{const ms=[...f.milestones]; ms[idx]={...m,title:e.target.value}; setF({...f,milestones:ms});}} placeholder="Deliver X by 30 days"/>
                    <Input type="date" value={m.due_date} onChange={e=>{const ms=[...f.milestones]; ms[idx]={...m,due_date:e.target.value}; setF({...f,milestones:ms});}}/>
                    <Button size="sm" variant="ghost" className="text-red-600 p-0 h-8 w-8" onClick={()=>setF({...f, milestones: f.milestones.filter((_,i)=>i!==idx)})}><Trash size={14}/></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="pip-save">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!outcomeOpen} onOpenChange={(v)=>{if(!v) setOutcomeOpen(null);}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Close PIP — outcome</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Outcome</Label>
              <Select value={outcome.outcome} onValueChange={v=>setOutcome({...outcome,outcome:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed">Passed</SelectItem><SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="extended">Extended</SelectItem><SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea rows={3} value={outcome.outcome_notes} onChange={e=>setOutcome({...outcome,outcome_notes:e.target.value})}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOutcomeOpen(null)}>Cancel</Button>
            <Button onClick={closeOutcome} data-testid="outcome-save">Close PIP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
