import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { MagnifyingGlass, GridFour, ListBullets, EnvelopeSimple, Phone, Buildings, Stack, UserCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [deptId, setDeptId] = useState("all");
  const [branchId, setBranchId] = useState("all");
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
      const [emps, ds, bs] = await Promise.all([
        api.get("/employees", { params }),
        api.get("/org/departments"),
        api.get("/org/branches"),
      ]);
      setRows(emps.data); setDepartments(ds.data); setBranches(bs.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, type, deptId, branchId]);

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
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="wfo">WFO</SelectItem>
                <SelectItem value="wfh">WFH</SelectItem>
                <SelectItem value="field">Field</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
            <div className="border border-zinc-200 rounded-md flex">
              <button className={`px-2.5 py-1.5 ${view === "table" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900"}`} onClick={() => setView("table")} data-testid="dir-view-table"><ListBullets size={14}/></button>
              <button className={`px-2.5 py-1.5 ${view === "cards" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-900"}`} onClick={() => setView("cards")} data-testid="dir-view-cards"><GridFour size={14}/></button>
            </div>
          </div>
        }
      >
        {view === "table" ? <TableView rows={rows}/> : <CardsView rows={rows}/>}
      </SectionCard>
    </AppShell>
  );
}

function TableView({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-zinc-200">
        <tr className="text-left text-xs uppercase text-zinc-500">
          <th className="py-2 px-2">Employee</th><th>Job</th><th>Department</th><th>Branch</th>
          <th>Type</th><th>Manager</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-zinc-500">No employees match.</td></tr>}
        {rows.map(e => (
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
            <td className="text-xs text-zinc-500">{e.manager_id ? <ManagerCell id={e.manager_id}/> : "—"}</td>
            <td>
              <span className="text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full capitalize">{e.status}</span>
            </td>
          </tr>
        ))}
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
      {rows.map(e => (
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
            <Badge variant="outline" className="text-[10px] font-mono-alt">{e.employee_code}</Badge>
          </div>
        </Link>
      ))}
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
