import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { DownloadSimple, ChartBar, Users, TrendUp } from "@phosphor-icons/react";
import { toast } from "sonner";

const err = (e) => toast.error(formatApiError(e?.response?.data?.detail));

const TEAL_BARS = ["bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500", "bg-orange-500"];

function BarList({ data, label = "Count" }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
  if (!entries.length) return <p className="text-sm text-zinc-500">No data.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <span className="w-40 truncate text-zinc-700">{k}</span>
          <div className="flex-1 h-5 bg-zinc-100 rounded-sm overflow-hidden">
            <div className={`h-full ${TEAL_BARS[i % TEAL_BARS.length]} transition-all`} style={{ width: `${(Number(v) / max) * 100}%` }}/>
          </div>
          <span className="w-16 text-right tabular-nums font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Reports Overview ─────────────────────────────────────────────────────
export default function ReportsOverview() {
  const [kpis, setKpis] = useState(null);
  const [hc, setHC] = useState(null);
  const [tenure, setTenure] = useState(null);
  const [attr, setAttr] = useState(null);

  const load = async () => {
    try {
      const [k, h, t, a] = await Promise.all([
        api.get("/reports/dashboard-kpis"),
        api.get("/reports/headcount"),
        api.get("/reports/tenure"),
        api.get("/reports/attrition"),
      ]);
      setKpis(k.data); setHC(h.data); setTenure(t.data); setAttr(a.data);
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, []);

  const downloadCSV = async (path, filename) => {
    try {
      const r = await api.get(path, { responseType: "blob" });
      const blob = new Blob([r.data], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
    } catch (e) { err(e); }
  };

  return (
    <AppShell title="Reports & MIS">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Employees" value={kpis?.total_employees ?? "—"} testid="stat-employees"/>
        <StatCard label="Open reqs" value={kpis?.active_requisitions ?? "—"} testid="stat-reqs"/>
        <StatCard label="Offers pending" value={kpis?.offers_awaiting_decision ?? "—"} testid="stat-offers"/>
        <StatCard label="Leave approvals" value={kpis?.pending_leave_approvals ?? "—"} testid="stat-leaves"/>
        <StatCard label="Open tickets" value={kpis?.open_helpdesk_tickets ?? "—"} testid="stat-tickets"/>
        <StatCard label="Payslips (MTD)" value={kpis?.payslips_generated_this_month ?? "—"} testid="stat-payslips"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Headcount by department" testid="section-hc-dept"
          action={<Button size="sm" variant="outline" className="gap-1" onClick={()=>downloadCSV("/reports/headcount.csv","headcount.csv")} data-testid="dl-hc"><DownloadSimple size={14}/> CSV</Button>}>
          <BarList data={hc?.by_department}/>
        </SectionCard>
        <SectionCard title="Headcount by employee type" testid="section-hc-type">
          <BarList data={hc?.by_employee_type}/>
        </SectionCard>
        <SectionCard title="Tenure distribution" testid="section-tenure"
          action={tenure && <Badge variant="outline" className="tabular-nums">Avg: {tenure.avg_tenure_years} yr</Badge>}>
          <BarList data={tenure?.buckets}/>
        </SectionCard>
        <SectionCard title="Attrition (rolling 12 mo)" testid="section-attrition"
          action={attr && <Badge className="bg-amber-100 text-amber-800 tabular-nums">{attr.annualised_rate_pct}%</Badge>}>
          <div className="mb-4 text-sm text-zinc-600">{attr?.total_exits ?? 0} exits in window · Annualised rate {attr?.annualised_rate_pct ?? 0}%</div>
          <BarList data={attr?.by_month}/>
        </SectionCard>
      </div>
    </AppShell>
  );
}

// ─── Compensation bands ──────────────────────────────────────────────────
export function CompensationReport() {
  const [data, setData] = useState(null);
  useEffect(() => {
    (async () => {
      try { const r = await api.get("/reports/compensation-bands"); setData(r.data); } catch (e) { err(e); }
    })();
  }, []);
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return (
    <AppShell title="Compensation bands">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <StatCard label="Employees with CTC" value={data?.total_employees_with_ctc ?? "—"}/>
        <StatCard label="Total annual cost" value={inr(data?.total_annual_cost)} hint="Gross company payroll"/>
        <StatCard label="Avg CTC" value={inr(data?.avg_annual_ctc)}/>
      </div>
      <SectionCard title="Band distribution" testid="section-bands">
        <BarList data={data?.bands}/>
      </SectionCard>
      <SectionCard title="By department" testid="section-bands-dept">
        <Table>
          <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Employees</TableHead><TableHead className="text-right">Total CTC</TableHead><TableHead className="text-right">Avg CTC</TableHead></TableRow></TableHeader>
          <TableBody>
            {Object.entries(data?.by_department || {}).map(([d, v]) => (
              <TableRow key={d}><TableCell className="font-medium">{d}</TableCell><TableCell className="text-right tabular-nums">{v.count}</TableCell><TableCell className="text-right tabular-nums">{inr(v.total_ctc)}</TableCell><TableCell className="text-right tabular-nums">{inr(v.avg_ctc)}</TableCell></TableRow>
            ))}
            {Object.keys(data?.by_department || {}).length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-zinc-500">No data.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}

// ─── Custom Report Builder ───────────────────────────────────────────────
export function ReportBuilder() {
  const [entities, setEntities] = useState([]);
  const [entity, setEntity] = useState("employees");
  const [dims, setDims] = useState([]);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    (async () => {
      try { const r = await api.get("/reports/builder/entities"); setEntities(r.data); if (r.data.length) setDims(r.data[0].dimensions.slice(0, 5)); }
      catch (e) { err(e); }
    })();
  }, []);

  const currentEntity = entities.find(e => e.entity === entity);
  const available = currentEntity?.dimensions || [];

  const toggleDim = (d) => {
    setDims(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const run = async (fmt = "json") => {
    try {
      if (fmt === "csv") {
        const r = await api.post("/reports/builder/run", { entity, dimensions: dims, format: "csv" }, { responseType: "blob" });
        const blob = new Blob([r.data], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob); link.download = `${entity}.csv`;
        document.body.appendChild(link); link.click(); link.remove();
        return;
      }
      const r = await api.post("/reports/builder/run", { entity, dimensions: dims });
      setRows(r.data.rows); setCount(r.data.count);
      toast.success(`${r.data.count} rows`);
    } catch (e) { err(e); }
  };

  return (
    <AppShell title="Custom report builder">
      <SectionCard title="Configure" subtitle="Pick an entity and dimensions, then Run or Export CSV." testid="section-config">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Entity</div>
            <Select value={entity} onValueChange={(v) => { setEntity(v); const e = entities.find(x => x.entity === v); setDims(e ? e.dimensions.slice(0, 5) : []); setRows([]); setCount(0); }}>
              <SelectTrigger data-testid="builder-entity"><SelectValue/></SelectTrigger>
              <SelectContent>{entities.map(e => <SelectItem key={e.entity} value={e.entity}>{e.entity}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Dimensions ({dims.length} selected)</div>
            <div className="flex flex-wrap gap-2">
              {available.map(d => (
                <button key={d} onClick={() => toggleDim(d)}
                  className={`px-2 py-1 text-xs rounded border transition ${dims.includes(d) ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-300 hover:border-zinc-500"}`}
                  data-testid={`dim-${d}`}>{d}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => run("json")} data-testid="run-btn" className="gap-1.5"><ChartBar size={14}/> Run</Button>
              <Button size="sm" variant="outline" onClick={() => run("csv")} className="gap-1.5" data-testid="csv-btn"><DownloadSimple size={14}/> Export CSV</Button>
            </div>
          </div>
        </div>
      </SectionCard>

      {rows.length > 0 && (
        <SectionCard title={`Results — ${count} rows`} testid="section-results">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{dims.map(d => <TableHead key={d}>{d}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 100).map((r, i) => (
                  <TableRow key={i}>{dims.map(d => <TableCell key={d} className="text-xs">{String(r[d] ?? "—")}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 100 && <p className="text-xs text-zinc-500 p-3 text-center">Showing first 100 of {count} rows — use CSV for full data.</p>}
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}
