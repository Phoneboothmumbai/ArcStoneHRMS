import { useEffect, useState } from "react";
import AppShell, { StatCard, SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Link } from "react-router-dom";

export default function ManagerDashboard() {
  const [stats, setStats] = useState(null);
  const [team, setTeam] = useState([]);
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, t, a] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/employees/team"),
        api.get("/approvals"),
      ]);
      setStats(s.data); setTeam(t.data); setApprovals(a.data);
    })();
  }, []);

  return (
    <AppShell title="Manager workspace">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="mgr-stats">
        <StatCard testid="stat-team" label="Team members" value={stats?.team_count ?? "—"} />
        <StatCard testid="stat-pending" label="Awaiting my approval" value={stats?.pending_approvals ?? "—"} />
        <StatCard testid="stat-my-req" label="My submitted requests" value={stats?.my_requests ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <SectionCard
          title="Pending approvals" subtitle="Items where you are the current approver"
          testid="section-mgr-approvals"
          action={<Link to="/app/approvals" className="text-xs text-zinc-950 hover:underline" data-testid="view-all-approvals">Go to queue →</Link>}
        >
          <ul className="space-y-4">
            {approvals.filter(a => a.is_my_turn).slice(0, 5).map((a) => (
              <li key={a.id} className="border-b border-zinc-100 pb-3 last:border-0" data-testid={`mgr-ap-${a.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-sm">{a.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">From {a.requester_name} · {a.request_type.replace(/_/g, " ")}</div>
                  </div>
                  <Badge variant="outline" className="uppercase text-[10px]">Step {a.current_step}</Badge>
                </div>
              </li>
            ))}
            {!approvals.filter(a => a.is_my_turn).length && <li className="text-sm text-zinc-500">Inbox zero. Nothing waits on you.</li>}
          </ul>
        </SectionCard>

        <SectionCard title="My team" subtitle="Direct reports" testid="section-my-team">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {team.map((e) => (
                <TableRow key={e.id} data-testid={`team-row-${e.id}`}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-zinc-600">{e.job_title}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase text-[10px]">{e.employee_type}</Badge></TableCell>
                </TableRow>
              ))}
              {!team.length && <TableRow><TableCell colSpan={3} className="text-center py-6 text-zinc-500">No direct reports yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </AppShell>
  );
}
