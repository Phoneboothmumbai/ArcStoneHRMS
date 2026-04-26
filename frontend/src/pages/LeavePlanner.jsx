import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { api } from "../lib/api";
import { Calendar, CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * Visual leave planner — month grid showing every team member's approved /
 * pending leaves at a glance. Reads `/api/leave/team-calendar` (already exists).
 */
export default function LeavePlanner() {
  const [items, setItems] = useState([]);
  const [anchor, setAnchor] = useState(() => new Date());

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const monthLabel = monthStart.toLocaleString("default", { month: "long", year: "numeric" });

  useEffect(() => {
    api.get("/leave/team-calendar").then(r => setItems(r.data || [])).catch(() => setItems([]));
  }, []);

  // Group leaves by employee, then index days they're on leave
  const grid = useMemo(() => {
    const days = [];
    for (let d = 1; d <= monthEnd.getDate(); d++) days.push(d);

    const byEmp = new Map();
    items.forEach((lv) => {
      const start = new Date(lv.start_date), end = new Date(lv.end_date);
      // Only include rows that overlap this month
      if (end < monthStart || start > monthEnd) return;
      if (!byEmp.has(lv.employee_id)) {
        byEmp.set(lv.employee_id, { id: lv.employee_id, name: lv.employee_name, leaves: [] });
      }
      byEmp.get(lv.employee_id).leaves.push(lv);
    });
    return { days, rows: Array.from(byEmp.values()).sort((a, b) => a.name?.localeCompare(b.name)) };
  }, [items, monthStart.getTime(), monthEnd.getTime()]);

  const cellTone = (lv) => {
    if (!lv) return "";
    const c = lv.leave_type_color;
    const status = lv.status;
    if (status === "pending") return "bg-amber-200/70 text-amber-900";
    return c ? "" : "bg-emerald-200/80 text-emerald-900";
  };

  return (
    <AppShell title="Leave planner">
      <div className="space-y-4" data-testid="leave-planner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
              className="p-1.5 rounded-md border border-zinc-200 hover:bg-zinc-100" data-testid="planner-prev">
              <CaretLeft size={16}/>
            </button>
            <div className="font-semibold text-base flex items-center gap-2 px-2">
              <Calendar size={16}/> {monthLabel}
            </div>
            <button onClick={() => setAnchor(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
              className="p-1.5 rounded-md border border-zinc-200 hover:bg-zinc-100" data-testid="planner-next">
              <CaretRight size={16}/>
            </button>
            <button onClick={() => setAnchor(new Date())} className="ml-2 px-3 py-1.5 rounded-md border border-zinc-200 text-xs hover:bg-zinc-100">
              Today
            </button>
          </div>
          <div className="flex gap-3 text-xs text-zinc-500">
            <Legend tone="bg-emerald-200/80" label="Approved" />
            <Legend tone="bg-amber-200/70" label="Pending" />
          </div>
        </div>

        <div className="border border-zinc-200 rounded-md overflow-x-auto bg-white" data-testid="planner-grid">
          <table className="text-xs w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="bg-zinc-50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-zinc-700 sticky left-0 bg-zinc-50 z-20 min-w-[170px]">Employee</th>
                {grid.days.map(d => {
                  const dt = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
                  const wknd = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <th key={d} className={`px-1 py-2 text-center font-medium border-l border-zinc-100 min-w-[28px] ${wknd ? "text-zinc-400 bg-zinc-50/60" : "text-zinc-600"}`}>
                      <div className="text-[10px] uppercase tracking-wide">{["S","M","T","W","T","F","S"][dt.getDay()]}</div>
                      <div className="text-[11px]">{d}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 && (
                <tr><td colSpan={grid.days.length + 1} className="px-3 py-12 text-center text-zinc-400">No team leaves in this month.</td></tr>
              )}
              {grid.rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                  <td className="px-3 py-2 sticky left-0 bg-white font-medium text-zinc-800 z-10 truncate max-w-[180px]" data-testid={`planner-emp-${row.id}`}>{row.name}</td>
                  {grid.days.map(d => {
                    const dt = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
                    const dtIso = dt.toISOString().slice(0, 10);
                    const lv = row.leaves.find(l => l.start_date <= dtIso && dtIso <= l.end_date);
                    const wknd = dt.getDay() === 0 || dt.getDay() === 6;
                    const style = lv?.leave_type_color ? { backgroundColor: lv.leave_type_color + (lv.status === "pending" ? "55" : "BB") } : {};
                    return (
                      <td key={d}
                          title={lv ? `${row.name} · ${lv.leave_type_name} (${lv.status}) · ${lv.start_date} → ${lv.end_date}` : ""}
                          className={`px-1 py-2 border-l border-zinc-100 text-center align-middle ${cellTone(lv)} ${wknd && !lv ? "bg-zinc-50/40" : ""}`}
                          style={style}>
                        {lv ? <span className="text-[10px] font-bold opacity-80">{lv.status === "pending" ? "P" : "✓"}</span> : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">Hover a cell for details. Approved leaves render in the leave-type's brand color; pending leaves appear faded amber.</p>
      </div>
    </AppShell>
  );
}

function Legend({ tone, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`inline-block w-3 h-3 rounded ${tone}`}/> {label}</span>;
}
