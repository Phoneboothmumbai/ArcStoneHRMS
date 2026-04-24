import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATS = ["code_of_conduct","pii_privacy","it_security","travel","leave","attendance","expense","posh","benefits","other"];

export default function Policies() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank());
  function blank() {
    return { title:"", slug:"", category:"other", version:"1.0", body_markdown:"", effective_from:new Date().toISOString().slice(0,10), requires_acknowledgement:true, acknowledgement_grace_days:14 };
  }
  const load = async () => { try { const r = await api.get("/policies"); setRows(r.data); } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.post("/policies", f); toast.success("Saved"); setOpen(false); setF(blank()); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const publish = async (id) => { await api.post(`/policies/${id}/publish`); toast.success("Published"); load(); };
  const archive = async (id) => { if (!window.confirm("Archive this policy?")) return; await api.post(`/policies/${id}/archive`); toast.success("Archived"); load(); };

  return (
    <AppShell title="Policies">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total policies" value={rows.length}/>
        <StatCard label="Published" value={rows.filter(r=>r.status==="published").length}/>
        <StatCard label="Drafts" value={rows.filter(r=>r.status==="draft").length}/>
        <StatCard label="Requires ack" value={rows.filter(r=>r.requires_acknowledgement).length}/>
      </div>
      <SectionCard title="Policy library" subtitle="Markdown policies with click-wrap acknowledgement. Employees see only published ones."
        testid="section-policies"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="policy-new-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New policy</Button>}>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-zinc-500 text-center py-6">No policies yet.</p>}
          {rows.map(p => (
            <div key={p.id} className="border border-zinc-200 rounded-lg p-4 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{p.title}</h3>
                    <Badge variant="outline" className="capitalize text-xs">{p.category.replace(/_/g," ")}</Badge>
                    <Badge className={p.status==="published"?"bg-emerald-100 text-emerald-800":p.status==="draft"?"bg-zinc-100 text-zinc-700":"bg-zinc-200 text-zinc-600"}>{p.status}</Badge>
                    <span className="text-xs text-zinc-500">v{p.version}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Effective {p.effective_from}
                    {p.requires_acknowledgement && <span className="ml-2">· {(p.acknowledgements||[]).length} acks</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  {p.status === "draft" && <Button size="sm" onClick={()=>publish(p.id)} data-testid={`publish-${p.slug}`}>Publish</Button>}
                  {p.status === "published" && <Button size="sm" variant="outline" onClick={()=>archive(p.id)}>Archive</Button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>New policy</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Title</Label><Input value={f.title} onChange={e=>setF({...f, title:e.target.value})} placeholder="IT Security Policy"/></div>
              <div><Label>Slug (URL id)</Label><Input value={f.slug} onChange={e=>setF({...f, slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-")})} placeholder="it-security-v1"/></div>
              <div>
                <Label>Category</Label>
                <Select value={f.category} onValueChange={v=>setF({...f, category:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{CATS.map(c=>(<SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g," ")}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label>Version</Label><Input value={f.version} onChange={e=>setF({...f, version:e.target.value})}/></div>
              <div><Label>Effective from</Label><Input type="date" value={f.effective_from} onChange={e=>setF({...f, effective_from:e.target.value})}/></div>
              <div className="flex items-end gap-2">
                <input type="checkbox" checked={f.requires_acknowledgement} onChange={e=>setF({...f, requires_acknowledgement:e.target.checked})} id="reqack"/>
                <label htmlFor="reqack" className="text-sm">Requires acknowledgement</label>
              </div>
            </div>
            <div>
              <Label>Body (Markdown)</Label>
              <Textarea rows={10} value={f.body_markdown} onChange={e=>setF({...f, body_markdown:e.target.value})} placeholder="# Section 1&#10;Body text..."/>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="policy-save-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
