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
  Briefcase, Plus, Calendar, UserPlus, CheckCircle, Trash, PaperPlaneTilt, UserCircle,
} from "@phosphor-icons/react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

const err = (e) => toast.error(formatApiError(e?.response?.data?.detail));

const REQ_STATUS = {
  draft: "bg-zinc-100 text-zinc-700", open: "bg-emerald-100 text-emerald-700",
  on_hold: "bg-amber-100 text-amber-800", closed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};
const CAND_STAGE = {
  applied: "bg-zinc-100 text-zinc-700", screening: "bg-blue-100 text-blue-700",
  shortlisted: "bg-cyan-100 text-cyan-700", interview: "bg-amber-100 text-amber-800",
  offer_pending: "bg-violet-100 text-violet-700", offer_sent: "bg-pink-100 text-pink-700",
  offer_accepted: "bg-emerald-100 text-emerald-700", offer_declined: "bg-red-100 text-red-700",
  hired: "bg-teal-100 text-teal-700", rejected: "bg-red-200 text-red-800",
  withdrawn: "bg-zinc-200 text-zinc-600",
};
const OFFER_STATUS = {
  draft: "bg-zinc-100 text-zinc-700", sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700", declined: "bg-red-100 text-red-700",
  withdrawn: "bg-zinc-200 text-zinc-600", expired: "bg-amber-100 text-amber-800",
};

