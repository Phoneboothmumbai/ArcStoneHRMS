import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { MagnifyingGlass, GridFour, ListBullets, EnvelopeSimple, Phone, Buildings, Stack, UserCircle, Printer, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";

const HR_ROLES = new Set(["super_admin", "company_admin", "country_head", "region_head", "branch_manager"]);

const EMP_CLASS_LABELS = {
  on_roll:              { label: "On-Roll",    cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  off_roll_consultant:  { label: "Consultant", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  off_roll_contractor:  { label: "Contractor", cls: "bg-sky-50 border-sky-200 text-sky-700" },
  intern:               { label: "Intern",     cls: "bg-violet-50 border-violet-200 text-violet-700" },
};

export default function Employees() {
  const { user } = useAuth();
  const canAddEmployee = HR_ROLES.has(user?.role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [deptId, setDeptId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [employmentClass, setEmploymentClass] = useState(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get("employment_class") || "all";
    } catch { return "all"; }
  });
  const [view, setView] = useState("table"); // table | cards
  const [departments, setDepartments] = useState([]);
  const [branches, setBranches] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (type !== "all") params.employee_type = type;
      if (deptId !== "all") params.department_id = deptId;
      if (branchId !== "all") params.branch_id = branchId;
      if (employmentClass !== "all") params.employment_class = employmentClass;
      const [emps, ds, bs] = await Promise.all([
        api.get("/employees", { params }),
        api.get("/org/departments"),
        api.get("/org/branches"),
      ]);
      setRows(emps.data); setDepartments(ds.data); setBranches(bs.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, type, deptId, branchId, employmentClass]);

  const stats = useMemo(() => {
    const m = { wfo: 0, wfh: 0, field: 0, hybrid: 0 };
    rows.forEach(r => { if (m[r.employee_type] != null) m[r.employee_type]++; });
    return m;
  }, [rows]);

  return (
    <AppShell title="Employee Directory">
      <SectionCard title={`${rows.length} people`}
        subtitle={loading ? "Loading…" : `WFO ${stats.wfo} · WFH ${stats.wfh} · Field ${stats.field} · Hybrid ${stats.hybrid}`}
        testid="section-directory"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/>
              <Input placeholder="Search name, email, code, title…" className="pl-8 w-72 h-9" value={q} onChange={e => setQ(e.target.value)} data-testid="dir-search"/>
            </div>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger className="w-44 h-9" data-testid="dir-dept"><SelectValue placeholder="Department"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-44 h-9" data-testid="dir-branch"><SelectValue placeholder="Branch"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_head_office ? " · HQ" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-36 h-9" data-testid="dir-type-select"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="wfo">WFO</SelectItem>
                <SelectItem value="wfh">WFH</SelectItem>
                <SelectItem value="field">Field</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={employmentClass} onValueChange={setEmploymentClass}>
              <SelectTrigger className="w-40 h-9" data-testid="dir-employment-class-select">
                <SelectValue placeholder="Employment"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                <SelectItem value="on_roll">On-Roll</SelectItem>
                <SelectItem value="off_roll_consultant">Consultant</SelectItem>
                <SelectItem value="off_roll_contractor">Contractor</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
            <div className="border border-zinc-200 rounded-md flex">
              <button className={`px-2.5 py-1.5 ${view === "table" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900"}`} onClick={() => setView("table")} data-testid="dir-view-table"><ListBullets size={14}/></button>
              <button className={`px-2.5 py-1.5 ${view === "cards" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900"}`} onClick={() => setView("cards")} data-testid="dir-view-cards"><GridFour size={14}/></button>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 h-9" data-testid="dir-print-pdf"
              onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (q) params.set("q", q);
                  if (deptId !== "all") params.set("department_id", deptId);
                  if (branchId !== "all") params.set("branch_id", branchId);
                  if (type !== "all") params.set("employee_type", type);
                  const res = await api.get("/employees/directory-pdf?" + params.toString(), { responseType: "blob" });
                  const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
                  const a = document.createElement("a");
                  a.href = url; a.download = "employee_directory.pdf";
                  document.body.appendChild(a); a.click(); a.remove();
                  toast.success("Directory PDF generated");
                } catch (err) { toast.error("Print failed"); }
              }}>
              <Printer size={14}/> Print PDF
            </Button>
            {canAddEmployee && (
              <Button size="sm" className="gap-1.5 h-9 bg-zinc-950 hover:bg-zinc-800" onClick={() => setShowAdd(true)} data-testid="dir-add-employee-btn">
                <Plus size={14} weight="bold"/> Add employee
              </Button>
            )}
          </div>
        }
      >
        {view === "table" ? <TableView rows={rows}/> : <CardsView rows={rows}/>}
      </SectionCard>
      {showAdd && <AddEmployeeModal departments={departments} branches={branches} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }}/>}
    </AppShell>
  );
}

