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
import { Plus, DownloadSimple, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATS = ["offer","appointment","experience","relieving","noc","address_proof","salary_increment","warning","promotion","travel_authorization","other"];

export default function Letters() {
  const [tab, setTab] = useState("generated");
  return (
    <AppShell title="Letters">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[{k:"generated",l:"Generated letters"},{k:"templates",l:"Templates"}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} data-testid={`letters-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "templates" ? <TemplatesTab/> : <GeneratedTab/>}
    </AppShell>
  );
}

function TemplatesTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank());
  function blank() { return { name:"", slug:"", category:"other", body_markdown:"", merge_fields:[] }; }
  const load = async () => { const r = await api.get("/letter-templates"); setRows(r.data); };
  useEffect(() => { load().catch(()=>{}); }, []);
  const save = async () => {
    try { await api.post("/letter-templates", f); toast.success("Template saved"); setOpen(false); setF(blank()); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  return (
    <>
      <SectionCard title="Letter templates" subtitle="Markdown with {{merge_fields}} like {{employee_name}}, {{doj}}, {{ctc_annual}}, {{today}}."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="tmpl-new-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New template</Button>}>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Slug</TableHead><TableHead>Fields</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length===0 && <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 py-6">No templates yet.</TableCell></TableRow>}
            {rows.map(r=>(
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="capitalize">{r.category?.replace(/_/g," ")}</TableCell>
                <TableCell className="text-zinc-500 text-xs">{r.slug}</TableCell>
                <TableCell className="text-xs text-zinc-500">{(r.merge_fields||[]).join(", ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>New template</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f, name:e.target.value})}/></div>
              <div><Label>Slug</Label><Input value={f.slug} onChange={e=>setF({...f, slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-")})}/></div>
              <div>
                <Label>Category</Label>
                <Select value={f.category} onValueChange={v=>setF({...f, category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{CATS.map(c=>(<SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g," ")}</SelectItem>))}</SelectContent></Select>
              </div>
            </div>
            <div>
              <Label>Body (Markdown with {"{{merge}}"} fields)</Label>
              <Textarea rows={12} value={f.body_markdown} onChange={e=>setF({...f, body_markdown:e.target.value})} placeholder={`To whom it may concern,\n\nThis is to certify that {{employee_name}} ({{employee_code}}) has been employed with us as {{designation}} from {{doj}}.\n\nDate: {{today}}`}/>
              <p className="text-xs text-zinc-500 mt-1">Common: employee_name, employee_code, designation, department, branch, doj, ctc_annual, gross_monthly, today</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GeneratedTab() {
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [tplId, setTplId] = useState("");
  const [empId, setEmpId] = useState("");

  const load = async () => {
    try {
      const [letters, tpls, emps] = await Promise.all([api.get("/letters"), api.get("/letter-templates"), api.get("/employees")]);
      setRows(letters.data); setTemplates(tpls.data); setEmployees(emps.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    try { await api.post("/letters/generate", { template_id: tplId, employee_id: empId });
      toast.success("Letter generated"); setOpen(false); setTplId(""); setEmpId(""); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  const download = async (id, name) => {
    try {
      const r = await api.get(`/letters/${id}/pdf`, { responseType:"blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const link = document.createElement("a"); link.href=url; link.download=name+".pdf";
      document.body.appendChild(link); link.click(); link.remove();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <>
      <SectionCard title="Generated letters" subtitle="Render, e-sign, and download PDF."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="letter-gen-btn" className="gap-1.5"><Plus size={14} weight="bold"/> Generate</Button>}>
        <Table>
          <TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead>Issued</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length===0 && <TableRow><TableCell colSpan={5} className="text-center text-zinc-500 py-6">No letters yet.</TableCell></TableRow>}
            {rows.map(r=>(
              <TableRow key={r.id}>
                <TableCell className="font-medium flex items-center gap-2"><FileText size={14}/>{r.template_name}</TableCell>
                <TableCell>{r.employee_name || "-"}</TableCell>
                <TableCell><Badge className={r.status==="signed"?"bg-emerald-100 text-emerald-800":"bg-zinc-100 text-zinc-700"}>{r.status}</Badge></TableCell>
                <TableCell className="text-zinc-500 text-xs">{(r.issued_at||"").slice(0,10)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={()=>download(r.id, `${r.template_name}_${r.employee_name||"letter"}`)} className="gap-1"><DownloadSimple size={14}/>PDF</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Generate letter</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Template</Label>
              <Select value={tplId} onValueChange={setTplId}><SelectTrigger><SelectValue placeholder="Select template"/></SelectTrigger><SelectContent>{templates.map(t=>(<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectContent></Select>
            </div>
            <div>
              <Label>Employee (optional)</Label>
              <Select value={empId} onValueChange={setEmpId}><SelectTrigger><SelectValue placeholder="Select employee"/></SelectTrigger><SelectContent>{employees.map(e=>(<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}</SelectContent></Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={generate}>Generate</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
