import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export default function Attendance() {
  const [rows, setRows] = useState([]);
  useEffect(() => { (async () => { const { data } = await api.get("/attendance"); setRows(data); })(); }, []);

  return (
    <AppShell title="Attendance">
      <SectionCard title="Attendance log" subtitle="Check-ins and check-outs" testid="section-attendance">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`att-row-${r.id}`}>
                <TableCell className="font-mono-alt text-xs">{r.date}</TableCell>
                <TableCell>{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "—"}</TableCell>
                <TableCell>{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "—"}</TableCell>
                <TableCell>{r.hours || 0}h</TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-[10px]">{r.type}</Badge></TableCell>
                <TableCell className="text-zinc-600 text-sm">{r.location || "—"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">No attendance records yet. Check in from your workspace.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}
