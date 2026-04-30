import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Plus, Package, ClipboardText, Check, Hand } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const STATUS_BADGE = {
  draft:     "bg-zinc-100 text-zinc-700 border-zinc-200",
  issued:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial:   "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-sky-50 text-sky-700 border-sky-200",
  returned:  "bg-violet-50 text-violet-700 border-violet-200",
};

export default function JoiningKit() {
  return (
    <AppShell title="Joining Kit">
      <Toaster richColors position="top-right"/>
      <Tabs defaultValue="issuances" className="space-y-4">
        <TabsList className="bg-zinc-100">
          <TabsTrigger value="issuances" data-testid="kit-tab-issuances"><Package size={14} className="mr-1.5"/>Issuances</TabsTrigger>
          <TabsTrigger value="templates" data-testid="kit-tab-templates"><ClipboardText size={14} className="mr-1.5"/>Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="issuances"><Issuances/></TabsContent>
        <TabsContent value="templates"><Templates/></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Issuances() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", template_id: "", notes: "" });

  const load = async () => {
    try {
      const [iss, emps, tpls] = await Promise.all([
        api.get("/joining-kit/issuances"),
        api.get("/employees"),
        api.get("/joining-kit/templates"),
      ]);
      setRows(iss.data); setEmployees(emps.data); setTemplates(tpls.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.employee_id || !form.template_id) return toast.error("Pick employee and template");
    try {
      await api.post("/joining-kit/issuances", form);
      toast.success("Kit assigned");
      setOpen(false); setForm({ employee_id: "", template_id: "", notes: "" }); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Failed"); }
  };

  const issue = async (iss) => {
    if (!window.confirm(`Mark all items as issued to ${iss.employee_name}?`)) return;
    try {
      await api.post(`/joining-kit/issuances/${iss.id}/issue`, {});
      toast.success("Marked as issued");
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <SectionCard title={`${rows.length} kit issuances`}
      subtitle="Track what was promised, issued, signed for, and returned on exit."
      testid="section-issuances"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-9" data-testid="kit-issue-btn"><Plus size={14}/>New issuance</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Assign joining kit</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Employee *</Label>
                <Select value={form.employee_id} onValueChange={v => setForm({...form, employee_id: v})}>
                  <SelectTrigger className="mt-1" data-testid="kit-employee-select"><SelectValue placeholder="Choose employee"/></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name} · {e.employee_code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Kit template *</Label>
                <Select value={form.template_id} onValueChange={v => setForm({...form, template_id: v})}>
                  <SelectTrigger className="mt-1" data-testid="kit-template-select"><SelectValue placeholder="Choose template"/></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.is_default ? " · default" : ""} · {t.items?.length || 0} items
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label>
                <Input className="mt-1" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} data-testid="kit-issue-save-btn">Assign</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }>
      {rows.length === 0 ? (
        <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="kit-iss-empty">
          No issuances yet. Click "New issuance" to assign a kit on someone's joining day.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="py-2 px-3">Employee</th><th>Template</th><th>Items</th><th>Status</th><th>Issued</th><th>Signed</th><th className="text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50" data-testid={`kit-row-${r.id}`}>
                  <td className="py-2 px-3 font-medium">{r.employee_name}<div className="text-xs text-zinc-500">{r.employee_code}</div></td>
                  <td className="text-zinc-700 text-xs">{r.template_name || "Ad-hoc"}</td>
                  <td className="text-zinc-700 text-xs">{r.items?.length || 0} ({r.items?.filter(i => i.is_returnable).length || 0} returnable)</td>
                  <td><Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[r.status] || ""}`}>{r.status}</Badge></td>
                  <td className="text-xs text-zinc-500">{r.issued_at ? new Date(r.issued_at).toLocaleDateString() : "—"}</td>
                  <td className="text-xs text-zinc-500">{r.employee_signature_at ? "✓" : "—"}</td>
                  <td className="text-right pr-3">
                    {r.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => issue(r)} data-testid={`kit-issue-row-${r.id}`}>
                        <Hand size={11}/> Mark issued
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function Templates() {
  const [rows, setRows] = useState([]);
  const load = async () => {
    try { const { data } = await api.get("/joining-kit/templates"); setRows(data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  return (
    <SectionCard title={`${rows.length} kit templates`}
      subtitle="Pre-defined kits. Defaults auto-suggested when a new employee joins."
      testid="section-templates">
      {rows.length === 0 ? (
        <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="kit-tpl-empty">
          No templates yet. Run the seed script to populate defaults.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(t => (
            <article key={t.id} className="border border-zinc-200 rounded-lg p-4" data-testid={`kit-tpl-${t.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{t.description || "—"}</p>
                </div>
                {t.is_default && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Default</Badge>}
              </div>
              <ul className="mt-3 space-y-1">
                {t.items?.map((it, i) => (
                  <li key={i} className="text-xs flex items-center gap-1.5">
                    <Check size={11} className="text-emerald-600 flex-none"/>
                    <span className="font-medium">{it.name}</span>
                    <span className="text-zinc-500">× {it.quantity}</span>
                    {it.is_returnable && <Badge variant="outline" className="text-[9px] ml-auto">returnable</Badge>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
