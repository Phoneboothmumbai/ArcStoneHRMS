import { useEffect, useState } from "react";
import AppShell, { StatCard, SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export default function PlatformDashboard() {
  const [stats, setStats] = useState(null);
  const [resellers, setResellers] = useState([]);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, r, c] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/resellers"),
        api.get("/companies"),
      ]);
      setStats(s.data); setResellers(r.data); setCompanies(c.data);
    })();
  }, []);

  return (
    <AppShell title="Platform overview">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="platform-stats">
        <StatCard testid="stat-resellers" label="Resellers" value={stats?.resellers ?? "—"} />
        <StatCard testid="stat-companies" label="Companies" value={stats?.companies ?? "—"} />
        <StatCard testid="stat-employees" label="Employees" value={stats?.employees ?? "—"} />
        <StatCard testid="stat-active-users" label="Active users" value={stats?.active_users ?? "—"} />
        <StatCard testid="stat-pending" label="Pending approvals" value={stats?.pending_approvals ?? "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <SectionCard title="Resellers" subtitle="Active partners onboarding companies" testid="section-resellers">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead><TableHead>Email</TableHead>
                <TableHead className="text-right">Companies</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resellers.map((r) => (
                <TableRow key={r.id} data-testid={`reseller-row-${r.id}`}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-zinc-600">{r.contact_email}</TableCell>
                  <TableCell className="text-right">{r.company_count}</TableCell>
                  <TableCell className="text-right">{Math.round((r.commission_rate||0)*100)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Companies (tenants)" subtitle="All HRMS customers on the platform" testid="section-companies">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead><TableHead>Plan</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Employees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id} data-testid={`company-row-${c.id}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{c.plan}</Badge></TableCell>
                  <TableCell><span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{c.status}</span></TableCell>
                  <TableCell className="text-right">{c.employee_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </AppShell>
  );
}
