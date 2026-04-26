import { useEffect, useRef, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../context/AuthContext";
import { TreeStructure, MapPin, Stack, Briefcase, MagnifyingGlass, ArrowsClockwise, CaretDown, CaretRight, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

const TEMPLATES = [
  { k: "reporting",  l: "Reporting line",   icon: TreeStructure, hint: "Manager to direct reports" },
  { k: "functional", l: "Functional",       icon: Stack,         hint: "Grouped by department" },
  { k: "location",   l: "Location",         icon: MapPin,        hint: "Grouped by office" },
  { k: "project",    l: "Project",          icon: Briefcase,     hint: "Grouped by project" },
];

// Flatten a tree into [{node, depth, parentMatchesSearch}] for non-recursive rendering
function flattenTree(roots, search) {
  const out = [];
  const stack = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ node: roots[i], depth: 0 });
  }
  while (stack.length) {
    const { node, depth } = stack.pop();
    out.push({ node, depth });
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], depth: depth + 1 });
    }
  }
  if (!search) return out.map(x => ({ ...x, matches: true }));
  // Mark matches; show every node whose subtree or ancestry contains a match
  const idMatches = new Map();
  for (const { node } of out) {
    const m = (node.name || "").toLowerCase().includes(search) ||
              (node.employee_code || "").toLowerCase().includes(search) ||
              (node.job_title || "").toLowerCase().includes(search);
    idMatches.set(node.id, m);
  }
  // Compute ancestor-of-match: walk through parent chain via depth
  const visible = new Set();
  // Mark the node + all its ancestors
  const flatNodes = [];
  const path = [];
  for (const item of out) {
    while (path.length > item.depth) path.pop();
    path.push(item.node.id);
    if (idMatches.get(item.node.id)) {
      for (const id of path) visible.add(id);
    }
    flatNodes.push(item);
  }
  // Also mark descendants of any matched node
  let inMatchedSubtree = -1;
  for (const item of flatNodes) {
    if (inMatchedSubtree >= 0 && item.depth <= inMatchedSubtree) inMatchedSubtree = -1;
    if (idMatches.get(item.node.id)) {
      visible.add(item.node.id);
      inMatchedSubtree = item.depth;
    } else if (inMatchedSubtree >= 0) {
      visible.add(item.node.id);
    }
  }
  return flatNodes.map(x => ({ ...x, matches: idMatches.get(x.node.id), visible: visible.has(x.node.id) }));
}

