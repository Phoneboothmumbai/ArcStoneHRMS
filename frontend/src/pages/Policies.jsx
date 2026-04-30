import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, CheckCircle, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATS = ["code_of_conduct","pii_privacy","it_security","travel","leave","attendance","expense","posh","benefits","other"];

// Roles that can author / publish / archive policies. Everyone else is a reader.
const POLICY_ADMINS = ["super_admin", "company_admin", "country_head", "region_head"];

export default function Policies() {
  const { user } = useAuth();
  const isAdmin = POLICY_ADMINS.includes(user?.role);

  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(null);     // policy currently being read by employee
  const [f, setF] = useState(blank());

  function blank() {
    return {
      title: "", slug: "", category: "other", version: "1.0",
      body_markdown: "",
      effective_from: new Date().toISOString().slice(0, 10),
      requires_acknowledgement: true, acknowledgement_grace_days: 14,
    };
  }

  const load = async () => {
    try {
      const r = await api.get("/policies");
      setRows(r.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/policies", f); toast.success("Saved");
      setOpen(false); setF(blank()); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const publish = async (id) => { await api.post(`/policies/${id}/publish`); toast.success("Published"); load(); };
  const archive = async (id) => {
    if (!window.confirm("Archive this policy?")) return;
    await api.post(`/policies/${id}/archive`); toast.success("Archived"); load();
  };

  const openRead = async (slug) => {
    try {
      const r = await api.get(`/policies/${slug}`);
      setReading(r.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const acknowledge = async (slug) => {
    try {
      await api.post(`/policies/${slug}/acknowledge`);
      toast.success("Acknowledged ✓");
      setReading(null);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  // Has the current user already acked this policy?
  const myAck = (p) =>
    Array.isArray(p.acknowledgements)
      ? p.acknowledgements.find(a => a.employee_id === user?.employee_id)
      : null;

  // Pending count for the employee inbox card
  const pendingForMe = useMemo(
    () => rows.filter(p => p.status === "published" && p.requires_acknowledgement && !myAck(p)).length,
    [rows, user?.employee_id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <AppShell title="Policies">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total policies" value={rows.length} />
        <StatCard label="Published" value={rows.filter(r => r.status === "published").length} />
        {isAdmin
          ? <StatCard label="Drafts" value={rows.filter(r => r.status === "draft").length} />
          : <StatCard label="Pending my ack" value={pendingForMe} />}
        <StatCard label="Requires ack" value={rows.filter(r => r.requires_acknowledgement).length} />
      </div>

      <SectionCard
        title="Policy library"
        subtitle={
          isAdmin
            ? "Markdown policies with click-wrap acknowledgement. Employees see only published ones."
            : "Read each policy and click Acknowledge to confirm you understand it."
        }
        testid="section-policies"
        action={
          isAdmin && (
            <Button size="sm" onClick={() => setOpen(true)} data-testid="policy-new-btn" className="gap-1.5">
              <Plus size={14} weight="bold"/> New policy
            </Button>
          )
        }
      >
        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-zinc-500 text-center py-6">
              {isAdmin ? "No policies yet." : "No published policies for you yet."}
            </p>
          )}
          {rows.map(p => {
            const acked = myAck(p);
            const needsAck = p.status === "published" && p.requires_acknowledgement && !acked;
            return (
              <div
                key={p.id}
                className={`border rounded-lg p-4 bg-white transition ${
                  needsAck ? "border-amber-300 bg-amber-50/40" : "border-zinc-200"
                }`}
                data-testid={`policy-row-${p.slug}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{p.title}</h3>
                      <Badge variant="outline" className="capitalize text-xs">{(p.category || "").replace(/_/g, " ")}</Badge>
                      <Badge className={p.status === "published" ? "bg-emerald-100 text-emerald-800" : p.status === "draft" ? "bg-zinc-100 text-zinc-700" : "bg-zinc-200 text-zinc-600"}>{p.status}</Badge>
                      <span className="text-xs text-zinc-500">v{p.version}</span>
                      {acked && <span className="text-xs text-emerald-700 font-medium flex items-center gap-1"><CheckCircle size={12} weight="fill"/> Acknowledged</span>}
                      {needsAck && <span className="text-xs text-amber-700 font-medium">⚠ Pending your acknowledgement</span>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Effective {p.effective_from}
                      {isAdmin && p.requires_acknowledgement && (
                        <span className="ml-2">· {(p.acknowledgements || []).length} acks across team</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {/* Reader actions — every role */}
                    <Button
                      size="sm" variant="outline"
                      onClick={() => openRead(p.slug)}
                      data-testid={`policy-read-${p.slug}`}
                      className="gap-1"
                    >
                      <FileText size={12}/> Read
                    </Button>

                    {/* Admin-only actions */}
                    {isAdmin && p.status === "draft" && (
                      <Button size="sm" onClick={() => publish(p.id)} data-testid={`publish-${p.slug}`}>Publish</Button>
                    )}
                    {isAdmin && p.status === "published" && (
                      <Button size="sm" variant="outline" onClick={() => archive(p.id)}>Archive</Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ---- Read-and-acknowledge dialog (every role) ---- */}
      <Dialog open={!!reading} onOpenChange={(v) => !v && setReading(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {reading && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {reading.title}
                  <Badge variant="outline" className="capitalize text-xs">{(reading.category || "").replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-zinc-500">v{reading.version}</span>
                </DialogTitle>
                <p className="text-xs text-zinc-500 mt-1">Effective {reading.effective_from}</p>
              </DialogHeader>
              <article className="prose prose-sm max-w-none whitespace-pre-wrap py-3 text-zinc-800 font-sans-alt">
                {reading.body_markdown || reading.content || "No content yet."}
              </article>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReading(null)}>Close</Button>
                {reading.requires_acknowledgement && !myAck(reading) && (
                  <Button
                    onClick={() => acknowledge(reading.slug)}
                    className="gap-1.5"
                    data-testid={`policy-ack-${reading.slug}`}
                  >
                    <CheckCircle size={14} weight="fill"/> I have read and understood
                  </Button>
                )}
                {myAck(reading) && (
                  <span className="text-sm text-emerald-700 flex items-center gap-1.5 px-3">
                    <CheckCircle size={14} weight="fill"/> Acknowledged on {myAck(reading).acknowledged_at?.slice(0, 10)}
                  </span>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Admin-only "New policy" dialog ---- */}
      {isAdmin && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>New policy</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2 max-h-[60vh] overflow-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Title</Label><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="IT Security Policy"/></div>
                <div><Label>Slug (URL id)</Label><Input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="it-security-v1"/></div>
                <div>
                  <Label>Category</Label>
                  <Select value={f.category} onValueChange={v => setF({ ...f, category: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{CATS.map(c => (<SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div><Label>Version</Label><Input value={f.version} onChange={e => setF({ ...f, version: e.target.value })}/></div>
                <div><Label>Effective from</Label><Input type="date" value={f.effective_from} onChange={e => setF({ ...f, effective_from: e.target.value })}/></div>
                <div className="flex items-end gap-2">
                  <input type="checkbox" checked={f.requires_acknowledgement} onChange={e => setF({ ...f, requires_acknowledgement: e.target.checked })} id="reqack"/>
                  <label htmlFor="reqack" className="text-sm">Requires acknowledgement</label>
                </div>
              </div>
              <div>
                <Label>Body (Markdown)</Label>
                <Textarea rows={10} value={f.body_markdown} onChange={e => setF({ ...f, body_markdown: e.target.value })} placeholder="# Section 1&#10;Body text..."/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} data-testid="policy-save-btn">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
