import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Plus, Trash, CaretUp, CaretDown, X, Pencil, FlowArrow, MagicWand } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const REQ_TYPES = [
  { value: "leave", label: "Leave" },
  { value: "product_service", label: "Product & Service" },
  { value: "expense", label: "Expense" },
];

const RESOLVER_OPTIONS = [
  { value: "manager", label: "Direct Manager", hint: "The requester's immediate manager" },
  { value: "department_head", label: "Department Head", hint: "Head of the requester's department" },
  { value: "branch_manager", label: "Branch Manager", hint: "Manager of the requester's branch" },
  { value: "company_admin", label: "HR / Company Admin", hint: "Any company-level admin" },
  { value: "role", label: "Anyone with role…", hint: "Any user with the chosen role" },
  { value: "user", label: "Specific user…", hint: "A named person" },
];

const ROLE_OPTIONS = [
  "branch_manager", "sub_manager", "assistant_manager",
  "country_head", "region_head", "company_admin",
];

const LEAVE_TYPES = ["casual", "sick", "earned", "unpaid", "other"];

const emptyForm = {
  name: "",
  request_type: "product_service",
  match_item_category: "",
  match_leave_type: "",
  match_min_cost: "",
  match_max_cost: "",
  match_min_days: "",
  match_max_days: "",
  match_branch_id: "",
  priority: 50,
  is_active: true,
  steps: [],
};