function AddEmployeeModal({ departments, branches, onClose, onCreated }) {
  const [f, setF] = useState({
    name: "", email: "", phone: "", job_title: "",
    employee_type: "wfo", employment_class: "on_roll",
    department_id: "", branch_id: "",
    role_in_company: "employee",
    create_login: true, password: "Welcome@123",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || !f.email.trim() || !f.job_title.trim()) {
      return toast.error("Name, email and job title are required");
    }
    setBusy(true);
    try {
      const payload = { ...f };
      if (!payload.department_id) delete payload.department_id;
      if (!payload.branch_id) delete payload.branch_id;
      if (!payload.create_login) delete payload.password;
      await api.post("/employees", payload);
      toast.success(`${f.name} added.${f.create_login ? " Login created." : ""}`);
      onCreated?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Failed to add employee");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl" data-testid="dir-add-modal">
        <DialogHeader><DialogTitle>Add a new employee</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <Field label="Full name *"><Input value={f.name} onChange={e => set("name", e.target.value)} placeholder="Riya Sharma" data-testid="dir-add-name"/></Field>
          <Field label="Work email *"><Input type="email" value={f.email} onChange={e => set("email", e.target.value)} placeholder="riya@acme.io" data-testid="dir-add-email"/></Field>
          <Field label="Phone"><Input value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="+91…" data-testid="dir-add-phone"/></Field>
          <Field label="Job title *"><Input value={f.job_title} onChange={e => set("job_title", e.target.value)} placeholder="Senior Engineer" data-testid="dir-add-title"/></Field>
          <Field label="Department">
            <Select value={f.department_id || "_none"} onValueChange={v => set("department_id", v === "_none" ? "" : v)}>
              <SelectTrigger data-testid="dir-add-dept"><SelectValue placeholder="Select"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Branch / Location">
            <Select value={f.branch_id || "_none"} onValueChange={v => set("branch_id", v === "_none" ? "" : v)}>
              <SelectTrigger data-testid="dir-add-branch"><SelectValue placeholder="Select"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{b.is_head_office ? " · HQ" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Work mode">
            <Select value={f.employee_type} onValueChange={v => set("employee_type", v)}>
              <SelectTrigger data-testid="dir-add-mode"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="wfo">WFO</SelectItem>
                <SelectItem value="wfh">WFH</SelectItem>
                <SelectItem value="field">Field</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Employment class">
            <Select value={f.employment_class} onValueChange={v => set("employment_class", v)}>
              <SelectTrigger data-testid="dir-add-class"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="on_roll">On-Roll</SelectItem>
                <SelectItem value="off_roll_consultant">Consultant</SelectItem>
                <SelectItem value="off_roll_contractor">Contractor</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Role in company">
            <Select value={f.role_in_company} onValueChange={v => set("role_in_company", v)}>
              <SelectTrigger data-testid="dir-add-role"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="branch_manager">Branch manager</SelectItem>
                <SelectItem value="sub_manager">Sub manager</SelectItem>
                <SelectItem value="assistant_manager">Assistant manager</SelectItem>
                <SelectItem value="region_head">Region head</SelectItem>
                <SelectItem value="country_head">Country head</SelectItem>
                <SelectItem value="company_admin">Company admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Temporary password">
            <Input type="text" value={f.password} onChange={e => set("password", e.target.value)} disabled={!f.create_login} data-testid="dir-add-pwd"/>
            <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <input type="checkbox" checked={f.create_login} onChange={e => set("create_login", e.target.checked)} data-testid="dir-add-create-login"/>
              Auto-create login for this employee
            </label>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="bg-zinc-950 hover:bg-zinc-800" onClick={submit} disabled={busy} data-testid="dir-add-submit">{busy ? "Adding…" : "Add employee"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="tiny-label mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function TableView({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-zinc-200">
        <tr className="text-left text-xs uppercase text-zinc-500">
          <th className="py-2 px-2">Employee</th><th>Job</th><th>Department</th><th>Branch</th>
          <th>Mode</th><th>Class</th><th>Manager</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-zinc-500">No employees match.</td></tr>}
        {rows.map(e => {
          const ec = EMP_CLASS_LABELS[e.employment_class] || EMP_CLASS_LABELS.on_roll;
          return (
          <tr key={e.id} className="border-b border-zinc-100 hover:bg-zinc-50" data-testid={`emp-row-${e.id}`}>
            <td className="py-2 px-2">
              <Link to={`/app/employees/${e.id}`} className="flex items-center gap-2.5 group" data-testid={`emp-profile-link-${e.id}`}>
                <Avatar emp={e}/>
                <div>
                  <div className="font-medium group-hover:underline">{e.name}</div>
                  <div className="text-xs text-zinc-500">{e.employee_code} · {e.email}</div>
                </div>
              </Link>
            </td>
            <td className="text-zinc-700">{e.job_title}</td>
            <td className="text-zinc-700 text-xs">{e.department_name || "—"}</td>
            <td className="text-zinc-700 text-xs">{e.branch_name || "—"}</td>
            <td><Badge variant="outline" className="uppercase text-[10px]">{e.employee_type}</Badge></td>
            <td><Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${ec.cls}`} data-testid={`emp-class-${e.id}`}>{ec.label}</Badge></td>
            <td className="text-xs text-zinc-500">{e.manager_id ? <ManagerCell id={e.manager_id}/> : "—"}</td>
            <td>
              <span className="text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full capitalize">{e.status}</span>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ManagerCell({ id }) {
  // Lightweight: use cache to avoid N requests in render
  const cache = ManagerCell.cache || (ManagerCell.cache = new Map());
  const [name, setName] = useState(cache.get(id));
  useEffect(() => {
    if (cache.has(id)) return;
    api.get(`/employees/${id}`).then(r => { cache.set(id, r.data.name); setName(r.data.name); }).catch(()=>{ cache.set(id, "—"); setName("—"); });
    // eslint-disable-next-line
  }, [id]);
  return <span>{name || "…"}</span>;
}

function CardsView({ rows }) {
  if (rows.length === 0) return <p className="text-center py-12 text-zinc-500 text-sm">No employees match.</p>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {rows.map(e => {
        const ec = EMP_CLASS_LABELS[e.employment_class] || EMP_CLASS_LABELS.on_roll;
        return (
        <Link key={e.id} to={`/app/employees/${e.id}`} className="block border border-zinc-200 rounded-lg p-4 hover:border-zinc-400 hover:shadow-sm transition-all group" data-testid={`emp-card-${e.id}`}>
          <div className="flex items-center gap-3 mb-3">
            <Avatar emp={e} large/>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate group-hover:underline">{e.name}</div>
              <div className="text-xs text-zinc-500 truncate">{e.job_title}</div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs text-zinc-600">
            {e.email && <div className="flex items-center gap-1.5 truncate"><EnvelopeSimple size={12}/>{e.email}</div>}
            {e.phone && <div className="flex items-center gap-1.5"><Phone size={12}/>{e.phone}</div>}
            {e.department_name && <div className="flex items-center gap-1.5"><Stack size={12}/>{e.department_name}</div>}
            {e.branch_name && <div className="flex items-center gap-1.5"><Buildings size={12}/>{e.branch_name}</div>}
          </div>
          <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-zinc-100">
            <Badge variant="outline" className="text-[10px] uppercase">{e.employee_type}</Badge>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${ec.cls}`} data-testid={`emp-class-${e.id}`}>{ec.label}</Badge>
            <Badge variant="outline" className="text-[10px] font-mono-alt">{e.employee_code}</Badge>
          </div>
        </Link>
        );
      })}
    </div>
  );
}

function Avatar({ emp, large }) {
  const initials = (emp.name || "").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700"];
  const idx = (emp.name || "").length % colors.length;
  if (emp.avatar_url) return <img src={emp.avatar_url} alt={emp.name} className={`${large ? "w-12 h-12" : "w-8 h-8"} rounded-full object-cover flex-none`}/>;
  return <div className={`${large ? "w-12 h-12 text-sm" : "w-8 h-8 text-[10px]"} rounded-full flex items-center justify-center font-bold flex-none ${colors[idx]}`}>{initials}</div>;
}
