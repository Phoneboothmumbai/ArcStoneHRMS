import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

export default function Leave() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leave_type: "casual", start_date: "", end_date: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => { const { data } = await api.get("/leave"); setRows(data); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.start_date || !form.end_date || !form.reason) { toast.error("Fill all fields"); return; }
    setBusy(true);
    try {
      await api.post("/leave", form);
      toast.success("Leave request submitted");
      setOpen(false);
      setForm({ leave_type: "casual", start_date: "", end_date: "", reason: "" });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <AppShell title="Leave">
      <Toaster richColors />
      <SectionCard
        title="Leave requests"
        subtitle="All requests routed through the company approval chain"
        testid="section-leave"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid="new-leave-btn"><Plus size={16} className="mr-1.5" /> New request</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for leave</DialogTitle></DialogHeader>
              <div className="space-y-4" data-testid="leave-form">
                <div>
                  <Label>Leave type</Label>
                  <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                    <SelectTrigger className="mt-2" data-testid="leave-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="earned">Earned</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-2" data-testid="leave-start" /></div>
                  <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-2" data-testid="leave-end" /></div>
                </div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="mt-2" placeholder="Short note for approvers" data-testid="leave-reason" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" onClick={submit} data-testid="leave-submit">Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id} data-testid={`leave-row-${l.id}`}>
                <TableCell className="font-medium">{l.employee_name}</TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-[10px]">{l.leave_type}</Badge></TableCell>
                <TableCell className="text-zinc-600 text-sm">{l.start_date.slice(0, 10)} → {l.end_date.slice(0, 10)}</TableCell>
                <TableCell className="text-zinc-600 text-sm truncate max-w-xs">{l.reason}</TableCell>
                <TableCell><StatusPill status={l.status} /></TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500">No leave requests yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}

function StatusPill({ status }) {
  const map = { pending: "bg-amber-50 text-amber-700 border-amber-200", approved: "bg-emerald-50 text-emerald-700 border-emerald-200", rejected: "bg-red-50 text-red-700 border-red-200" };
  return <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${map[status] || "bg-zinc-50 border-zinc-200 text-zinc-600"}`}>{status}</span>;
}