export default function Workflows() {
  const [all, setAll] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [active, setActive] = useState("product_service");
  const [editing, setEditing] = useState(null); // workflow being edited or "new"
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [wfs, br] = await Promise.all([
      api.get("/workflows"),
      api.get("/org/branches").catch(() => ({ data: [] })),
    ]);
    setAll(wfs.data);
    setBranches(br.data || []);
    // load potential "user"-resolver targets (employees with user accounts is a good proxy)
    const emp = await api.get("/employees").catch(() => ({ data: [] }));
    setUsers((emp.data || []).filter((e) => e.user_id).map((e) => ({ id: e.user_id, name: e.name })));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => all.filter((w) => w.request_type === active), [all, active]);

  const openNew = () => {
    setEditing("new");
    setForm({
      ...emptyForm,
      request_type: active,
      steps: [{ order: 1, resolver: "manager", label: "Direct Manager", role: null, user_id: null, condition_min_cost: null }],
    });
  };

  const openEdit = (wf) => {
    setEditing(wf.id);
    setForm({
      name: wf.name,
      request_type: wf.request_type,
      match_item_category: wf.match_item_category || "",
      match_leave_type: wf.match_leave_type || "",
      match_min_cost: wf.match_min_cost ?? "",
      match_max_cost: wf.match_max_cost ?? "",
      match_min_days: wf.match_min_days ?? "",
      match_max_days: wf.match_max_days ?? "",
      match_branch_id: wf.match_branch_id || "",
      priority: wf.priority ?? 50,
      is_active: wf.is_active !== false,
      steps: (wf.steps || []).map((s) => ({ ...s })),
    });
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.steps.length) return toast.error("Add at least one approval step");
    for (const [i, s] of form.steps.entries()) {
      if (s.resolver === "role" && !s.role) return toast.error(`Step ${i + 1}: pick a role`);
      if (s.resolver === "user" && !s.user_id) return toast.error(`Step ${i + 1}: pick a user`);
      if (!s.label?.trim()) return toast.error(`Step ${i + 1}: label is required`);
    }
    const payload = {
      name: form.name.trim(),
      request_type: form.request_type,
      match_item_category: form.match_item_category || null,
      match_leave_type: form.match_leave_type || null,
      match_min_cost: form.match_min_cost === "" ? null : Number(form.match_min_cost),
      match_max_cost: form.match_max_cost === "" ? null : Number(form.match_max_cost),
      match_min_days: form.match_min_days === "" ? null : Number(form.match_min_days),
      match_max_days: form.match_max_days === "" ? null : Number(form.match_max_days),
      match_branch_id: form.match_branch_id || null,
      priority: Number(form.priority) || 10,
      is_active: form.is_active,
      steps: form.steps.map((s, idx) => ({
        order: idx + 1,
        resolver: s.resolver,
        label: s.label,
        role: s.resolver === "role" ? s.role : null,
        user_id: s.resolver === "user" ? s.user_id : null,
        user_name: s.user_name || null,
        condition_min_cost: s.condition_min_cost === "" || s.condition_min_cost == null ? null : Number(s.condition_min_cost),
      })),
    };
    setBusy(true);
    try {
      if (editing === "new") await api.post("/workflows", payload);
      else await api.put(`/workflows/${editing}`, payload);
      toast.success("Workflow saved");
      setEditing(null); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const toggle = async (wf) => {
    try { await api.post(`/workflows/${wf.id}/toggle`); load(); toast.success(`${wf.is_active ? "Disabled" : "Enabled"}`); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const del = async (wf) => {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    try { await api.delete(`/workflows/${wf.id}`); load(); toast.success("Deleted"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  // step helpers
  const addStep = () => setForm({ ...form, steps: [...form.steps, { order: form.steps.length + 1, resolver: "manager", label: "Direct Manager", role: null, user_id: null, condition_min_cost: null }] });
  const removeStep = (i) => setForm({ ...form, steps: form.steps.filter((_, idx) => idx !== i) });
  const moveStep = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= form.steps.length) return;
    const next = [...form.steps];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, steps: next });
  };
  const updateStep = (i, patch) => {
    const next = [...form.steps];
    next[i] = { ...next[i], ...patch };
    // auto-fill label when resolver changes
    if (patch.resolver) {
      const r = RESOLVER_OPTIONS.find((o) => o.value === patch.resolver);
      if (r && (!next[i].label || RESOLVER_OPTIONS.some((o) => o.label === next[i].label))) {
        next[i].label = r.label;
      }
    }
    setForm({ ...form, steps: next });
  };

  return (
    <AppShell title="Approval workflows">
      <Toaster richColors />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6" data-testid="wf-summary">
        <SummaryCard n={filtered.length} label={`${REQ_TYPES.find(t => t.value === active).label} workflows`} />
        <SummaryCard n={filtered.filter(w => w.is_active).length} label="Active" tone="ok" />
        <SummaryCard n={filtered.filter(w => !w.is_active).length} label="Paused" tone="muted" />
        <div className="bg-zinc-950 text-white rounded-lg p-6 flex items-center justify-between" data-testid="wf-hint-card">
          <div>
            <div className="tiny-label text-zinc-400">Tip</div>
            <div className="text-sm mt-2 text-zinc-200 leading-relaxed">Higher-specificity rules win. E.g. <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">computer + cost&gt;$2k</code> beats <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">any product</code>.</div>
          </div>
          <MagicWand size={28} weight="duotone" className="text-zinc-400 shrink-0" />
        </div>
      </div>

      <SectionCard
        title="Configurable approval chains"
        subtitle="Per request type, per category, per cost range. Unmatched requests fall back to the manager walk-up."
        testid="section-workflows"
        action={
          <Button onClick={openNew} className="bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid="new-workflow-btn">
            <Plus size={16} className="mr-1.5" /> New workflow
          </Button>
        }
      >
        <Tabs value={active} onValueChange={setActive} className="w-full">
          <TabsList>
            {REQ_TYPES.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          {REQ_TYPES.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-5">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-zinc-500" data-testid="wf-empty">
                  No workflows for this type yet — requests will default to manager walk-up.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filtered.map((wf) => (
                    <WorkflowCard key={wf.id} wf={wf} branches={branches}
                      onEdit={() => openEdit(wf)} onToggle={() => toggle(wf)} onDelete={() => del(wf)} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </SectionCard>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="wf-editor">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New approval workflow" : "Edit workflow"}</DialogTitle>
          </DialogHeader>

          {/* Metadata */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input className="mt-2" placeholder="e.g. Computer purchase — 5 levels"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="wf-name" />
              </div>
              <div>
                <Label>Request type</Label>
                <Select value={form.request_type} onValueChange={(v) => setForm({ ...form, request_type: v })}>
                  <SelectTrigger className="mt-2" data-testid="wf-rtype"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQ_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Input type="number" className="mt-2" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })} data-testid="wf-priority" />
                <p className="text-xs text-zinc-500 mt-1">Higher wins on ties. Default 50.</p>
              </div>
            </div>

            {/* Match rules */}
            <div className="border-t border-zinc-200 pt-4">
              <div className="tiny-label mb-3">When this workflow should match</div>
              <div className="grid grid-cols-2 gap-4">
                {form.request_type === "product_service" && (
                  <div className="col-span-2">
                    <Label>Item category</Label>
                    <Input className="mt-2" placeholder="e.g. computer, stationery, furniture (leave blank = all)"
                      value={form.match_item_category}
                      onChange={(e) => setForm({ ...form, match_item_category: e.target.value.toLowerCase() })}
                      data-testid="wf-item-cat" />
                  </div>
                )}
                {form.request_type === "leave" && (
                  <div className="col-span-2">
                    <Label>Leave type</Label>
                    <Select value={form.match_leave_type || "__any__"}
                      onValueChange={(v) => setForm({ ...form, match_leave_type: v === "__any__" ? "" : v })}>
                      <SelectTrigger className="mt-2" data-testid="wf-leave-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any__">Any leave type</SelectItem>
                        {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.request_type !== "leave" && (
                  <>
                    <div>
                      <Label>Cost ≥</Label>
                      <Input type="number" className="mt-2" placeholder="min" value={form.match_min_cost}
                        onChange={(e) => setForm({ ...form, match_min_cost: e.target.value })} data-testid="wf-cost-min" />
                    </div>
                    <div>
                      <Label>Cost ≤</Label>
                      <Input type="number" className="mt-2" placeholder="max" value={form.match_max_cost}
                        onChange={(e) => setForm({ ...form, match_max_cost: e.target.value })} data-testid="wf-cost-max" />
                    </div>
                  </>
                )}

                {form.request_type === "leave" && (
                  <>
                    <div>
                      <Label>Days ≥</Label>
                      <Input type="number" className="mt-2" placeholder="min" value={form.match_min_days}
                        onChange={(e) => setForm({ ...form, match_min_days: e.target.value })} data-testid="wf-days-min" />
                    </div>
                    <div>
                      <Label>Days ≤</Label>
                      <Input type="number" className="mt-2" placeholder="max" value={form.match_max_days}
                        onChange={(e) => setForm({ ...form, match_max_days: e.target.value })} data-testid="wf-days-max" />
                    </div>
                  </>
                )}

                <div className="col-span-2">
                  <Label>Scope to branch (optional)</Label>
                  <Select value={form.match_branch_id || "__any__"}
                    onValueChange={(v) => setForm({ ...form, match_branch_id: v === "__any__" ? "" : v })}>
                    <SelectTrigger className="mt-2" data-testid="wf-branch"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">All branches</SelectItem>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} · {b.city}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Steps builder */}
            <div className="border-t border-zinc-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="tiny-label">Approval chain</div>
                  <p className="text-xs text-zinc-500 mt-1">Add as many steps as you need. Sequential execution from top to bottom.</p>
                </div>
                <Button size="sm" variant="outline" onClick={addStep} className="border-zinc-300" data-testid="wf-add-step">
                  <Plus size={14} className="mr-1.5" /> Add step
                </Button>
              </div>

              <div className="space-y-2">
                {form.steps.map((step, i) => (
                  <StepRow key={i} i={i} step={step} users={users}
                    onChange={(patch) => updateStep(i, patch)}
                    onRemove={() => removeStep(i)}
                    onMoveUp={() => moveStep(i, -1)}
                    onMoveDown={() => moveStep(i, 1)}
                    canMoveUp={i > 0} canMoveDown={i < form.steps.length - 1}
                    showCostCondition={form.request_type !== "leave"}
                  />
                ))}
                {!form.steps.length && <div className="text-sm text-zinc-500 py-4 text-center border border-dashed border-zinc-300 rounded-md">No steps yet. Click "Add step" to begin.</div>}
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-zinc-200 pt-4">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} data-testid="wf-active" />
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, is_active: !form.is_active })}>Active (applied to new requests)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" onClick={save} data-testid="wf-save">{busy ? "Saving…" : "Save workflow"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryCard({ n, label, tone }) {
  const toneClass = tone === "ok" ? "text-emerald-600" : tone === "muted" ? "text-zinc-400" : "text-zinc-950";
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6">
      <div className="tiny-label">{label}</div>
      <div className={`font-display font-bold text-4xl mt-3 tracking-tight ${toneClass}`}>{n}</div>
    </div>
  );
}

function WorkflowCard({ wf, branches, onEdit, onToggle, onDelete }) {
  const branchName = wf.match_branch_id ? (branches.find((b) => b.id === wf.match_branch_id)?.name || "Branch") : null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5 hover:border-zinc-400 transition-colors" data-testid={`wf-card-${wf.id}`}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <FlowArrow size={16} weight="bold" className="text-zinc-500" />
            <div className="font-display font-semibold text-base">{wf.name}</div>
            {!wf.is_active && <Badge variant="outline" className="uppercase text-[10px]">Paused</Badge>}
            <Badge variant="outline" className="uppercase text-[10px] tracking-wider">{wf.steps?.length || 0} steps</Badge>
            <Badge variant="outline" className="uppercase text-[10px] tracking-wider">Priority {wf.priority}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {wf.match_item_category && <Chip>Item = <b className="ml-1">{wf.match_item_category}</b></Chip>}
            {wf.match_leave_type && <Chip>Leave = <b className="ml-1">{wf.match_leave_type}</b></Chip>}
            {(wf.match_min_cost != null || wf.match_max_cost != null) && (
              <Chip>Cost {wf.match_min_cost != null ? `≥ $${wf.match_min_cost}` : ""}{wf.match_min_cost != null && wf.match_max_cost != null ? " · " : ""}{wf.match_max_cost != null ? `≤ $${wf.match_max_cost}` : ""}</Chip>
            )}
            {(wf.match_min_days != null || wf.match_max_days != null) && (
              <Chip>Days {wf.match_min_days != null ? `≥ ${wf.match_min_days}` : ""}{wf.match_min_days != null && wf.match_max_days != null ? " · " : ""}{wf.match_max_days != null ? `≤ ${wf.match_max_days}` : ""}</Chip>
            )}
            {branchName && <Chip>Branch = {branchName}</Chip>}
            {!wf.match_item_category && !wf.match_leave_type && wf.match_min_cost == null && wf.match_max_cost == null && wf.match_min_days == null && wf.match_max_days == null && !branchName && (
              <span className="text-xs text-zinc-500 italic">Catch-all — applies to any request of this type</span>
            )}
          </div>
          {/* chain preview */}
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            {(wf.steps || []).map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs bg-zinc-100 border border-zinc-200 px-2 py-1 rounded-md">
                  <span className="w-4 h-4 rounded-full bg-zinc-950 text-white flex items-center justify-center text-[10px]">{i + 1}</span>
                  {s.label}
                </span>
                {i < wf.steps.length - 1 && <span className="text-zinc-400 text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center gap-2 px-1">
            <Switch checked={wf.is_active} onCheckedChange={onToggle} data-testid={`wf-toggle-${wf.id}`} />
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} data-testid={`wf-edit-${wf.id}`}><Pencil size={14} className="mr-1" /> Edit</Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50" data-testid={`wf-delete-${wf.id}`}><Trash size={14} className="mr-1" /> Delete</Button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }) {
  return <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full inline-flex items-center">{children}</span>;
}

function StepRow({ i, step, users, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, showCostCondition }) {
  return (
    <div className="border border-zinc-200 rounded-md p-3 bg-zinc-50" data-testid={`wf-step-${i}`}>
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-zinc-950 text-white flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</div>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Resolver</Label>
            <Select value={step.resolver} onValueChange={(v) => onChange({ resolver: v })}>
              <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`step-resolver-${i}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOLVER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Display label</Label>
            <Input className="mt-1 h-9 text-sm" value={step.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="e.g. IT Head" data-testid={`step-label-${i}`} />
          </div>
          {step.resolver === "role" && (
            <div className="md:col-span-2">
              <Label className="text-xs">Role</Label>
              <Select value={step.role || ""} onValueChange={(v) => onChange({ role: v })}>
                <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`step-role-${i}`}><SelectValue placeholder="Pick a role" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {step.resolver === "user" && (
            <div className="md:col-span-2">
              <Label className="text-xs">User</Label>
              <Select value={step.user_id || ""} onValueChange={(v) => {
                const u = users.find((x) => x.id === v);
                onChange({ user_id: v, user_name: u?.name || null });
              }}>
                <SelectTrigger className="mt-1 h-9 text-sm" data-testid={`step-user-${i}`}><SelectValue placeholder="Pick a user" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {showCostCondition && (
            <div className="md:col-span-2">
              <Label className="text-xs">Only trigger if cost ≥ (optional)</Label>
              <Input type="number" className="mt-1 h-9 text-sm" placeholder="e.g. 5000"
                value={step.condition_min_cost ?? ""}
                onChange={(e) => onChange({ condition_min_cost: e.target.value === "" ? null : Number(e.target.value) })}
                data-testid={`step-cond-${i}`} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={onMoveUp} disabled={!canMoveUp} data-testid={`step-up-${i}`}><CaretUp size={14} /></Button>
          <Button size="icon" variant="ghost" onClick={onMoveDown} disabled={!canMoveDown} data-testid={`step-down-${i}`}><CaretDown size={14} /></Button>
          <Button size="icon" variant="ghost" onClick={onRemove} className="text-red-600 hover:bg-red-50" data-testid={`step-remove-${i}`}><X size={14} /></Button>
        </div>
      </div>
    </div>
  );
}
