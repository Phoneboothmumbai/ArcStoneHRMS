import { useEffect, useState } from "react";
import AppShell, { StatCard, SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";

export default function HRDashboard() {
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, e, l] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/employees"),
        api.get("/leave"),
      ]);
      setStats(s.data); setEmployees(e.data.slice(0, 8)); setLeaves(l.data.slice(0, 6));
    })();
  }, []);

  return (
    <AppShell title="HR command center">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="hr-stats">
        <StatCard testid="stat-employees" label="Employees" value={stats?.employees ?? "—"} />
        <StatCard testid="stat-branches" label="Branches" value={stats?.branches ?? "—"} />
        <StatCard testid="stat-pending" label="Pending approvals" value={stats?.pending_approvals ?? "—"} />
        <StatCard testid="stat-leave" label="Open leave" value={stats?.open_leave ?? "—"} />
        <StatCard testid="stat-req" label="Open requests" value={stats?.open_requests ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <SectionCard
            title="Recent employees"
            subtitle="Latest joiners across your organization"
            testid="section-recent-emp"
            action={<Link to="/app/employees" className="text-xs text-zinc-950 hover:underline inline-flex items-center gap-1" data-testid="view-all-employees">View directory <ArrowRight size={12} /></Link>}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead><TableHead>Title</TableHead>
                  <TableHead>Type</TableHead><TableHead>Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id} data-testid={`hr-emp-row-${e.id}`}>
                    <TableCell>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-zinc-500">{e.email}</div>
                    </TableCell>
                    <TableCell className="text-zinc-600">{e.job_title}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{e.employee_type}</Badge></TableCell>
                    <TableCell className="font-mono-alt text-xs">{e.employee_code}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </div>
        <SectionCard title="Leave pipeline" subtitle="Pending and recent decisions" testid="section-leave-pipeline">
          <ul className="space-y-4">
            {leaves.map((l) => (
              <li key={l.id} className="border-b border-zinc-100 pb-3 last:border-0" data-testid={`hr-leave-${l.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{l.employee_name}</div>
                    <div className="text-xs text-zinc-500">{l.leave_type} · {l.start_date.slice(0,10)} → {l.end_date.slice(0,10)}</div>
                  </div>
                  <StatusPill status={l.status} />
                </div>
              </li>
            ))}
            {!leaves.length && <li className="text-sm text-zinc-500">No leave requests yet.</li>}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${map[status] || "bg-zinc-50 border-zinc-200 text-zinc-600"}`}>{status}</span>;
}
