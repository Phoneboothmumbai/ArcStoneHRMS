import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
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
import { Plus, ArrowRight, ArrowLeft, CheckCircle, Warning } from "@phosphor-icons/react";

const DEPT_COLORS = {
  it: "bg-violet-50 border-violet-200 text-violet-700",
  admin: "bg-amber-50 border-amber-200 text-amber-700",
  finance: "bg-rose-50 border-rose-200 text-rose-700",
  hr: "bg-blue-50 border-blue-200 text-blue-700",
  manager: "bg-emerald-50 border-emerald-200 text-emerald-700",
  security: "bg-zinc-100 border-zinc-300 text-zinc-700",
};

export default function Offboarding() {
  return (
    <AppShell title="Offboarding & Exit">
      <Gate module="onboarding">
        <OffboardingInner />
      </Gate>
    </AppShell>
  );
}

function OffboardingInner() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statusF, setStatusF] = useState("all");
  const [open, setOpen] = useState(false);
  const [nf, setNf] = useState({
    employee_id: "", resignation_date: "", last_working_day: "",
    reason: "resignation", reason_details: "", notice_period_days: 60,
  });

  const load = async () => {
    const [o, e] = await Promise.all([
      api.get(`/offboarding${statusF!=="all"?`?status=${statusF}`:""}`),
      api.get("/employees"),
    ]);
    setRows(o.data); setEmployees(e.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusF]);

  const start = async () => {
    try {
      if (!nf.employee_id || !nf.resignation_date || !nf.last_working_day) return toast.error("All required fields");
      await api.post("/offboarding", nf);
      toast.success("Exit case initiated");
      setOpen(false);
      setNf({ employee_id:"",resignation_date:"",last_working_day:"",reason:"resignation",reason_details:"",notice_period_days:60 });
      await load();
    } catch(e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const counts = {
    initiated: rows.filter(r=>r.status==="initiated").length,
    in_progress: rows.filter(r=>r.status==="in_progress").length,
    relieved: rows.filter(r=>r.status==="relieved").length,
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Initiated" value={counts.initiated} testid="stat-initiated"/>
        <StatCard label="Clearance in progress" value={counts.in_progress} testid="stat-progress"/>
        <StatCard label="Relieved" value={counts.relieved} testid="stat-relieved"/>
      </div>

      <SectionCard
        title="Exit cases"
        subtitle="Track resignations, clearances, exit interviews and F&F settlements."
        testid="section-offboardings"
        action={
          <div className="flex items-center gap-2">
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="w-40 h-9" data-testid="filter-status"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="initiated">Initiated</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="relieved">Relieved</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" data-testid="start-offboarding-btn"><Plus size={14} weight="bold"/> Initiate exit</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Initiate exit case</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Employee</Label>
                    <Select value={nf.employee_id} onValueChange={v=>setNf(n=>({...n,employee_id:v}))}>
                      <SelectTrigger className="mt-1" data-testid="new-off-employee"><SelectValue placeholder="Pick"/></SelectTrigger>
                      <SelectContent>{employees.filter(e=>e.status==="active").map(e=><SelectItem key={e.id} value={e.id}>{e.name} · {e.employee_code}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Resignation date</Label>
                      <Input type="date" className="mt-1" value={nf.resignation_date} onChange={e=>setNf(n=>({...n,resignation_date:e.target.value}))} data-testid="new-off-resign"/>
                    </div>
                    <div>
                      <Label>Last working day</Label>
                      <Input type="date" className="mt-1" value={nf.last_working_day} onChange={e=>setNf(n=>({...n,last_working_day:e.target.value}))} data-testid="new-off-lwd"/>
                    </div>
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Select value={nf.reason} onValueChange={v=>setNf(n=>({...n,reason:v}))}>
                      <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resignation">Resignation</SelectItem>
                        <SelectItem value="termination">Termination</SelectItem>
                        <SelectItem value="retirement">Retirement</SelectItem>
                        <SelectItem value="end_of_contract">End of contract</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Notice period (days)</Label>
                    <Input type="number" className="mt-1" value={nf.notice_period_days} onChange={e=>setNf(n=>({...n,notice_period_days:Number(e.target.value)}))}/>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Textarea className="mt-1" value={nf.reason_details} onChange={e=>setNf(n=>({...n,reason_details:e.target.value}))}/>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
                  <Button onClick={start} data-testid="new-off-submit">Initiate</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      >
        {rows.length === 0 && <div className="text-sm text-zinc-500 py-8 text-center">No exit cases.</div>}
        <div className="divide-y divide-zinc-100">
          {rows.map(o => {
            const total = o.clearance?.length || 0;
            const done = (o.clearance||[]).filter(c=>c.status==="cleared").length;
            return (
              <Link key={o.id} to={`/app/offboarding/${o.id}`} className="flex items-center gap-4 py-4 hover:bg-zinc-50 px-2 -mx-2 rounded-md" data-testid={`off-row-${o.id}`}>
                <div className="flex-1">
                  <div className="font-medium">{o.employee_name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 capitalize">{o.reason.replace(/_/g," ")} · LWD {o.last_working_day}</div>
                </div>
                <div className="text-xs text-zinc-600">{done}/{total} cleared</div>
                <Badge variant="outline" className="uppercase text-[10px]">{o.status.replace(/_/g," ")}</Badge>
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
export function OffboardingDetail() {
  const { id } = useParams();
  const [ob, setOb] = useState(null);
  const [interview, setInterview] = useState({});

  const load = async () => {
    try { const { data } = await api.get(`/offboarding/${id}`); setOb(data); setInterview(data.exit_interview || {}); }
    catch { toast.error("Not found"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const updateClearance = async (item_id, status, remarks) => {
    try {
      const { data } = await api.patch(`/offboarding/${id}/clearance/${item_id}`, { status, remarks });
      setOb(data); toast.success("Updated");
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const submitInterview = async () => {
    try {
      const { data } = await api.post(`/offboarding/${id}/exit_interview`, interview);
      setOb(data); toast.success("Exit interview saved");
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const complete = async () => {
    try {
      await api.post(`/offboarding/${id}/complete`);
      toast.success("Relieved. Letters issued and F&F marked settled.");
      await load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  if (!ob) return <AppShell title="Offboarding"><div className="text-sm text-zinc-500">Loading…</div></AppShell>;

  const allCleared = (ob.clearance||[]).every(c => c.status === "cleared");

  return (
    <AppShell title={`Exit · ${ob.employee_name}`}>
      <div className="mb-4">
        <Link to="/app/offboarding" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-950"><ArrowLeft size={14}/> Back</Link>
      </div>
      <div className="bg-white border border-zinc-200 rounded-lg p-6 mb-6" data-testid="offboarding-header">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-bold text-xl">{ob.employee_name}</div>
            <div className="text-sm text-zinc-500 mt-1 capitalize">
              {ob.reason.replace(/_/g," ")} · Resigned {ob.resignation_date} · LWD {ob.last_working_day} · Notice {ob.notice_period_days}d
            </div>
          </div>
          <Badge variant="outline" className="uppercase text-[10px]">{ob.status.replace(/_/g," ")}</Badge>
        </div>
        {ob.status !== "relieved" && (
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" disabled={!allCleared} onClick={complete} className="gap-1.5" data-testid="relieve-btn">
              <CheckCircle size={14} weight="bold"/> Complete exit & issue letters
            </Button>
            {!allCleared && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Warning size={12}/> Finish all clearance items first</span>}
          </div>
        )}
        {ob.status === "relieved" && (
          <div className="mt-4 flex items-center gap-6 text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle size={14} weight="fill"/> Relieving letter issued</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle size={14} weight="fill"/> Experience letter issued</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle size={14} weight="fill"/> F&F settled</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="Clearance checklist" testid="section-clearance">
          <div className="divide-y divide-zinc-100">
            {(ob.clearance||[]).map(c => (
              <ClearanceRow key={c.id} item={c} onUpdate={updateClearance}/>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Exit interview" subtitle="Submit before last working day" testid="section-exit-interview">
          <div className="space-y-3">
            <div>
              <Label>Overall experience (1–5)</Label>
              <Input type="number" min={1} max={5} className="mt-1 w-24" value={interview.overall_rating||""} onChange={e=>setInterview(i=>({...i,overall_rating:Number(e.target.value)}))} data-testid="interview-rating"/>
            </div>
            <div>
              <Label>Reason for leaving</Label>
              <Textarea className="mt-1" value={interview.reason_for_leaving||""} onChange={e=>setInterview(i=>({...i,reason_for_leaving:e.target.value}))} data-testid="interview-reason"/>
            </div>
            <div>
              <Label>What worked well?</Label>
              <Textarea className="mt-1" value={interview.what_worked_well||""} onChange={e=>setInterview(i=>({...i,what_worked_well:e.target.value}))}/>
            </div>
            <div>
              <Label>What can we improve?</Label>
              <Textarea className="mt-1" value={interview.what_can_improve||""} onChange={e=>setInterview(i=>({...i,what_can_improve:e.target.value}))}/>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!interview.would_recommend} onChange={e=>setInterview(i=>({...i,would_recommend:e.target.checked}))}/>
                Would recommend as employer
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!interview.would_rejoin} onChange={e=>setInterview(i=>({...i,would_rejoin:e.target.checked}))}/>
                Would rejoin
              </label>
            </div>
            <Button size="sm" onClick={submitInterview} data-testid="submit-interview-btn">Save interview</Button>
            {interview.submitted_at && <div className="text-xs text-zinc-500 mt-1">Last saved {new Date(interview.submitted_at).toLocaleString()}</div>}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

function ClearanceRow({ item, onUpdate }) {
  const [remarks, setRemarks] = useState(item.remarks || "");
  return (
    <div className="py-3" data-testid={`clearance-${item.id}`}>
      <div className="flex items-center gap-3">
        <span className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider border rounded ${DEPT_COLORS[item.department]||"bg-zinc-50"}`}>{item.department}</span>
        <div className="flex-1 text-sm">{item.title}</div>
        <Select value={item.status} onValueChange={(v)=>onUpdate(item.id, v, remarks)}>
          <SelectTrigger className="h-8 w-40 text-xs" data-testid={`clearance-status-${item.id}`}><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
            <SelectItem value="pending_dues">Pending dues</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {item.cleared_by_name && <div className="text-[11px] text-emerald-600 mt-1 ml-[72px]">Cleared by {item.cleared_by_name} · {new Date(item.cleared_at).toLocaleDateString()}</div>}
      <Input placeholder="Remarks (optional)" className="h-8 text-xs mt-2 ml-[72px] w-[calc(100%-72px)]" value={remarks} onChange={e=>setRemarks(e.target.value)} onBlur={()=>remarks !== (item.remarks||"") && onUpdate(item.id, item.status, remarks)}/>
    </div>
  );
}