export default function OrgChart() {
  const { user } = useAuth();
  const isHR = ["super_admin", "company_admin", "country_head", "region_head", "branch_manager"].includes(user?.role);
  const [template, setTemplate] = useState("reporting");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [editEmp, setEditEmp] = useState(null);
  const [profileEmp, setProfileEmp] = useState(null);
  const [allEmps, setAllEmps] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [collapsed, setCollapsed] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [c, e, d, b, p] = await Promise.all([
        api.get("/org/chart?template=" + template),
        api.get("/employees"),
        api.get("/org/departments"),
        api.get("/org/branches"),
        api.get("/org/projects"),
      ]);
      setData(c.data); setAllEmps(e.data); setDepartments(d.data); setBranches(b.data); setProjects(p.data);
    } catch (err) { toast.error(formatApiError(err && err.response && err.response.data && err.response.data.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line */ }, [template]);

  const search = q.trim().toLowerCase();
  const dragData = useRef({ id: null });

  const handleDragStart = (id) => (ev) => { dragData.current.id = id; ev.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; };
  const handleDrop = (targetMgrId) => async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const id = dragData.current.id;
    if (!id || id === targetMgrId) return;
    try {
      await api.patch("/employees/" + id, { manager_id: targetMgrId });
      toast.success("Reporting line updated");
      load();
    } catch (err) { toast.error(formatApiError(err && err.response && err.response.data && err.response.data.detail) || "Move failed"); }
  };
  const handleDropRoot = async (ev) => {
    ev.preventDefault();
    const id = dragData.current.id;
    if (!id) return;
    try {
      await api.patch("/employees/" + id, { manager_id: null });
      toast.success("Marked as a root (no manager)");
      load();
    } catch (err) { toast.error(formatApiError(err && err.response && err.response.data && err.response.data.detail)); }
  };

  const renderRoots = (roots) => {
    const flat = flattenTree(roots || [], search);
    return flat.map((item) => {
      if (search && !item.visible) return null;
      const collapsedHere = collapsed[item.node.id];
      // If parent is collapsed, hide children — find nearest ancestor in collapsed map
      // (skipped for simplicity: rely on user toggling each level)
      return renderNode(item.node, item.depth, item.matches, collapsedHere);
    });
  };

  const renderNode = (node, depth, matches, isCollapsed) => {
    const hasChildren = (node.children || []).length > 0;
    return (
      <div key={node.id} style={{ marginLeft: depth * 24 }} className="my-1">
        <div
          draggable={isHR}
          onDragStart={isHR ? handleDragStart(node.id) : undefined}
          onDragOver={isHR ? handleDragOver : undefined}
          onDrop={isHR ? handleDrop(node.id) : undefined}
          className={"flex items-center gap-2 py-2 pl-2 pr-3 rounded-md border transition-all " +
            (matches ? "border-zinc-200 bg-white" : "border-zinc-100 bg-zinc-50 opacity-70") +
            " hover:border-zinc-400 hover:shadow-sm " +
            (isHR ? "cursor-move" : "cursor-pointer")}
          data-testid={"org-node-" + (node.employee_code || node.id)}
        >
          <button className="w-4 text-zinc-400 flex-none" onClick={() => setCollapsed(c => ({ ...c, [node.id]: !c[node.id] }))}>
            {hasChildren ? (isCollapsed ? <CaretRight size={12} weight="bold"/> : <CaretDown size={12} weight="bold"/>) : null}
          </button>
          <Avatar emp={node}/>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setProfileEmp(node)}>
            <div className="flex items-center gap-2">
              <span className={"text-sm font-medium " + (matches && search ? "bg-amber-100 text-amber-900 px-1 rounded" : "")}>{node.name}</span>
              {node.employee_code ? <Badge variant="outline" className="text-[10px] font-mono-alt">{node.employee_code}</Badge> : null}
              {node.employee_type ? <Badge variant="outline" className="text-[10px] uppercase">{node.employee_type}</Badge> : null}
            </div>
            <div className="text-xs text-zinc-500 truncate">{node.job_title}{node.department_name ? " · " + node.department_name : ""}{node.branch_name ? " · " + node.branch_name : ""}</div>
          </div>
          {hasChildren ? <span className="text-[11px] text-zinc-400 flex-none">{node.children.length} report{node.children.length === 1 ? "" : "s"}</span> : null}
          {isHR ? (
            <button className="text-zinc-400 hover:text-zinc-900 flex-none p-1" onClick={(e) => { e.stopPropagation(); setEditEmp(node); }}>
              <PencilSimple size={13}/>
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <AppShell title="Organization chart">
      <div className="flex items-start gap-3 flex-wrap mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1 min-w-[300px]">
          {TEMPLATES.map((t) => {
            const Icon = t.icon;
            const isActive = template === t.k;
            return (
              <button key={t.k} onClick={() => setTemplate(t.k)} data-testid={"org-tpl-" + t.k}
                className={"text-left p-3 rounded-lg border transition-all " +
                  (isActive ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 hover:border-zinc-400")}>
                <Icon size={18} weight="bold" className={isActive ? "text-white" : "text-zinc-600"}/>
                <div className="font-semibold text-sm mt-1.5">{t.l}</div>
                <div className={"text-[11px] mt-0.5 " + (isActive ? "text-zinc-300" : "text-zinc-500")}>{t.hint}</div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 min-w-[260px]">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/>
            <Input placeholder="Search by name, code, title..." className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} data-testid="org-search"/>
          </div>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5" data-testid="org-refresh">
            <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""}/> Refresh
          </Button>
        </div>
      </div>

      {isHR ? (
        <p className="text-xs text-zinc-500 mb-4">
          <b>Tip:</b> drag any employee card onto another to reassign their reporting manager. Drop on the empty area below to make them a root.
        </p>
      ) : null}

      {loading && !data ? <div className="py-12 text-center text-sm text-zinc-500">Loading chart...</div> : null}

      {data && template === "reporting" && Array.isArray(data.roots) ? (
        <SectionCard testid="section-org-reporting"
          title={"Reporting line · " + data.stats.employees + " employees"}
          subtitle={data.roots.length + " root node(s) (no manager)"}>
          <div className="overflow-x-auto pb-4" onDragOver={handleDragOver} onDrop={handleDropRoot}>
            <div>{renderRoots(data.roots)}</div>
            {data.roots.length === 0 ? <p className="text-sm text-zinc-500 py-6 text-center">No employees yet.</p> : null}
          </div>
        </SectionCard>
      ) : null}

      {data && template !== "reporting" && Array.isArray(data.groups) ? (
        <div className="space-y-4">
          {data.groups.map((g) => (
            <SectionCard key={g.group_id} testid={"section-org-" + g.group_kind + "-" + g.group_id}
              title={
                <span className="flex items-center gap-2">
                  {g.group_name}
                  <Badge variant="outline" className="text-[10px]">{g.count}</Badge>
                  {g.is_head_office ? <Badge variant="outline" className="text-[10px] bg-amber-50 border-amber-200 text-amber-700">HQ</Badge> : null}
                  {g.state_code ? <Badge variant="outline" className="text-[10px] font-mono-alt">{g.state_code}</Badge> : null}
                  {g.code ? <Badge variant="outline" className="text-[10px] font-mono-alt">{g.code}</Badge> : null}
                </span>
              }>
              <div className="overflow-x-auto pb-2">{renderRoots(g.roots)}</div>
            </SectionCard>
          ))}
          {data.groups.length === 0 ? <p className="text-sm text-zinc-500 py-12 text-center">No groups in this template.</p> : null}
        </div>
      ) : null}

      <Dialog open={!!profileEmp} onOpenChange={(v) => { if (!v) setProfileEmp(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{profileEmp && profileEmp.name}</DialogTitle></DialogHeader>
          {profileEmp ? (
            <div className="space-y-2 py-2">
              <Detail k="Code" v={profileEmp.employee_code}/>
              <Detail k="Title" v={profileEmp.job_title}/>
              <Detail k="Department" v={profileEmp.department_name || "-"}/>
              <Detail k="Branch" v={profileEmp.branch_name || "-"}/>
              <Detail k="Type" v={profileEmp.employee_type}/>
              {profileEmp.email ? <Detail k="Email" v={profileEmp.email}/> : null}
            </div>
          ) : null}
          <DialogFooter>
            {isHR && profileEmp ? <Button onClick={() => { setEditEmp(profileEmp); setProfileEmp(null); }} className="gap-1.5"><PencilSimple size={14}/> Edit profile</Button> : null}
            <Button variant="ghost" onClick={() => setProfileEmp(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editEmp ? (
        <EditEmployeeDialog
          emp={editEmp} allEmps={allEmps} departments={departments} branches={branches} projects={projects}
          onClose={() => setEditEmp(null)} onSaved={() => { setEditEmp(null); load(); }}/>
      ) : null}
    </AppShell>
  );
}

function Detail({ k, v }) {
  return (
    <div className="flex justify-between text-sm border-b border-zinc-100 py-1.5">
      <span className="text-zinc-500">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function Avatar({ emp }) {
  const initials = (emp.name || "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700"];
  const idx = (emp.name || "").length % colors.length;
  if (emp.avatar_url) {
    return <img src={emp.avatar_url} alt={emp.name} className="w-7 h-7 rounded-full flex-none object-cover"/>;
  }
  return <div className={"w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-none " + colors[idx]}>{initials}</div>;
}

function EditEmployeeDialog({ emp, allEmps, departments, branches, projects, onClose, onSaved }) {
  const [f, setF] = useState({
    manager_id: emp.manager_id || "",
    department_id: emp.department_id || "",
    branch_id: emp.branch_id || "",
    job_title: emp.job_title || "",
    project_ids: emp.project_ids || [],
  });
  const candidates = (allEmps || []).filter((x) => x.id !== emp.id);

  const toggleProject = (pid) => setF((s) => ({
    ...s, project_ids: s.project_ids.includes(pid) ? s.project_ids.filter((x) => x !== pid) : [...s.project_ids, pid],
  }));

  const save = async () => {
    try {
      const payload = {
        manager_id: f.manager_id || null,
        department_id: f.department_id || null,
        branch_id: f.branch_id || null,
        job_title: f.job_title,
        project_ids: f.project_ids,
      };
      await api.patch("/employees/" + emp.id, payload);
      toast.success("Saved");
      onSaved();
    } catch (err) { toast.error(formatApiError(err && err.response && err.response.data && err.response.data.detail)); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit · {emp.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs uppercase text-zinc-500 tracking-wide">Reporting manager</label>
            <Select value={f.manager_id || "_none"} onValueChange={(v) => setF({ ...f, manager_id: v === "_none" ? "" : v })}>
              <SelectTrigger className="mt-1" data-testid="edit-manager"><SelectValue placeholder="No manager"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No manager</SelectItem>
                {candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.employee_code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase text-zinc-500 tracking-wide">Department</label>
              <Select value={f.department_id || "_none"} onValueChange={(v) => setF({ ...f, department_id: v === "_none" ? "" : v })}>
                <SelectTrigger className="mt-1" data-testid="edit-dept"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">-</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-zinc-500 tracking-wide">Branch</label>
              <Select value={f.branch_id || "_none"} onValueChange={(v) => setF({ ...f, branch_id: v === "_none" ? "" : v })}>
                <SelectTrigger className="mt-1" data-testid="edit-branch"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">-</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} · {b.city}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-zinc-500 tracking-wide">Job title</label>
            <Input className="mt-1" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })}/>
          </div>
          {projects.length > 0 ? (
            <div>
              <label className="text-xs uppercase text-zinc-500 tracking-wide">Projects</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {projects.map((p) => {
                  const on = f.project_ids.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggleProject(p.id)}
                      className={"text-[11px] px-2.5 py-1 rounded-full border " + (on ? "bg-violet-100 border-violet-300 text-violet-700" : "bg-white border-zinc-200 hover:border-zinc-400")}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="edit-emp-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
