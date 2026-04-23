import { useEffect, useState } from "react";
import AppShell, { StatCard, SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export default function ResellerDashboard() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([api.get("/dashboard/stats"), api.get("/companies")]);
      setStats(s.data); setCompanies(c.data);
    })();
  }, []);

  return (
    <AppShell title="Reseller workspace">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="reseller-stats">
        <StatCard testid="stat-companies" label="Companies" value={stats?.companies ?? "—"} />
        <StatCard testid="stat-employees" label="Covered employees" value={stats?.employees ?? "—"} />
        <StatCard testid="stat-mrr" label="Portfolio MRR" value={stats ? `$${stats.mrr.toLocaleString()}` : "—"} />
        <StatCard testid="stat-commission" label="Monthly commission" value={stats ? `$${stats.monthly_commission.toLocaleString()}` : "—"} hint={`at ${Math.round((stats?.commission_rate || 0)*100)}% rate`} />
      </div>

      <div className="mt-6">
        <SectionCard title="My companies" subtitle="Tenants you've onboarded" testid="section-my-companies">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead><TableHead>Plan</TableHead>
                <TableHead>Status</TableHead><TableHead>Industry</TableHead>
                <TableHead className="text-right">Employees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id} data-testid={`myc-row-${c.id}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{c.plan}</Badge></TableCell>
                  <TableCell><span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{c.status}</span></TableCell>
                  <TableCell className="text-zinc-600">{c.industry || "—"}</TableCell>
                  <TableCell className="text-right">{c.employee_count}</TableCell>
                </TableRow>
              ))}
              {!companies.length && <TableRow><TableCell colSpan={5} className="text-center text-zinc-500 py-8">No companies yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </AppShell>
  );
}
