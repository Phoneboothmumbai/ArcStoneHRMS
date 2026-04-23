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

const blank = { category: "product", item_category: "", title: "", description: "", quantity: 1, estimated_cost: 0, route_to: "main_branch", vendor_id: "", urgency: "medium" };

const COMMON_ITEM_CATEGORIES = [
  "computer", "laptop", "phone", "monitor", "peripherals",
  "stationery", "furniture", "software_license", "training",
  "travel", "office_supplies", "other",
];

export default function ProductServiceRequests() {
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, v] = await Promise.all([api.get("/requests"), api.get("/vendors")]);
    setRows(r.data); setVendors(v.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.title || !form.description) { toast.error("Title and description required"); return; }
    setBusy(true);
    try {
      const payload = { ...form, vendor_id: form.vendor_id || null };
      await api.post("/requests", payload);
      toast.success("Request submitted for approval");
      setOpen(false); setForm(blank); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <AppShell title="Product & service requests">
      <Toaster richColors />
      <SectionCard
        title="All requests"
        subtitle="Equipment, services, licenses — routed to main branch or vendor"
        testid="section-requests"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid="new-request-btn"><Plus size={16} className="mr-1.5" /> New request</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Raise a product or service request</DialogTitle></DialogHeader>
              <div className="space-y-4" data-testid="request-form">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger className="mt-2" data-testid="req-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Urgency</Label>
                    <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
                      <SelectTrigger className="mt-2" data-testid="req-urgency"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Title</Label><Input className="mt-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ergonomic chair" data-testid="req-title" /></div>
                <div>
                  <Label>Item type <span className="text-zinc-400 font-normal">(drives the approval chain)</span></Label>
                  <Input className="mt-2" list="item-cat-list" placeholder="e.g. computer, stationery, furniture"
                    value={form.item_category}
                    onChange={(e) => setForm({ ...form, item_category: e.target.value.toLowerCase() })}
                    data-testid="req-item-cat" />
                  <datalist id="item-cat-list">
                    {COMMON_ITEM_CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div><Label>Description</Label><Textarea className="mt-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="req-desc" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Quantity</Label><Input className="mt-2" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value || 1) })} data-testid="req-qty" /></div>
                  <div><Label>Estimated cost</Label><Input className="mt-2" type="number" min={0} value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: parseFloat(e.target.value || 0) })} data-testid="req-cost" /></div>
                </div>
                <div>
                  <Label>Route to</Label>
                  <Select value={form.route_to} onValueChange={(v) => setForm({ ...form, route_to: v })}>
                    <SelectTrigger className="mt-2" data-testid="req-route"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main_branch">Main branch (internal)</SelectItem>
                      <SelectItem value="vendor">External vendor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.route_to === "vendor" && (
                  <div>
                    <Label>Vendor</Label>
                    <Select value={form.vendor_id || ""} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                      <SelectTrigger className="mt-2" data-testid="req-vendor"><SelectValue placeholder="Select a vendor" /></SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {v.category}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" onClick={submit} data-testid="req-submit">Submit</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Item type</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`req-row-${r.id}`}>
                <TableCell>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-zinc-500 truncate max-w-xs">{r.description}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-[10px]">{r.category}</Badge></TableCell>
                <TableCell className="text-zinc-600 text-sm">{r.item_category || "—"}</TableCell>
                <TableCell className="text-zinc-600 text-sm">{r.employee_name}</TableCell>
                <TableCell className="text-zinc-600 text-sm">{r.route_to.replace("_", " ")}</TableCell>
                <TableCell><UrgencyPill u={r.urgency} /></TableCell>
                <TableCell><StatusPill status={r.status} /></TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">No requests yet.</TableCell></TableRow>}
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
function UrgencyPill({ u }) {
  const map = { low: "bg-zinc-50 text-zinc-700 border-zinc-200", medium: "bg-blue-50 text-blue-700 border-blue-200", high: "bg-red-50 text-red-700 border-red-200" };
  return <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${map[u]}`}>{u}</span>;
}
