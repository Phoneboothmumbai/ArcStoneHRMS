import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const load = async () => {
    const params = {};
    if (q) params.q = q;
    if (type !== "all") params.employee_type = type;
    const { data } = await api.get("/employees", { params });
    setRows(data);
  };
  useEffect(() => { load(); }, [q, type]);

  return (
    <AppShell title="Employee directory">
      <SectionCard
        title={`${rows.length} people`}
        subtitle="Filter across every branch, type and department"
        testid="section-directory"
        action={
          <div className="flex items-center gap-2">
            <Input placeholder="Search by name, code, email…" className="w-64 h-9 border-zinc-300" value={q} onChange={(e) => setQ(e.target.value)} data-testid="dir-search" />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40 h-9" data-testid="dir-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="wfo">Work from office</SelectItem>
                <SelectItem value="wfh">Work from home</SelectItem>
                <SelectItem value="field">Field</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} data-testid={`emp-row-${e.id}`}>
                <TableCell>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-zinc-500">{e.email}</div>
                </TableCell>
                <TableCell className="text-zinc-700">{e.job_title}</TableCell>
                <TableCell className="font-mono-alt text-xs">{e.employee_code}</TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{e.employee_type}</Badge></TableCell>
                <TableCell className="text-zinc-600 capitalize">{e.role_in_company?.replace(/_/g, " ")}</TableCell>
                <TableCell>
                  <span className="text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">{e.status}</span>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={6} className="text-center py-10 text-zinc-500">No employees match.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}
