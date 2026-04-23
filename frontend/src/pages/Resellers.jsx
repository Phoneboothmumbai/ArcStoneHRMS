import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Plus } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

export default function Resellers() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", company_name: "", contact_email: "", phone: "", commission_rate: 0.15, admin_password: "" });

  const load = async () => { const { data } = await api.get("/resellers"); setRows(data); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/resellers", form);
      toast.success("Reseller onboarded");
      setOpen(false);
      setForm({ name: "", company_name: "", contact_email: "", phone: "", commission_rate: 0.15, admin_password: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <AppShell title="Resellers">
      <Toaster richColors />
      <SectionCard
        title={`${rows.length} partners`}
        subtitle="Onboard new reseller partners"
        testid="section-resellers"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid="new-reseller-btn"><Plus size={16} className="mr-1.5" /> New reseller</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add reseller partner</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Contact name</Label><Input className="mt-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="r-name" /></div>
                <div><Label>Company name</Label><Input className="mt-2" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} data-testid="r-company" /></div>
                <div><Label>Contact email</Label><Input className="mt-2" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} data-testid="r-email" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input className="mt-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="r-phone" /></div>
                  <div><Label>Commission rate</Label><Input className="mt-2" type="number" step="0.01" min="0" max="1" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: parseFloat(e.target.value) })} data-testid="r-rate" /></div>
                </div>
                <div><Label>Temporary password</Label><Input className="mt-2" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} data-testid="r-pw" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" onClick={submit} data-testid="r-submit">Add reseller</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        <Table>
          <TableHeader>
            <TableRow><TableHead>Partner</TableHead><TableHead>Company</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Companies</TableHead><TableHead className="text-right">Rate</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`rrow-${r.id}`}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-zinc-600">{r.company_name}</TableCell>
                <TableCell className="text-zinc-600">{r.contact_email}</TableCell>
                <TableCell className="text-right">{r.company_count}</TableCell>
                <TableCell className="text-right">{Math.round((r.commission_rate || 0) * 100)}%</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500">No resellers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}
