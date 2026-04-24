import { useEffect, useState } from "react";
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
import { Plus, ChatCircle, ShieldCheck, Lock, WarningOctagon } from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

const err = (e) => toast.error(formatApiError(e?.response?.data?.detail));

const STATUS_COLOR = {
  open: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-800",
  on_hold: "bg-zinc-100 text-zinc-700", resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-zinc-200 text-zinc-500", reopened: "bg-red-100 text-red-700",
};
const PRI_COLOR = {
  low: "bg-zinc-100 text-zinc-600", medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800", urgent: "bg-red-100 text-red-700",
};

// ─── Helpdesk (tickets) ──────────────────────────────────────────────────
export default function Helpdesk() {
  const { user } = useAuth();
  const isHR = ["super_admin","company_admin","country_head","region_head"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState({ body:"", is_internal:false });
  const [f, setF] = useState({ category_id:"", subject:"", description:"", priority:"medium" });

  const load = async () => {
    try {
      const [t, c] = await Promise.all([api.get("/tickets"), api.get("/ticket-categories")]);
      setRows(t.data); setCats(c.data);
      if (isHR) { const s = await api.get("/tickets/stats/overview"); setStats(s.data); }
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/tickets", f); toast.success("Ticket raised");
      setOpen(false); setF({ category_id:"", subject:"", description:"", priority:"medium" }); load();
    } catch (e) { err(e); }
  };
  const loadDetail = async (tid) => {
    try { const r = await api.get(`/tickets/${tid}`); setDetail(r.data); } catch (e) { err(e); }
  };
  const addComment = async () => {
    if (!comment.body) return;
    try {
      await api.post(`/tickets/${detail.id}/comment`, comment);
      setComment({ body:"", is_internal:false }); loadDetail(detail.id); load();
    } catch (e) { err(e); }
  };
  const setStatus = async (status) => {
    try { await api.post(`/tickets/${detail.id}/status`, { status }); loadDetail(detail.id); load(); } catch (e) { err(e); }
  };

  return (
    <AppShell title="Helpdesk">
      {isHR && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
          <StatCard label="Open" value={stats.by_status.open || 0} testid="stat-open"/>
          <StatCard label="In progress" value={stats.by_status.in_progress || 0} testid="stat-in-progress"/>
          <StatCard label="Resolved" value={stats.by_status.resolved || 0} testid="stat-resolved"/>
          <StatCard label="SLA breached" value={stats.sla_breached || 0} hint="Open tickets past resolve-by" testid="stat-breached"/>
        </div>
      )}
      <SectionCard title="Tickets" subtitle={isHR ? "All tickets in your company." : "Your tickets + tickets assigned to you."} testid="section-tickets"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-ticket-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New ticket</Button>}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Subject</TableHead>
            <TableHead>Category</TableHead><TableHead>Raised by</TableHead>
            <TableHead>Status</TableHead><TableHead>Priority</TableHead>
            <TableHead className="text-right">Assignee</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-zinc-500">No tickets.</TableCell></TableRow>}
            {rows.map(t => (
              <TableRow key={t.id} onClick={()=>loadDetail(t.id)} className="cursor-pointer hover:bg-zinc-50" data-testid={`ticket-row-${t.id}`}>
                <TableCell className="font-mono text-xs">{t.code}</TableCell>
                <TableCell className="font-medium">{t.subject}</TableCell>
                <TableCell>{t.category_name}</TableCell>
                <TableCell className="text-xs">{t.raised_by_name}</TableCell>
                <TableCell><Badge className={STATUS_COLOR[t.status]}>{t.status.replace("_"," ")}</Badge></TableCell>
                <TableCell><Badge className={PRI_COLOR[t.priority]}>{t.priority}</Badge></TableCell>
                <TableCell className="text-right text-xs">{t.assignee_name || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="new-ticket-dialog">
          <DialogHeader><DialogTitle>Raise a ticket</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Category</Label>
              <Select value={f.category_id} onValueChange={v=>setF({...f,category_id:v})}>
                <SelectTrigger data-testid="ticket-cat"><SelectValue placeholder="Pick category"/></SelectTrigger>
                <SelectContent className="max-h-72">{cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {cats.length === 0 && <p className="text-xs text-amber-700 mt-1">No categories defined. HR must create categories first.</p>}
            </div>
            <div><Label>Subject</Label><Input value={f.subject} onChange={e=>setF({...f,subject:e.target.value})} data-testid="ticket-subject"/></div>
            <div><Label>Description</Label><Textarea rows={4} value={f.description} onChange={e=>setF({...f,description:e.target.value})} data-testid="ticket-desc"/></div>
            <div><Label>Priority</Label>
              <Select value={f.priority} onValueChange={v=>setF({...f,priority:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="ticket-save">Raise</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(v)=>{if(!v) setDetail(null);}}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="ticket-detail">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-zinc-500">{detail.code}</span>
                  <span>{detail.subject}</span>
                  <Badge className={STATUS_COLOR[detail.status]}>{detail.status.replace("_"," ")}</Badge>
                  <Badge className={PRI_COLOR[detail.priority]}>{detail.priority}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">{detail.description}</p>
                <div className="text-xs text-zinc-500 flex gap-3 flex-wrap">
                  <span>Raised by {detail.raised_by_name}</span>
                  <span>· {detail.category_name}</span>
                  {detail.assignee_name && <span>· Assigned to {detail.assignee_name}</span>}
                  {detail.first_response_due && <span>· First response due {detail.first_response_due.slice(0,16).replace("T"," ")}</span>}
                </div>

                <div className="border-t pt-3">
                  <div className="font-semibold text-sm mb-2 flex items-center gap-1.5"><ChatCircle size={14}/> Comments ({detail.comments?.length || 0})</div>
                  <div className="space-y-2 mb-3">
                    {(detail.comments || []).map(c => (
                      <div key={c.id} className={`rounded border p-2 text-sm ${c.is_internal ? "bg-amber-50 border-amber-200" : "bg-zinc-50 border-zinc-200"}`}>
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                          <span className="font-medium text-zinc-700">{c.author_name}</span>
                          <span>· {c.created_at.slice(0,16).replace("T"," ")}</span>
                          {c.is_internal && <Badge className="bg-amber-200 text-amber-900 text-[10px]">internal</Badge>}
                        </div>
                        <div className="whitespace-pre-wrap">{c.body}</div>
                      </div>
                    ))}
                  </div>
                  <Textarea rows={2} value={comment.body} onChange={e=>setComment({...comment,body:e.target.value})} placeholder="Add a comment…" data-testid="ticket-comment-input"/>
                  <div className="flex gap-2 items-center mt-2">
                    {(isHR || detail.assignee_user_id === user?.id) && (
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={comment.is_internal} onChange={e=>setComment({...comment,is_internal:e.target.checked})}/> Internal note</label>
                    )}
                    <div className="flex-1"/>
                    <Button size="sm" onClick={addComment} data-testid="ticket-comment-post">Post</Button>
                  </div>
                </div>

                {(isHR || detail.assignee_user_id === user?.id || detail.raised_by_user_id === user?.id) && (
                  <div className="border-t pt-3 flex gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 self-center">Change status:</span>
                    {(isHR || detail.assignee_user_id === user?.id) && detail.status !== "resolved" && <Button size="sm" variant="secondary" onClick={()=>setStatus("resolved")} data-testid="ticket-resolve">Resolve</Button>}
                    {(isHR) && detail.status === "resolved" && <Button size="sm" onClick={()=>setStatus("closed")} data-testid="ticket-close">Close</Button>}
                    {detail.raised_by_user_id === user?.id && detail.status === "resolved" && <Button size="sm" variant="outline" onClick={()=>setStatus("reopened")}>Reopen</Button>}
                    {(isHR || detail.assignee_user_id === user?.id) && detail.status === "open" && <Button size="sm" variant="outline" onClick={()=>setStatus("in_progress")}>Start</Button>}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── Ticket categories (HR admin) ────────────────────────────────────────
export function TicketCategories() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name:"", slug:"", sla_hours_first_response:8, sla_hours_resolve:48 });

  const load = async () => { try { const r = await api.get("/ticket-categories"); setRows(r.data); } catch (e) { err(e); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.post("/ticket-categories", f); toast.success("Category added"); setOpen(false); setF({ name:"", slug:"", sla_hours_first_response:8, sla_hours_resolve:48 }); load(); }
    catch (e) { err(e); }
  };

  return (
    <AppShell title="Ticket categories">
      <SectionCard title="Categories" subtitle="Define helpdesk queues with SLAs."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-cat-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New category</Button>}
        testid="section-cats">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead className="text-right">SLA: First response</TableHead><TableHead className="text-right">SLA: Resolve</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-zinc-500">No categories.</TableCell></TableRow>}
            {rows.map(c => (
              <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell className="font-mono text-xs">{c.slug}</TableCell><TableCell className="text-right tabular-nums">{c.sla_hours_first_response}h</TableCell><TableCell className="text-right tabular-nums">{c.sla_hours_resolve}h</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="IT — Laptop" data-testid="cat-name"/></div>
            <div><Label>Slug</Label><Input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})} placeholder="it-laptop" data-testid="cat-slug"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First response SLA (hrs)</Label><Input type="number" value={f.sla_hours_first_response} onChange={e=>setF({...f,sla_hours_first_response:Number(e.target.value)})}/></div>
              <div><Label>Resolve SLA (hrs)</Label><Input type="number" value={f.sla_hours_resolve} onChange={e=>setF({...f,sla_hours_resolve:Number(e.target.value)})}/></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="cat-save">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── POSH (confidential) ─────────────────────────────────────────────────
const POSH_STATUS_COLOR = {
  filed: "bg-blue-100 text-blue-700", under_review: "bg-amber-100 text-amber-800",
  investigating: "bg-purple-100 text-purple-700", hearing: "bg-indigo-100 text-indigo-700",
  decision_pending: "bg-violet-100 text-violet-700", resolved_upheld: "bg-red-100 text-red-700",
  resolved_dismissed: "bg-zinc-100 text-zinc-700", withdrawn: "bg-zinc-200 text-zinc-600",
};

export function POSH() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [committee, setCommittee] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [f, setF] = useState({
    is_anonymous:false, complainant_name:"", respondent_name:"", respondent_designation:"",
    incident_date:"", incident_location:"", incident_description:"", severity:"medium", witnesses:"",
  });
  const [event, setEvent] = useState({ kind:"note", body:"" });

  const load = async () => {
    try {
      const r = await api.get("/posh/complaints");
      setRows(r.data);
      try { const c = await api.get("/posh/committee"); setCommittee(c.data); } catch (_) {}
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const file = async () => {
    try {
      const body = {
        ...f,
        witnesses: f.witnesses ? f.witnesses.split(",").map(s=>s.trim()).filter(Boolean) : [],
      };
      if (!body.incident_date) delete body.incident_date;
      const r = await api.post("/posh/complaints", body);
      toast.success(`Complaint received: ${r.data.code}`); setOpen(false);
      setF({ is_anonymous:false, complainant_name:"", respondent_name:"", respondent_designation:"", incident_date:"", incident_location:"", incident_description:"", severity:"medium", witnesses:"" });
      load();
    } catch (e) { err(e); }
  };
  const openDetail = async (id) => {
    try { const r = await api.get(`/posh/complaints/${id}`); setDetail(r.data); } catch (e) { err(e); }
  };
  const logEvent = async () => {
    if (!event.body) return;
    try { await api.post(`/posh/complaints/${detail.id}/event`, event); setEvent({ kind:"note", body:"" }); openDetail(detail.id); } catch (e) { err(e); }
  };
  const setStatus = async (status) => {
    try { await api.post(`/posh/complaints/${detail.id}/status`, { status }); openDetail(detail.id); load(); } catch (e) { err(e); }
  };
  const closeOutcome = async (outcome) => {
    const notes = prompt("Outcome notes?") || "";
    try { await api.post(`/posh/complaints/${detail.id}/outcome`, { outcome, outcome_notes: notes }); openDetail(detail.id); load(); } catch (e) { err(e); }
  };

  const isCommittee = committee.some(m => m.user_id === user?.id);

  return (
    <AppShell title="PoSH — Confidential">
      <div className="bg-rose-50 border-2 border-rose-200 rounded-lg p-4 mb-5 flex gap-3">
        <Lock size={28} className="text-rose-700 shrink-0 mt-0.5" weight="duotone"/>
        <div>
          <div className="font-semibold text-rose-900">Confidential — PoSH Committee members only</div>
          <p className="text-sm text-rose-800">Complaints filed under the Prevention of Sexual Harassment (PoSH) Act 2013 are kept strictly confidential. Only designated PoSH Committee members can view complaints. Identities of complainants are protected.</p>
        </div>
      </div>

      <SectionCard title="Complaints" testid="section-posh"
        action={<Button size="sm" onClick={()=>setOpen(true)} className="gap-1.5 bg-rose-600 hover:bg-rose-700" data-testid="file-posh-btn"><WarningOctagon size={14}/> File complaint</Button>}>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Filed</TableHead><TableHead>Complainant</TableHead><TableHead>Respondent</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-zinc-500">No complaints.</TableCell></TableRow>}
            {rows.map(c => (
              <TableRow key={c.id} onClick={()=>openDetail(c.id)} className="cursor-pointer hover:bg-zinc-50" data-testid={`posh-row-${c.id}`}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="text-xs">{(c.filed_at || c.created_at || "").slice(0,10)}</TableCell>
                <TableCell>{c.is_anonymous ? <Badge variant="outline">Anonymous</Badge> : c.complainant_name}</TableCell>
                <TableCell>{c.respondent_name || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{c.severity}</Badge></TableCell>
                <TableCell><Badge className={POSH_STATUS_COLOR[c.status]}>{c.status.replace(/_/g," ")}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="posh-file-dialog">
          <DialogHeader><DialogTitle>File PoSH complaint</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <label className="flex items-center gap-2 p-3 bg-rose-50 rounded border border-rose-200">
              <input type="checkbox" checked={f.is_anonymous} onChange={e=>setF({...f,is_anonymous:e.target.checked})} data-testid="posh-anon"/>
              <span className="text-sm"><span className="font-semibold">File anonymously</span> — your identity will not be stored or shared.</span>
            </label>
            {!f.is_anonymous && (
              <div><Label>Your name (optional)</Label><Input value={f.complainant_name} onChange={e=>setF({...f,complainant_name:e.target.value})}/></div>
            )}
            <div><Label>Respondent name</Label><Input value={f.respondent_name} onChange={e=>setF({...f,respondent_name:e.target.value})} data-testid="posh-respondent"/></div>
            <div><Label>Respondent designation</Label><Input value={f.respondent_designation} onChange={e=>setF({...f,respondent_designation:e.target.value})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Incident date</Label><Input type="date" value={f.incident_date} onChange={e=>setF({...f,incident_date:e.target.value})}/></div>
              <div><Label>Severity</Label>
                <Select value={f.severity} onValueChange={v=>setF({...f,severity:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Incident location</Label><Input value={f.incident_location} onChange={e=>setF({...f,incident_location:e.target.value})}/></div>
            <div><Label>Describe the incident (be specific, factual)</Label><Textarea rows={5} value={f.incident_description} onChange={e=>setF({...f,incident_description:e.target.value})} data-testid="posh-desc"/></div>
            <div><Label>Witnesses (comma separated names)</Label><Input value={f.witnesses} onChange={e=>setF({...f,witnesses:e.target.value})}/></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button>
            <Button onClick={file} className="bg-rose-600 hover:bg-rose-700" data-testid="posh-submit">Submit confidentially</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(v)=>{if(!v) setDetail(null);}}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="posh-detail">
          {detail && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock size={16}/> {detail.code}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-zinc-500">Complainant</div>{detail.is_anonymous ? <Badge variant="outline">Anonymous</Badge> : <div>{detail.complainant_name}</div>}</div>
                  <div><div className="text-xs text-zinc-500">Respondent</div><div>{detail.respondent_name || "—"}</div></div>
                  <div><div className="text-xs text-zinc-500">Incident date</div><div>{detail.incident_date || "—"}</div></div>
                  <div><div className="text-xs text-zinc-500">Severity</div><Badge variant="outline" className="capitalize">{detail.severity}</Badge></div>
                </div>
                <div><div className="text-xs text-zinc-500 mb-1">Description</div><p className="text-sm whitespace-pre-wrap">{detail.incident_description}</p></div>

                {isCommittee && (
                  <>
                    <div className="border-t pt-3">
                      <div className="font-semibold text-sm mb-2">Investigation log</div>
                      <div className="space-y-2 mb-3">
                        {(detail.investigation_log || []).map(e => (
                          <div key={e.id} className="bg-zinc-50 rounded p-2 text-sm border border-zinc-200">
                            <div className="text-xs text-zinc-500 mb-1">{e.by_name} · {e.at.slice(0,16).replace("T"," ")} · <span className="uppercase">{e.kind}</span></div>
                            <div className="whitespace-pre-wrap">{e.body}</div>
                          </div>
                        ))}
                      </div>
                      <Textarea rows={2} value={event.body} onChange={e=>setEvent({...event,body:e.target.value})} placeholder="Log an event / note / decision…"/>
                      <div className="flex gap-2 items-center mt-2">
                        <Select value={event.kind} onValueChange={v=>setEvent({...event,kind:v})}>
                          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue/></SelectTrigger>
                          <SelectContent><SelectItem value="note">Note</SelectItem><SelectItem value="status_change">Status change</SelectItem><SelectItem value="hearing_scheduled">Hearing</SelectItem><SelectItem value="document_added">Document added</SelectItem><SelectItem value="witness_added">Witness added</SelectItem></SelectContent>
                        </Select>
                        <div className="flex-1"/>
                        <Button size="sm" onClick={logEvent} data-testid="posh-event-post">Log</Button>
                      </div>
                    </div>
                    <div className="border-t pt-3 flex gap-2 flex-wrap">
                      <span className="text-xs text-zinc-500 self-center">Status:</span>
                      <Button size="sm" variant="outline" onClick={()=>setStatus("under_review")}>Under review</Button>
                      <Button size="sm" variant="outline" onClick={()=>setStatus("investigating")}>Investigate</Button>
                      <Button size="sm" variant="outline" onClick={()=>setStatus("hearing")}>Hearing</Button>
                      <Button size="sm" onClick={()=>closeOutcome("upheld")} className="bg-rose-600 hover:bg-rose-700">Uphold</Button>
                      <Button size="sm" variant="outline" onClick={()=>closeOutcome("dismissed")}>Dismiss</Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
