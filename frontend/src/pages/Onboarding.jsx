import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import Gate from "../components/Gate";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, CheckCircle, Circle, ArrowRight, ArrowLeft, CalendarBlank } from "@phosphor-icons/react";

const STAGE_LABELS = {
  pre_joining: "Pre-joining",
  day_1: "Day 1",
  week_1: "Week 1",
  month_1: "Month 1",
  probation: "Probation",
  custom: "Custom",
};

const ASSIGNEE_COLORS = {
  hr: "bg-blue-50 border-blue-200 text-blue-700",
  it: "bg-violet-50 border-violet-200 text-violet-700",
  admin: "bg-amber-50 border-amber-200 text-amber-700",
  manager: "bg-emerald-50 border-emerald-200 text-emerald-700",
  employee: "bg-zinc-50 border-zinc-200 text-zinc-700",
  finance: "bg-rose-50 border-rose-200 text-rose-700",
};

export default function Onboarding() {
  return (
    <AppShell title="Onboarding">
      <Gate module="onboarding">
        <OnboardingInner />
      </Gate>
    </AppShell>
  );
}

function OnboardingInner() {
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [statusF, setStatusF] = useState("active");
  const [employees, setEmployees] = useState([]);
  const [newOnboarding, setNewOnboarding] = useState({ employee_id: "", template_id: "", date_of_joining: "" });
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    const [o, t, e] = await Promise.all([
      api.get(`/onboarding${statusF !== "all" ? `?status=${statusF}` : ""}`),
      api.get("/onboarding/templates"),
      api.get("/employees"),
    ]);
    setRows(o.data); setTemplates(t.data); setEmployees(e.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusF]);

  const start = async () => {
    try {
      if (!newOnboarding.employee_id || !newOnboarding.template_id || !newOnboarding.date_of_joining) {
        return toast.error("All fields required");
      }
      await api.post("/onboarding", newOnboarding);
      toast.success("Onboarding started");
      setDialogOpen(false);
      setNewOnboarding({ employee_id: "", template_id: "", date_of_joining: "" });
      await load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Failed to start");
    }
  };

  const counts = {
    active: rows.filter(r => r.status === "active").length,
    completed: rows.filter(r => r.status === "completed").length,
    total: rows.length,
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Active onboardings" value={counts.active} testid="stat-active"/>
        <StatCard label="Completed" value={counts.completed} testid="stat-completed"/>
        <StatCard label="Templates available" value={templates.length} testid="stat-templates"/>
      </div>

      <SectionCard
        title="All onboardings"
        subtitle="Track new hire journeys across stages — pre-joining, day 1, week 1, month 1, probation."
        testid="section-onboardings"
        action={
          <div className="flex items-center gap-2">
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="w-40 h-9" data-testid="filter-status"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="start-onboarding-btn"><Plus size={14} weight="bold"/> Start onboarding</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Start new hire onboarding</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label>Employee</Label>
                    <Select value={newOnboarding.employee_id} onValueChange={v=>setNewOnboarding(o=>({...o,employee_id:v}))}>
                      <SelectTrigger className="mt-1" data-testid="new-onb-employee"><SelectValue placeholder="Pick an employee"/></SelectTrigger>
                      <SelectContent>{employees.filter(e=>e.status !== "terminated").map(e=><SelectItem key={e.id} value={e.id}>{e.name} · {e.employee_code}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Template</Label>
                    <Select value={newOnboarding.template_id} onValueChange={v=>setNewOnboarding(o=>({...o,template_id:v}))}>
                      <SelectTrigger className="mt-1" data-testid="new-onb-template"><SelectValue placeholder="Pick a template"/></SelectTrigger>
                      <SelectContent>{templates.map(t=><SelectItem key={t.id} value={t.id}>{t.name}{t.is_default?" (default)":""}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Date of joining</Label>
                    <Input type="date" value={newOnboarding.date_of_joining} onChange={e=>setNewOnboarding(o=>({...o,date_of_joining:e.target.value}))} className="mt-1" data-testid="new-onb-doj"/>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={()=>setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={start} data-testid="new-onb-submit">Start</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      >
        {rows.length === 0 && <div className="text-sm text-zinc-500 py-8 text-center">No onboardings match.</div>}
        <div className="divide-y divide-zinc-100">
          {rows.map(ob=>{
            const total = ob.tasks?.length || 0;
            const done = (ob.tasks||[]).filter(t=>t.status==="done"||t.status==="skipped").length;
            const pct = total === 0 ? 0 : Math.round((done/total)*100);
            return (
              <Link key={ob.id} to={`/app/onboarding/${ob.id}`} className="flex items-center gap-4 py-4 hover:bg-zinc-50 px-2 -mx-2 rounded-md" data-testid={`onb-row-${ob.id}`}>
                <div className="flex-1">
                  <div className="font-medium">{ob.employee_name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">DOJ {ob.date_of_joining} · {ob.template_name}</div>
                </div>
                <div className="w-48">
                  <div className="flex items-center justify-between text-xs text-zinc-600 mb-1"><span>{done}/{total}</span><span>{pct}%</span></div>
                  <div className="h-1.5 bg-zinc-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{width:`${pct}%`}}/></div>
                </div>
                <Badge variant="outline" className="uppercase text-[10px]">{ob.status}</Badge>
                <ArrowRight size={16} className="text-zinc-400"/>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </>
  );
}

// ----------------- Detail page -----------------
export function OnboardingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [ob, setOb] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/onboarding/${id}`);
      setOb(data);
    } catch { toast.error("Not found"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const updateTask = async (task_id, status) => {
    try {
      const { data } = await api.patch(`/onboarding/${id}/task/${task_id}`, { status });
      setOb(data);
      toast.success(status === "done" ? "Task completed" : "Updated");
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  if (!ob) return <AppShell title="Onboarding"><div className="text-sm text-zinc-500">Loading…</div></AppShell>;

  const stages = {};
  (ob.tasks||[]).forEach(t => { (stages[t.stage] = stages[t.stage] || []).push(t); });
  const stageOrder = ["pre_joining","day_1","week_1","month_1","probation","custom"];
  const done = (ob.tasks||[]).filter(t=>t.status==="done"||t.status==="skipped").length;
  const total = ob.tasks?.length || 0;
  const pct = total === 0 ? 0 : Math.round((done/total)*100);

  return (
    <AppShell title={`Onboarding · ${ob.employee_name}`}>
      <div className="mb-4">
        <Link to="/app/onboarding" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950"><ArrowLeft size={14}/> Back</Link>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-6 mb-6" data-testid="onboarding-header">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-bold text-xl">{ob.employee_name}</div>
            <div className="text-sm text-zinc-500 mt-1">Template: {ob.template_name} · DOJ {ob.date_of_joining}</div>
          </div>
          <Badge variant="outline" className="uppercase text-[10px]">{ob.status}</Badge>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-zinc-600 mb-1.5"><span>{done} of {total} tasks complete</span><span>{pct}%</span></div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{width:`${pct}%`}}/>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {stageOrder.filter(s=>stages[s]).map(stage => (
          <SectionCard key={stage} title={STAGE_LABELS[stage]} testid={`stage-${stage}`}>
            <div className="divide-y divide-zinc-100">
              {stages[stage].map(t => (
                <div key={t.task_id} className="flex items-center gap-3 py-3" data-testid={`task-${t.task_id}`}>
                  <button
                    onClick={()=>updateTask(t.task_id, t.status === "done" ? "pending" : "done")}
                    className="flex-shrink-0"
                    data-testid={`task-check-${t.task_id}`}
                  >
                    {t.status === "done"
                      ? <CheckCircle size={22} weight="fill" className="text-emerald-500"/>
                      : <Circle size={22} className="text-zinc-300 hover:text-zinc-500"/>
                    }
                  </button>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${t.status==="done"?"line-through text-zinc-400":""}`}>{t.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider border rounded ${ASSIGNEE_COLORS[t.assignee]||"bg-zinc-50"}`}>{t.assignee}</span>
                      {t.due_date && <span className="inline-flex items-center gap-1"><CalendarBlank size={12}/> {t.due_date}</span>}
                      {t.completed_by_name && <span className="text-emerald-600">✓ {t.completed_by_name}</span>}
                    </div>
                  </div>
                  <Select value={t.status} onValueChange={(v)=>updateTask(t.task_id,v)}>
                    <SelectTrigger className="h-8 w-36 text-xs" data-testid={`task-status-${t.task_id}`}><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="skipped">Skipped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
