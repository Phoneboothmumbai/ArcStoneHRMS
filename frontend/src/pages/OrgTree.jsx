import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { CaretDown, CaretRight, Buildings, MapPin, UsersThree, Stack } from "@phosphor-icons/react";

export default function OrgTree() {
  const [data, setData] = useState(null);
  useEffect(() => { (async () => { const { data } = await api.get("/org/tree"); setData(data); })(); }, []);

  if (!data) return <AppShell title="Organization hierarchy"><div className="text-zinc-500 text-sm">Loading tree…</div></AppShell>;

  return (
    <AppShell title="Organization hierarchy">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="org-stats">
        {["regions", "countries", "branches", "departments", "employees"].map((k) => (
          <div key={k} className="bg-white border border-zinc-200 rounded-lg p-5">
            <div className="tiny-label">{k}</div>
            <div className="font-display font-bold text-3xl mt-2">{data.stats[k]}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Hierarchy map" subtitle="Regions → Countries → Branches → Departments" testid="section-tree">
        <div className="space-y-2">
          {data.regions.map((r) => (
            <TreeNode key={r.id} level={0} label={r.name} icon={<Stack size={16} />} meta={`${r.countries.length} countries`}>
              {r.countries.map((c) => (
                <TreeNode key={c.id} level={1} label={c.name} icon={<MapPin size={14} />} meta={`${c.iso_code} · ${c.branches.length} branches`}>
                  {c.branches.map((b) => (
                    <TreeNode key={b.id} level={2} label={b.name} icon={<Buildings size={14} />} meta={`${b.city} · ${b.employees.length} people`}>
                      {b.departments.map((d) => (
                        <TreeNode key={d.id} level={3} label={d.name} icon={<UsersThree size={14} />} meta="Department" leaf />
                      ))}
                    </TreeNode>
                  ))}
                </TreeNode>
              ))}
            </TreeNode>
          ))}
          {!data.regions.length && <div className="text-sm text-zinc-500">No regions defined yet.</div>}
        </div>
      </SectionCard>
    </AppShell>
  );
}

function TreeNode({ level, label, icon, meta, children, leaf }) {
  const [open, setOpen] = useState(true);
  const hasChildren = !leaf && children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <div style={{ marginLeft: level * 20 }} data-testid={`tree-node-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div
        className="flex items-center gap-2 py-2 pl-2 pr-4 rounded-md hover:bg-zinc-50 cursor-pointer border-l border-zinc-200"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="w-4 text-zinc-400">{hasChildren ? (open ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />) : null}</div>
        <div className="text-zinc-500">{icon}</div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-zinc-500 ml-auto">{meta}</div>
      </div>
      {open && hasChildren && <div className="ml-2 border-l border-zinc-100 pl-2 py-1">{children}</div>}
    </div>
  );
}
