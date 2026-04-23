import { useEffect, useState } from "react";
import AppShell, { StatCard, SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Plus } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

export default function Companies() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", plan: "growth", industry: "", admin_email: "", admin_name: "", admin_password: "" });

  const load = async () => { const { data } = await api.get("/companies"); setRows(data); };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/companies", form);
      toast.success("Company onboarded");
      setOpen(false);
      setForm({ name: "", plan: "growth", industry: "", admin_email: "", admin_name: "", admin_password: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <AppShell title="Companies">
      <Toaster richColors />
      <SectionCard
        title={`${rows.length} tenant companies`}
        subtitle="Onboard a new HRMS customer"
        testid="section-companies"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid="new-company-btn"><Plus size={16} className="mr-1.5" /> Onboard company</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Onboard a new company</DialogTitle></DialogHeader>
              <div className="space-y-4" data-testid="company-form">
                <div><Label>Company name</Label><Input className="mt-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="c-name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Plan</Label>
                    <select className="mt-2 w-full h-10 border border-zinc-300 rounded-md px-3 bg-white text-sm" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} data-testid="c-plan">
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div><Label>Industry</Label><Input className="mt-2" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} data-testid="c-industry" /></div>
                </div>
                <div><Label>HR Admin name</Label><Input className="mt-2" value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} data-testid="c-admin-name" /></div>
                <div><Label>HR Admin email</Label><Input className="mt-2" type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} data-testid="c-admin-email" /></div>
                <div><Label>Temporary password</Label><Input className="mt-2" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} data-testid="c-admin-pw" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" onClick={submit} data-testid="c-submit">Onboard</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Industry</TableHead><TableHead className="text-right">Employees</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id} data-testid={`crow-${c.id}`}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-[10px] tracking-wider">{c.plan}</Badge></TableCell>
                <TableCell><span className="text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">{c.status}</span></TableCell>
                <TableCell className="text-zinc-600">{c.industry || "—"}</TableCell>
                <TableCell className="text-right">{c.employee_count}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500">No companies yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}
