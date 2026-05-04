import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { FilePdf, Receipt, Plus, Trash, ArrowClockwise, Warning, Buildings, CalendarBlank, FloppyDisk, DownloadSimple, Lightning, ClockClockwise, UploadSimple, CheckCircle, XCircle } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const DOC_TYPES = [
  { v: "utility_bill",       label: "Utility Bill" },
  { v: "rent_agreement",     label: "Rent Agreement" },
  { v: "property_tax",       label: "Property Tax" },
  { v: "maintenance_contract", label: "Maintenance Contract" },
  { v: "fire_safety",        label: "Fire Safety Cert." },
  { v: "business_license",   label: "Business License" },
  { v: "shop_establishment", label: "Shop & Establishment" },
  { v: "insurance",          label: "Insurance" },
  { v: "amc_contract",       label: "AMC Contract" },
  { v: "other",              label: "Other" },
];

const REC_CATEGORIES = [
  "electricity", "internet", "water", "gas", "phone_internet", "sim_cards",
  "tea_coffee", "housekeeping", "pantry_supplies", "drinking_water",
  "office_supplies", "subscription", "rent", "maintenance",
  "security", "courier", "other",
];

const MODE_INFO = {
  AUTO_SUBMIT:   { label: "Auto-submit",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "Fires straight into approval on the chosen day. Ideal for fixed bills." },
  AUTO_DRAFT:    { label: "Auto-draft",   cls: "bg-amber-50 text-amber-700 border-amber-200", hint: "Drafts on the chosen day. Branch manager reviews and submits." },
  MANUAL_ONE_CLICK: { label: "Manual",   cls: "bg-zinc-100 text-zinc-700 border-zinc-200", hint: "No schedule. Click 'Run this month' when needed." },
};

