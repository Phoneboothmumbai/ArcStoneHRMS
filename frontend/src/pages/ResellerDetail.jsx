import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ArrowLeft, Storefront, CurrencyInr, Buildings, Percent } from "@phosphor-icons/react";
import { toast } from "sonner";

const inr = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function ResellerDetail() {
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rr, cs] = await Promise.all([
          api.get(`/resellers/${id}`),
          api.get("/companies").catch(() => ({ data: [] })),
        ]);
        if (alive) {
          setR(rr.data);
          setCompanies((cs.data || []).filter(c => c.reseller_id === id));
        }
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Failed to load reseller");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  return (
    <AppShell title={r?.name || "Reseller"}>
      <div className="space-y-5" data-testid="reseller-detail">
        <Link to="/app/resellers" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900" data-testid="reseller-back-link">
          <ArrowLeft size={12}/> Back to resellers
        </Link>

        {loading ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : !r ? (
          <div className="text-sm text-zinc-500">Reseller not found.</div>
        ) : (
          <>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold tracking-tight">{r.name}</h2>
                  <Badge variant="outline" className="uppercase text-[10px]">{r.status || "active"}</Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {r.company_name || "—"} · {r.contact_email || "—"}{r.phone ? ` · ${r.phone}` : ""}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <StatCard label="Companies" value={r.company_count ?? companies.length} icon={Buildings}/>
              <StatCard label="MRR" value={inr(r.mrr)} icon={CurrencyInr}/>
              <StatCard label="Commission rate" value={`${Math.round((r.commission_rate || 0) * 100)}%`} icon={Percent}/>
              <StatCard label="Monthly payout" value={inr(r.monthly_commission)} icon={CurrencyInr}/>
            </div>

            <SectionCard title={`Companies under this reseller (${companies.length})`} subtitle="All tenants invoiced through this partner." testid="reseller-companies">
              {companies.length === 0 ? (
                <div className="text-sm text-zinc-500 py-6 text-center">No companies onboarded yet.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Plan</TableHead><TableHead>Industry</TableHead><TableHead className="text-right">Employees</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {companies.map(c => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => { window.location.href = `/app/companies/${c.id}`; }} data-testid={`reseller-crow-${c.id}`}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline" className="uppercase text-[10px]">{c.plan}</Badge></TableCell>
                        <TableCell className="text-zinc-600">{c.industry || "—"}</TableCell>
                        <TableCell className="text-right">{c.employee_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