// ─── Recruitment Overview ────────────────────────────────────────────────
export default function RecruitmentOverview() {
  const [reqs, setReqs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [offers, setOffers] = useState([]);

  const load = async () => {
    try {
      const [r, c, o] = await Promise.all([api.get("/requisitions"), api.get("/candidates"), api.get("/offers")]);
      setReqs(r.data); setCandidates(c.data); setOffers(o.data);
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const openReqs = reqs.filter(r => r.status === "open").length;
  const pending = candidates.filter(c => !["hired","rejected","withdrawn","offer_declined"].includes(c.stage)).length;
  const hired = candidates.filter(c => c.stage === "hired").length;
  const acceptedThisMonth = offers.filter(o => o.status === "accepted" && (o.decided_at || "").slice(0,7) === new Date().toISOString().slice(0,7)).length;

  return (
    <AppShell title="Recruitment">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Open requisitions" value={openReqs} testid="stat-open-reqs"/>
        <StatCard label="Active candidates" value={pending} hint="In pipeline" testid="stat-active-cands"/>
        <StatCard label="Offers accepted (MTD)" value={acceptedThisMonth} testid="stat-offers-accepted"/>
        <StatCard label="Hired (all time)" value={hired} testid="stat-hired"/>
      </div>

      <SectionCard title="Open requisitions" subtitle="Click through to manage candidates." testid="section-open-reqs"
        action={<Link to="/app/recruitment/requisitions"><Button size="sm" className="gap-1.5"><Briefcase size={14}/>All requisitions</Button></Link>}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Title</TableHead>
            <TableHead>Department</TableHead><TableHead>Location</TableHead>
            <TableHead className="text-right">Openings</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {reqs.filter(r => r.status === "open").slice(0, 8).map(r => (
              <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="font-medium"><Link to={`/app/recruitment/requisitions/${r.id}`} className="hover:underline">{r.title}</Link></TableCell>
                <TableCell>{r.department || "—"}</TableCell><TableCell>{r.location || "—"}</TableCell>
                <TableCell className="text-right">{r.openings_filled}/{r.openings}</TableCell>
                <TableCell><Badge className={REQ_STATUS[r.status]}>{r.status}</Badge></TableCell>
              </TableRow>
            ))}
            {reqs.filter(r => r.status === "open").length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-zinc-500">No open requisitions.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Recent candidates" testid="section-recent-cands">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Requisition</TableHead>
            <TableHead>Stage</TableHead><TableHead>Source</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {candidates.slice(0, 10).map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}<div className="text-xs text-zinc-500">{c.email}</div></TableCell>
                <TableCell>{c.requisition_title}</TableCell>
                <TableCell><Badge className={CAND_STAGE[c.stage]}>{c.stage.replace(/_/g," ")}</Badge></TableCell>
                <TableCell className="text-xs text-zinc-500">{c.source}</TableCell>
              </TableRow>
            ))}
            {candidates.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-zinc-500">No candidates yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}

// ─── Requisitions list + create ──────────────────────────────────────────
export function Requisitions() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank());
  function blank() {
    return { title:"", department:"", location:"", employment_type:"full_time", work_mode:"wfo",
      openings:1, priority:"medium", hiring_manager_id:"", salary_min:"", salary_max:"",
      description_markdown:"", skills:"", is_public:true };
  }

  const load = async () => {
    try { const [r, e] = await Promise.all([api.get("/requisitions"), api.get("/employees")]);
      setRows(r.data); setEmployees(e.data); } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f, skills: f.skills ? f.skills.split(",").map(s=>s.trim()) : [] };
      if (!body.hiring_manager_id) delete body.hiring_manager_id;
      if (body.salary_min === "") delete body.salary_min; else body.salary_min = Number(body.salary_min);
      if (body.salary_max === "") delete body.salary_max; else body.salary_max = Number(body.salary_max);
      await api.post("/requisitions", body);
      toast.success("Requisition created"); setOpen(false); setF(blank()); load();
    } catch (e) { err(e); }
  };
  const setStatus = async (id, status) => { try { await api.post(`/requisitions/${id}/status`, { status }); load(); } catch (e) { err(e); } };

  return (
    <AppShell title="Job requisitions">
      <SectionCard title="Requisitions" subtitle="Create and manage open roles."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-req-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New requisition</Button>}
        testid="section-reqs">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Title</TableHead>
            <TableHead>Department</TableHead><TableHead>Type</TableHead>
            <TableHead className="text-right">Openings</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-zinc-500">No requisitions.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id} data-testid={`req-row-${r.id}`}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="font-medium"><Link to={`/app/recruitment/requisitions/${r.id}`} className="hover:underline">{r.title}</Link></TableCell>
                <TableCell>{r.department || "—"}</TableCell>
                <TableCell className="text-xs capitalize">{r.employment_type.replace("_"," ")} · {r.work_mode}</TableCell>
                <TableCell className="text-right tabular-nums">{r.openings_filled}/{r.openings}</TableCell>
                <TableCell><Badge className={REQ_STATUS[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    {r.status === "draft" && <Button size="sm" onClick={()=>setStatus(r.id,"open")} data-testid={`req-open-${r.id}`}>Open</Button>}
                    {r.status === "open" && <Button size="sm" variant="secondary" onClick={()=>setStatus(r.id,"on_hold")}>Hold</Button>}
                    {(r.status === "open" || r.status === "on_hold") && <Button size="sm" variant="outline" onClick={()=>setStatus(r.id,"closed")}>Close</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" data-testid="new-req-dialog">
          <DialogHeader><DialogTitle>New job requisition</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>Title</Label><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="Senior Backend Engineer" data-testid="req-title"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Department</Label><Input value={f.department} onChange={e=>setF({...f,department:e.target.value})}/></div>
              <div><Label>Location</Label><Input value={f.location} onChange={e=>setF({...f,location:e.target.value})}/></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Employment type</Label>
                <Select value={f.employment_type} onValueChange={v=>setF({...f,employment_type:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="full_time">Full time</SelectItem><SelectItem value="part_time">Part time</SelectItem><SelectItem value="contract">Contract</SelectItem><SelectItem value="intern">Intern</SelectItem><SelectItem value="consultant">Consultant</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Work mode</Label>
                <Select value={f.work_mode} onValueChange={v=>setF({...f,work_mode:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="wfo">Office</SelectItem><SelectItem value="wfh">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="field">Field</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Openings</Label><Input type="number" min="1" value={f.openings} onChange={e=>setF({...f,openings:Number(e.target.value)})}/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Salary min (₹)</Label><Input type="number" value={f.salary_min} onChange={e=>setF({...f,salary_min:e.target.value})}/></div>
              <div><Label>Salary max (₹)</Label><Input type="number" value={f.salary_max} onChange={e=>setF({...f,salary_max:e.target.value})}/></div>
            </div>
            <div><Label>Hiring manager</Label>
              <Select value={f.hiring_manager_id} onValueChange={v=>setF({...f,hiring_manager_id:v})}>
                <SelectTrigger><SelectValue placeholder="Pick manager"/></SelectTrigger>
                <SelectContent className="max-h-72">{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} — {e.job_title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Skills (comma separated)</Label><Input value={f.skills} onChange={e=>setF({...f,skills:e.target.value})} placeholder="Python, FastAPI, MongoDB"/></div>
            <div><Label>Description (markdown)</Label><Textarea rows={5} value={f.description_markdown} onChange={e=>setF({...f,description_markdown:e.target.value})}/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="req-save">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── Requisition detail + candidate pipeline (Kanban-ish) ────────────────
const PIPE_STAGES = ["applied","screening","shortlisted","interview","offer_pending","offer_sent","offer_accepted","hired","rejected"];

export function RequisitionDetail() {
  const { id } = useParams();
  const [req, setReq] = useState(null);
  const [cands, setCands] = useState([]);
  const [open, setOpen] = useState(false);
  const [nf, setNF] = useState({ name:"", email:"", phone:"", current_company:"", expected_ctc:"", source:"linkedin" });

  const load = async () => {
    try {
      const [r, c] = await Promise.all([api.get(`/requisitions/${id}`), api.get(`/candidates?requisition_id=${id}`)]);
      setReq(r.data); setCands(c.data);
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, [id]);

  const add = async () => {
    try {
      const body = { ...nf, requisition_id: id };
      if (body.expected_ctc === "") delete body.expected_ctc; else body.expected_ctc = Number(body.expected_ctc);
      await api.post("/candidates", body);
      toast.success("Candidate added"); setOpen(false);
      setNF({ name:"", email:"", phone:"", current_company:"", expected_ctc:"", source:"linkedin" });
      load();
    } catch (e) { err(e); }
  };
  const moveStage = async (cid, stage) => {
    try { await api.post(`/candidates/${cid}/stage`, { stage }); load(); } catch (e) { err(e); }
  };

  return (
    <AppShell title={req ? `${req.code} · ${req.title}` : "Requisition"}>
      {req && (
        <SectionCard title="Requisition details" testid="section-req-detail"
          action={<Badge className={REQ_STATUS[req.status]}>{req.status}</Badge>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-zinc-500">Department</div><div className="font-medium">{req.department || "—"}</div></div>
            <div><div className="text-xs text-zinc-500">Location</div><div className="font-medium">{req.location || "—"}</div></div>
            <div><div className="text-xs text-zinc-500">Openings</div><div className="font-medium">{req.openings_filled}/{req.openings}</div></div>
            <div><div className="text-xs text-zinc-500">Work mode</div><div className="font-medium capitalize">{req.work_mode}</div></div>
          </div>
        </SectionCard>
      )}
      <SectionCard title="Candidate pipeline" testid="section-pipeline"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="add-cand-btn" className="gap-1.5"><UserPlus size={14}/> Add candidate</Button>}>
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-[1400px] pb-2">
            {PIPE_STAGES.map(stage => {
              const items = cands.filter(c => c.stage === stage);
              return (
                <div key={stage} className="flex-1 min-w-[160px] bg-zinc-50 border border-zinc-200 rounded-lg p-2" data-testid={`col-${stage}`}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{stage.replace(/_/g," ")}</span>
                    <Badge variant="outline" className="text-xs">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map(c => (
                      <div key={c.id} className="bg-white rounded-md border border-zinc-200 p-2 text-xs hover:border-teal-300 transition cursor-default" data-testid={`cand-${c.id}`}>
                        <div className="font-medium text-zinc-900">{c.name}</div>
                        <div className="text-zinc-500 truncate">{c.email}</div>
                        {c.expected_ctc && <div className="text-zinc-500 mt-1">Expected: ₹{Number(c.expected_ctc).toLocaleString("en-IN")}</div>}
                        <Select value={c.stage} onValueChange={(v)=>moveStage(c.id, v)}>
                          <SelectTrigger className="h-7 text-xs mt-2" data-testid={`stage-${c.id}`}><SelectValue/></SelectTrigger>
                          <SelectContent>{PIPE_STAGES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="add-cand-dialog">
          <DialogHeader><DialogTitle>Add candidate</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={nf.name} onChange={e=>setNF({...nf,name:e.target.value})} data-testid="cand-name"/></div>
            <div><Label>Email</Label><Input type="email" value={nf.email} onChange={e=>setNF({...nf,email:e.target.value})} data-testid="cand-email"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={nf.phone} onChange={e=>setNF({...nf,phone:e.target.value})}/></div>
              <div><Label>Source</Label>
                <Select value={nf.source} onValueChange={v=>setNF({...nf,source:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="careers_page">Careers page</SelectItem><SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem><SelectItem value="naukri">Naukri</SelectItem>
                    <SelectItem value="indeed">Indeed</SelectItem><SelectItem value="agency">Agency</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Current company</Label><Input value={nf.current_company} onChange={e=>setNF({...nf,current_company:e.target.value})}/></div>
            <div><Label>Expected CTC (₹/yr)</Label><Input type="number" value={nf.expected_ctc} onChange={e=>setNF({...nf,expected_ctc:e.target.value})}/></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={add} data-testid="cand-save">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── Offers tab ───────────────────────────────────────────────────────────
export function Offers() {
  const [rows, setRows] = useState([]);
  const [cands, setCands] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ candidate_id:"", job_title:"", doj:"", annual_ctc:"", currency:"INR", work_mode:"wfo", employment_type:"full_time", location:"", letter_template_id:"" });

  const load = async () => {
    try {
      const [o, c, t] = await Promise.all([api.get("/offers"), api.get("/candidates"), api.get("/letter-templates").catch(()=>({data:[]}))]);
      setRows(o.data); setCands(c.data); setTemplates(t.data);
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f, annual_ctc: Number(f.annual_ctc || 0) };
      if (!body.letter_template_id) delete body.letter_template_id;
      if (!body.location) delete body.location;
      await api.post("/offers", body); toast.success("Offer drafted");
      setOpen(false); setF({ candidate_id:"", job_title:"", doj:"", annual_ctc:"", currency:"INR", work_mode:"wfo", employment_type:"full_time", location:"", letter_template_id:"" });
      load();
    } catch (e) { err(e); }
  };
  const send = async (id) => { try { await api.post(`/offers/${id}/send`); toast.success("Offer sent"); load(); } catch (e) { err(e); } };
  const decide = async (id, decision) => {
    const reason = decision === "decline" ? (prompt("Reason for decline?") || "") : undefined;
    try { await api.post(`/offers/${id}/decision`, { decision, reason }); toast.success(`Offer ${decision}ed`); load(); } catch (e) { err(e); }
  };
  const convert = async (cand_id) => {
    if (!window.confirm("Create Employee record + start onboarding?")) return;
    try {
      await api.post(`/candidates/${cand_id}/convert-to-employee`, { auto_start_onboarding: true });
      toast.success("Converted to employee, onboarding started"); load();
    } catch (e) { err(e); }
  };

  const sentCands = cands.filter(c => ["shortlisted","interview","offer_pending"].includes(c.stage));
  return (
    <AppShell title="Offers">
      <SectionCard title="Offers" subtitle="Draft → Send → Accepted/Declined → Hire."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-offer-btn" className="gap-1.5"><PaperPlaneTilt size={14}/> New offer</Button>}
        testid="section-offers">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Candidate</TableHead><TableHead>Job title</TableHead>
            <TableHead className="text-right">CTC</TableHead><TableHead>DOJ</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-zinc-500">No offers yet.</TableCell></TableRow>}
            {rows.map(o => (
              <TableRow key={o.id} data-testid={`offer-row-${o.id}`}>
                <TableCell className="font-medium">{o.candidate_name}<div className="text-xs text-zinc-500">{o.requisition_title}</div></TableCell>
                <TableCell>{o.job_title}</TableCell>
                <TableCell className="text-right tabular-nums">{o.currency} {Number(o.annual_ctc).toLocaleString("en-IN")}</TableCell>
                <TableCell>{o.doj}</TableCell>
                <TableCell><Badge className={OFFER_STATUS[o.status]}>{o.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    {o.status === "draft" && <Button size="sm" onClick={()=>send(o.id)} data-testid={`offer-send-${o.id}`} className="gap-1"><PaperPlaneTilt size={12}/> Send</Button>}
                    {o.status === "sent" && <><Button size="sm" onClick={()=>decide(o.id,"accept")} data-testid={`offer-accept-${o.id}`}>Accepted</Button><Button size="sm" variant="outline" className="text-red-600" onClick={()=>decide(o.id,"decline")}>Declined</Button></>}
                    {o.status === "accepted" && <Button size="sm" variant="secondary" className="gap-1" onClick={()=>convert(o.candidate_id)} data-testid={`offer-convert-${o.id}`}><CheckCircle size={12}/> Convert</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="new-offer-dialog">
          <DialogHeader><DialogTitle>New offer</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Candidate</Label>
              <Select value={f.candidate_id} onValueChange={v=>setF({...f,candidate_id:v})}>
                <SelectTrigger data-testid="offer-cand"><SelectValue placeholder="Pick candidate"/></SelectTrigger>
                <SelectContent className="max-h-72">{sentCands.map(c => <SelectItem key={c.id} value={c.id}>{c.name} — {c.requisition_title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Job title</Label><Input value={f.job_title} onChange={e=>setF({...f,job_title:e.target.value})} data-testid="offer-title"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Proposed DOJ</Label><Input type="date" value={f.doj} onChange={e=>setF({...f,doj:e.target.value})} data-testid="offer-doj"/></div>
              <div><Label>Annual CTC</Label><Input type="number" value={f.annual_ctc} onChange={e=>setF({...f,annual_ctc:e.target.value})} data-testid="offer-ctc"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Work mode</Label>
                <Select value={f.work_mode} onValueChange={v=>setF({...f,work_mode:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="wfo">Office</SelectItem><SelectItem value="wfh">Remote</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="field">Field</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Location</Label><Input value={f.location} onChange={e=>setF({...f,location:e.target.value})}/></div>
            </div>
            <div><Label>Offer letter template (optional)</Label>
              <Select value={f.letter_template_id || "__none__"} onValueChange={v=>setF({...f,letter_template_id: v==="__none__"?"":v})}>
                <SelectTrigger><SelectValue placeholder="None"/></SelectTrigger>
                <SelectContent><SelectItem value="__none__">None</SelectItem>{templates.filter(t=>t.category==="offer").map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-zinc-500 mt-1">When selected, letter auto-generates with merge fields (candidate_name, job_title, annual_ctc, doj, etc.)</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="offer-save">Draft offer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