const DOC_TYPE_BADGE = (t) => {
  const styles = {
    utility_bill: "bg-amber-50 text-amber-700 border-amber-200",
    rent_agreement: "bg-violet-50 text-violet-700 border-violet-200",
    property_tax: "bg-rose-50 text-rose-700 border-rose-200",
    fire_safety: "bg-red-50 text-red-700 border-red-200",
    insurance: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return styles[t] || "bg-zinc-100 text-zinc-700 border-zinc-200";
};

const fmt = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function BranchOperations() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState("documents");

  useEffect(() => {
    api.get("/org/branches").then(r => {
      setBranches(r.data);
      if (r.data.length && !branchId) setBranchId(r.data[0].id);
    }).catch(e => toast.error(formatApiError(e?.response?.data?.detail)));
    // eslint-disable-next-line
  }, []);

  return (
    <AppShell title="Branch Operations">
      <Toaster richColors position="top-right" />
      <div className="mb-4 flex items-center gap-3">
        <Buildings size={18} className="text-zinc-500"/>
        <Label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Branch</Label>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-72 h-9" data-testid="bops-branch-select">
            <SelectValue placeholder="Select a branch"/>
          </SelectTrigger>
          <SelectContent>
            {branches.map(b => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}{b.is_head_office ? " · HQ" : ""}{b.city ? ` · ${b.city}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          {branchId && <OneTimeExpense branchId={branchId} />}
        </div>
      </div>

      {!branchId ? (
        <SectionCard title="Pick a branch to manage" testid="section-empty">
          <p className="text-sm text-zinc-500">No branches yet. Create one in Locations first.</p>
        </SectionCard>
      ) : (
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-zinc-100">
          <TabsTrigger value="documents" data-testid="bops-tab-docs">
            <FilePdf size={14} className="mr-1.5"/> Document Vault
          </TabsTrigger>
          <TabsTrigger value="recurring" data-testid="bops-tab-recurring">
            <ArrowClockwise size={14} className="mr-1.5"/> Recurring Expenses
          </TabsTrigger>
          <TabsTrigger value="alerts" data-testid="bops-tab-alerts">
            <Warning size={14} className="mr-1.5"/> Expiry Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <DocumentsPanel branchId={branchId} />
        </TabsContent>
        <TabsContent value="recurring">
          <RecurringPanel branchId={branchId} />
        </TabsContent>
        <TabsContent value="alerts">
          <ExpiryAlertsPanel />
        </TabsContent>
      </Tabs>
      )}
    </AppShell>
  );
}


// ─── Document Vault Tab ────────────────────────────────────────────────────────
function DocumentsPanel({ branchId }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blankDoc());

  function blankDoc() {
    return {
      doc_type: "utility_bill", title: "", description: "",
      vendor_name: "", amount: "", currency: "INR",
      period_start: "", period_end: "", expiry_date: "",
      file_name: "", content_type: "", base64_data: "",
    };
  }

  const load = async () => {
    if (!branchId) return;
    try {
      const params = filter !== "all" ? { doc_type: filter } : {};
      const { data } = await api.get(`/branches/${branchId}/documents`, { params });
      setRows(data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branchId, filter]);

  const onFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    setForm(f => ({ ...f, file_name: file.name, content_type: file.type, base64_data: b64 }));
    toast.success(`Attached: ${file.name}`);
  };

  const submit = async () => {
    if (!form.title) return toast.error("Title is required");
    setBusy(true);
    try {
      const payload = {
        ...form,
        amount: form.amount === "" ? null : Number(form.amount),
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        expiry_date: form.expiry_date || null,
      };
      await api.post(`/branches/${branchId}/documents`, payload);
      toast.success("Document uploaded");
      setOpen(false); setForm(blankDoc()); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Upload failed"); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await api.delete(`/branches/${branchId}/documents/${id}`);
      toast.success("Deleted"); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const download = async (doc) => {
    try {
      const { data } = await api.get(`/branches/${branchId}/documents/${doc.id}/file`);
      const a = document.createElement("a");
      a.href = `data:${data.content_type};base64,${data.base64_data}`;
      a.download = data.file_name || `${doc.title}.bin`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error("Download failed"); }
  };

  return (
    <SectionCard
      title={`${rows.length} documents`}
      subtitle="Bills, agreements, licenses, certificates — keep them current."
      testid="section-documents"
      action={
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44 h-9" data-testid="docs-type-filter">
              <SelectValue placeholder="All types"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DOC_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <BulkUploader branchId={branchId} onDone={load}/>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setForm(blankDoc()); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-9" data-testid="docs-upload-btn"><Plus size={14}/> Upload</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Upload branch document</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div><Label>Document type *</Label>
                    <Select value={form.doc_type} onValueChange={v => setForm({...form, doc_type: v})}>
                      <SelectTrigger className="mt-1" data-testid="doc-type-select"><SelectValue/></SelectTrigger>
                      <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Title *</Label>
                    <Input className="mt-1" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="BESCOM Bill — Mar 2026" data-testid="doc-title"/>
                  </div>
                </div>
                <div><Label>Vendor / supplier</Label>
                  <Input className="mt-1" value={form.vendor_name} onChange={e => setForm({...form, vendor_name: e.target.value})} placeholder="BESCOM" data-testid="doc-vendor"/>
                </div>
                <div><Label>Amount (₹)</Label>
                  <Input className="mt-1" type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} data-testid="doc-amount"/>
                </div>
                <div><Label>Period start</Label>
                  <Input className="mt-1" type="date" value={form.period_start} onChange={e => setForm({...form, period_start: e.target.value})}/>
                </div>
                <div><Label>Period end</Label>
                  <Input className="mt-1" type="date" value={form.period_end} onChange={e => setForm({...form, period_end: e.target.value})}/>
                </div>
                <div className="col-span-2"><Label>Expiry / renewal date</Label>
                  <Input className="mt-1" type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} data-testid="doc-expiry"/>
                  <p className="text-[11px] text-zinc-500 mt-1">Used for renewal alerts (rent agreement, fire safety, license).</p>
                </div>
                <div className="col-span-2"><Label>Description</Label>
                  <Textarea rows={2} className="mt-1" value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
                </div>
                <div className="col-span-2"><Label>File (PDF/JPG/PNG · max 5MB)</Label>
                  <Input className="mt-1" type="file" accept="application/pdf,image/*" onChange={e => onFile(e.target.files?.[0])} data-testid="doc-file"/>
                  {form.file_name && <p className="text-xs text-emerald-700 mt-1">✓ {form.file_name}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit} disabled={busy} data-testid="doc-save-btn">
                  <FloppyDisk size={14} className="mr-1.5"/> {busy ? "Uploading…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="docs-empty">
          No documents uploaded yet. Click <span className="font-medium">Upload</span> to add the first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(d => {
            const expDays = d.expiry_date ? Math.ceil((new Date(d.expiry_date) - new Date()) / 86400000) : null;
            const expWarn = expDays !== null && expDays <= 30;
            const expBad = expDays !== null && expDays < 0;
            return (
              <article key={d.id} className="border border-zinc-200 rounded-lg p-4 hover:shadow-sm transition-shadow" data-testid={`doc-card-${d.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${DOC_TYPE_BADGE(d.doc_type)}`}>
                    {DOC_TYPES.find(t => t.v === d.doc_type)?.label || d.doc_type}
                  </Badge>
                  {expBad ? (
                    <Badge variant="outline" className="text-[10px] bg-red-50 border-red-200 text-red-700">Expired {Math.abs(expDays)}d</Badge>
                  ) : expWarn ? (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200 text-amber-700">Expires in {expDays}d</Badge>
                  ) : null}
                </div>
                <h3 className="font-semibold mt-2 line-clamp-2">{d.title}</h3>
                <div className="text-xs text-zinc-500 mt-1 space-y-0.5">
                  {d.vendor_name && <div>Vendor: <span className="text-zinc-700">{d.vendor_name}</span></div>}
                  {d.amount != null && <div>Amount: <span className="text-zinc-700 font-medium">{fmtINR(d.amount)}</span></div>}
                  {d.period_start && <div>Period: {fmt(d.period_start)} → {fmt(d.period_end)}</div>}
                  {d.expiry_date && <div className="flex items-center gap-1"><CalendarBlank size={11}/> Expires {fmt(d.expiry_date)}</div>}
                </div>
                <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-zinc-100">
                  {d.file_name && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => download(d)} data-testid={`doc-dl-${d.id}`}><DownloadSimple size={11}/>{d.file_name.length > 18 ? "Download" : d.file_name}</Button>}
                  <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => del(d.id)} data-testid={`doc-del-${d.id}`}><Trash size={12}/></Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}


// ─── Recurring Expenses Tab ───────────────────────────────────────────────────
function RecurringPanel({ branchId }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);

  function blank() {
    return {
      branch_id: "", name: "", category: "electricity",
      description: "", amount: "", currency: "INR",
      mode: "AUTO_DRAFT", day_of_month: 1, vendor_name: "", active: true,
    };
  }

  const load = async () => {
    if (!branchId) return;
    try {
      const { data } = await api.get(`/branches/${branchId}/recurring-expenses`);
      setRows(data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branchId]);

  const submit = async () => {
    if (!form.name || !form.amount) return toast.error("Name and amount are required");
    setBusy(true);
    try {
      const payload = { ...form, branch_id: branchId, amount: Number(form.amount), day_of_month: Number(form.day_of_month) };
      if (editing) {
        await api.put(`/recurring-expenses/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/recurring-expenses", payload);
        toast.success("Recurring expense saved");
      }
      setOpen(false); setEditing(null); setForm(blank()); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Save failed"); }
    finally { setBusy(false); }
  };

  const startEdit = (r) => {
    setEditing(r);
    setForm({
      branch_id: r.branch_id, name: r.name, category: r.category,
      description: r.description || "", amount: String(r.amount || ""),
      currency: r.currency || "INR", mode: r.mode, day_of_month: r.day_of_month,
      vendor_name: r.vendor_name || "", active: r.active !== false,
    });
    setOpen(true);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this recurring expense template?")) return;
    try { await api.delete(`/recurring-expenses/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const runNow = async (r) => {
    if (!window.confirm(`Run "${r.name}" for the current month? This will submit an expense for ${fmtINR(r.amount)}.`)) return;
    try {
      await api.post(`/recurring-expenses/${r.id}/run-now`);
      toast.success(`Submitted ${r.name} for this month`);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Run failed"); }
  };

  const monthlyEstimate = useMemo(() => rows.reduce((s, r) => s + (r.active ? Number(r.amount || 0) : 0), 0), [rows]);

  return (
    <SectionCard
      title={`${rows.length} recurring templates · est. ${fmtINR(monthlyEstimate)}/month`}
      subtitle="Monthly bills like electricity, internet, tea/coffee, housekeeping — auto-create expense claims on the chosen day."
      testid="section-recurring"
      action={
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm(blank()); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-9" data-testid="rec-new-btn"><Plus size={14}/> New template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? `Edit · ${editing.name}` : "New recurring expense"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="col-span-2"><Label>Name *</Label>
                <Input className="mt-1" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="BESCOM Electricity — Indiranagar" data-testid="rec-name"/>
              </div>
              <div><Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger className="mt-1" data-testid="rec-category"><SelectValue/></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {REC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Vendor / supplier</Label>
                <Input className="mt-1" value={form.vendor_name} onChange={e => setForm({...form, vendor_name: e.target.value})}/>
              </div>
              <div><Label>Monthly amount (₹) *</Label>
                <Input className="mt-1" type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} data-testid="rec-amount"/>
              </div>
              <div><Label>Day of month</Label>
                <Input className="mt-1" type="number" min="1" max="28" value={form.day_of_month} onChange={e => setForm({...form, day_of_month: e.target.value})} data-testid="rec-dom"/>
              </div>
              <div className="col-span-2"><Label>Mode *</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {Object.entries(MODE_INFO).map(([k, m]) => (
                    <button key={k} type="button"
                      data-testid={`rec-mode-${k}`}
                      onClick={() => setForm({...form, mode: k})}
                      className={`text-left border rounded-md p-2.5 transition ${form.mode === k ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider mb-1 ${m.cls}`}>{m.label}</Badge>
                      <p className="text-[11px] text-zinc-500 leading-snug">{m.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2"><Label>Description</Label>
                <Textarea rows={2} className="mt-1" value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <Switch checked={form.active} onCheckedChange={v => setForm({...form, active: v})} data-testid="rec-active"/>
                Active — fires on schedule
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy} data-testid="rec-save-btn">
                <FloppyDisk size={14} className="mr-1.5"/> {busy ? "Saving…" : (editing ? "Save" : "Create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {rows.length === 0 ? (
        <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="rec-empty">
          No recurring templates yet. Common ones: electricity, internet, tea/coffee, housekeeping.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="py-2 px-3">Template</th>
                <th>Mode</th>
                <th>Amount</th>
                <th>Day</th>
                <th>Last run</th>
                <th>Status</th>
                <th className="text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const mi = MODE_INFO[r.mode] || MODE_INFO.AUTO_DRAFT;
                return (
                  <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50" data-testid={`rec-row-${r.id}`}>
                    <td className="py-2 px-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-zinc-500">{r.category.replace(/_/g, " ")}{r.vendor_name ? ` · ${r.vendor_name}` : ""}</div>
                    </td>
                    <td><Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${mi.cls}`}>{mi.label}</Badge></td>
                    <td className="font-medium">{fmtINR(r.amount)}</td>
                    <td className="text-zinc-700">{r.day_of_month}<span className="text-xs text-zinc-500"> of mo.</span></td>
                    <td className="text-xs text-zinc-500">{r.last_run_period || "—"}</td>
                    <td>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${r.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
                        {r.active ? "Active" : "Paused"}
                      </Badge>
                    </td>
                    <td className="text-right pr-3">
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs mr-1" onClick={() => runNow(r)} data-testid={`rec-runnow-${r.id}`}>
                        <Lightning size={11}/> Run now
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 mr-1" onClick={() => startEdit(r)} data-testid={`rec-edit-${r.id}`}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => del(r.id)} data-testid={`rec-del-${r.id}`}><Trash size={12}/></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}


// ─── Expiry Alerts Tab ────────────────────────────────────────────────────────
function ExpiryAlertsPanel() {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(30);

  const load = async () => {
    try {
      const { data } = await api.get(`/branch-documents/expiring?days=${days}`);
      setRows(data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  return (
    <SectionCard
      title={`${rows.length} documents expiring within ${days} days`}
      subtitle="Org-wide view — renew rental agreements, fire-safety certificates, licenses before they lapse."
      testid="section-alerts"
      action={
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-32 h-9" data-testid="alert-window">
            <SelectValue/>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Next 7d</SelectItem>
            <SelectItem value="15">Next 15d</SelectItem>
            <SelectItem value="30">Next 30d</SelectItem>
            <SelectItem value="60">Next 60d</SelectItem>
            <SelectItem value="90">Next 90d</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {rows.length === 0 ? (
        <div className="border border-dashed border-emerald-200 bg-emerald-50/50 rounded-lg py-10 text-center text-sm text-emerald-800" data-testid="alerts-empty">
          ✓ No documents expiring in this window. All branches compliant.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="py-2 px-3">Document</th><th>Type</th><th>Branch</th><th>Expires</th><th>Days left</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const days = r.days_until_expiry;
                const danger = days != null && days <= 7;
                return (
                  <tr key={r.id} className={`border-t border-zinc-100 ${danger ? "bg-red-50/30" : ""}`} data-testid={`alert-row-${r.id}`}>
                    <td className="py-2 px-3">
                      <div className="font-medium">{r.title}</div>
                      {r.vendor_name && <div className="text-xs text-zinc-500">{r.vendor_name}</div>}
                    </td>
                    <td><Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${DOC_TYPE_BADGE(r.doc_type)}`}>
                      {DOC_TYPES.find(t => t.v === r.doc_type)?.label || r.doc_type}
                    </Badge></td>
                    <td className="text-xs text-zinc-700">{r.branch_id?.slice(0, 8)}</td>
                    <td className="text-xs text-zinc-700"><CalendarBlank size={11} className="inline mr-1"/>{fmt(r.expiry_date)}</td>
                    <td>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${days < 0 ? "bg-red-50 text-red-700 border-red-200" : days <= 7 ? "bg-red-50 text-red-700 border-red-200" : days <= 30 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-zinc-100 text-zinc-700 border-zinc-200"}`}>
                        {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d`}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}


// ─── One-time office expense quick form ──────────────────────────────────────
const ONE_TIME_CATS = ["office_supplies", "subscription", "phone_internet", "travel_taxi", "client_meeting", "training", "other"];

function OneTimeExpense({ branchId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "office_supplies", amount: "", description: "" });
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);

  const preflight = async () => {
    if (!form.amount) return;
    try {
      const { data } = await api.post("/budgets/check", {
        branch_id: branchId,
        category: form.category,
        amount: Number(form.amount),
      });
      setCheck(data);
    } catch (e) { setCheck(null); }
  };

  useEffect(() => {
    if (open && form.amount) {
      const t = setTimeout(preflight, 300);
      return () => clearTimeout(t);
    }
    setCheck(null);
    // eslint-disable-next-line
  }, [form.amount, form.category, open]);

  const submit = async () => {
    if (!form.amount) return toast.error("Amount required");
    if (check?.block && !window.confirm("Budget will be blocked. Continue with admin override?")) return;
    setBusy(true);
    try {
      const url = `/expenses${check?.block ? "?override_budget=true" : ""}`;
      const { data: claim } = await api.post(url, {
        title: form.description || `One-time ${form.category}`,
        purpose: "Branch operations — one-time expense",
        items: [{
          category: form.category,
          expense_date: new Date().toISOString().slice(0, 10),
          amount: Number(form.amount),
          currency: "INR",
          description: form.description || `One-time ${form.category}`,
          receipts: [],
        }],
        currency: "INR",
      });
      // Auto-submit through approval chain
      await api.post(`/expenses/${claim.id}/submit`);
      toast.success("One-time expense submitted for approval");
      setOpen(false); setForm({ category: "office_supplies", amount: "", description: "" }); setCheck(null);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" data-testid="bops-onetime-btn">
          <Receipt size={14}/> One-time expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>One-time office expense</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Category *</Label>
            <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
              <SelectTrigger className="mt-1" data-testid="onetime-category"><SelectValue/></SelectTrigger>
              <SelectContent>{ONE_TIME_CATS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Amount (₹) *</Label>
            <Input type="number" className="mt-1" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="5000" data-testid="onetime-amount"/>
          </div>
          <div><Label>Description</Label>
            <Input className="mt-1" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="A4 paper bulk order"/>
          </div>
          {check && (
            <div className={`rounded-md p-3 border text-xs ${check.block ? "bg-red-50 border-red-200 text-red-800" : check.warn ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`} data-testid="onetime-budget-check">
              <div className="font-medium mb-0.5">
                {check.block ? <XCircle size={12} className="inline mr-1"/> : check.warn ? <Warning size={12} className="inline mr-1"/> : <CheckCircle size={12} className="inline mr-1"/>}
                Budget pre-flight
              </div>
              <div>{check.message}</div>
              {check.matched && (
                <div className="mt-1 opacity-75">
                  Envelope: {check.envelope_name} · {check.utilized_after}/{check.envelope_total} ({check.pct_after}%)
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="onetime-submit-btn">
            {busy ? "Submitting…" : "Submit for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Bulk doc upload (drag-drop multi-file) ──────────────────────────────────
function inferDocType(filename) {
  const f = filename.toLowerCase();
  if (/electric|bescom|tata.power|powerbill|kseb|water|bwssb|gas|mahanagar|airtel|jio/.test(f)) return "utility_bill";
  if (/lease|rent|agreement|landlord/.test(f)) return "rent_agreement";
  if (/property.tax|bbmp|mcd|municip/.test(f)) return "property_tax";
  if (/fire|noc/.test(f)) return "fire_safety";
  if (/insurance|policy/.test(f)) return "insurance";
  if (/license|trade|shop/.test(f)) return "business_license";
  if (/amc|maintenance|contract/.test(f)) return "amc_contract";
  return "other";
}

function BulkUploader({ branchId, onDone }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const onDrop = async (evt) => {
    evt.preventDefault();
    const list = Array.from(evt.dataTransfer.files);
    await readFiles(list);
  };
  const onPick = async (evt) => {
    const list = Array.from(evt.target.files);
    await readFiles(list);
  };

  const readFiles = async (list) => {
    const accepted = list.filter(f => f.size <= 5 * 1024 * 1024);
    if (list.length !== accepted.length) toast.warning(`${list.length - accepted.length} file(s) > 5MB skipped`);
    const ready = await Promise.all(accepted.map(async f => {
      const buf = await f.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return {
        id: Math.random().toString(36).slice(2),
        file_name: f.name, content_type: f.type, base64_data: b64,
        title: f.name.replace(/\.[^.]+$/, ""),
        doc_type: inferDocType(f.name),
        status: "ready",
      };
    }));
    setFiles(prev => [...prev, ...ready]);
  };

  const remove = (id) => setFiles(prev => prev.filter(f => f.id !== id));

  const uploadAll = async () => {
    setBusy(true);
    let ok = 0, fail = 0;
    for (const f of files) {
      try {
        await api.post(`/branches/${branchId}/documents`, {
          doc_type: f.doc_type,
          title: f.title,
          file_name: f.file_name,
          content_type: f.content_type,
          base64_data: f.base64_data,
        });
        ok++;
      } catch (e) {
        fail++;
      }
    }
    toast.success(`Uploaded ${ok} document${ok !== 1 ? "s" : ""}${fail ? ` · ${fail} failed` : ""}`);
    setFiles([]); setOpen(false); setBusy(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setFiles([]); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" data-testid="docs-bulk-btn">
          <UploadSimple size={14}/> Bulk upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk upload — drag &amp; drop</DialogTitle></DialogHeader>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
          className="border-2 border-dashed border-zinc-300 rounded-lg p-8 text-center hover:border-zinc-500 transition cursor-pointer"
          onClick={() => document.getElementById("bulk-file-input")?.click()}
          data-testid="bulk-dropzone"
        >
          <UploadSimple size={32} className="mx-auto text-zinc-400 mb-2"/>
          <div className="text-sm font-medium text-zinc-700">Drop PDFs / images here</div>
          <div className="text-xs text-zinc-500 mt-1">or click to browse · max 5MB each · type auto-inferred from filename</div>
          <input id="bulk-file-input" type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={onPick}/>
        </div>
        {files.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto" data-testid="bulk-file-list">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-2 border border-zinc-200 rounded-md p-2 text-sm">
                <FilePdf size={14} className="text-zinc-500 flex-none"/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{f.file_name}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{DOC_TYPES.find(t => t.v === f.doc_type)?.label || f.doc_type}</Badge>
                    auto-detected
                  </div>
                </div>
                <Select value={f.doc_type} onValueChange={v => setFiles(prev => prev.map(x => x.id === f.id ? {...x, doc_type: v} : x))}>
                  <SelectTrigger className="w-32 h-7 text-xs"><SelectValue/></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => remove(f.id)}>
                  <Trash size={12}/>
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setFiles([]); setOpen(false); }}>Cancel</Button>
          <Button onClick={uploadAll} disabled={busy || files.length === 0} data-testid="bulk-upload-btn">
            {busy ? "Uploading…" : `Upload ${files.length} doc${files.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

