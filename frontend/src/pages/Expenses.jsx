import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, Check, X, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATS = ["travel_flight","travel_hotel","travel_taxi","travel_mileage","travel_per_diem","meals","client_meeting","office_supplies","subscription","training","phone_internet","fuel","medical","other"];
const STATUS_COLOR = {
  draft:"bg-zinc-100 text-zinc-700",
  submitted:"bg-amber-100 text-amber-800",
  approved:"bg-emerald-100 text-emerald-800",
  rejected:"bg-red-100 text-red-800",
  reimbursed:"bg-blue-100 text-blue-800",
  booked:"bg-purple-100 text-purple-800",
  completed:"bg-zinc-100 text-zinc-700",
  cancelled:"bg-zinc-100 text-zinc-600",
};
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Expenses() {
  const [tab, setTab] = useState("claims");
  return (
    <AppShell title="Expenses & Travel">
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-200">
        {[{k:"claims",l:"Expense claims"},{k:"travel",l:"Travel requests"}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} data-testid={`exp-tab-${t.k}`}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab===t.k?"border-zinc-950 text-zinc-950 font-medium":"border-transparent text-zinc-500 hover:text-zinc-900"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "claims" ? <ClaimsTab/> : <TravelTab/>}
    </AppShell>
  );
}

function ClaimsTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [items, setItems] = useState([{ category:"meals", expense_date:new Date().toISOString().slice(0,10), amount:0, description:"" }]);

  const load = async () => { try { const r = await api.get("/expenses"); setRows(r.data); } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); } };
  useEffect(() => { load(); }, []);

  const addItem = () => setItems([...items, { category:"meals", expense_date:new Date().toISOString().slice(0,10), amount:0, description:"" }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i, k, v) => setItems(items.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const save = async () => {
    try {
      const r = await api.post("/expenses", { title, purpose, items });
      toast.success("Claim created"); setOpen(false); setTitle(""); setPurpose(""); setItems([{ category:"meals", expense_date:new Date().toISOString().slice(0,10), amount:0, description:"" }]);
      // Auto-submit for convenience
      await api.post(`/expenses/${r.data.id}/submit`);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const decide = async (id, decision) => {
    try { await api.post(`/expenses/${id}/decide`, { decision, reason: decision==="reject" ? (prompt("Reason?") || "") : undefined });
      toast.success(`Claim ${decision}d`); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const total = items.reduce((s, i) => s + (+i.amount || 0), 0);
  const pending = rows.filter(r => r.status === "submitted").length;
  const approved = rows.filter(r => r.status === "approved").length;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total claims" value={rows.length}/>
        <StatCard label="Pending review" value={pending}/>
        <StatCard label="Approved" value={approved}/>
        <StatCard label="Reimbursed" value={rows.filter(r=>r.status==="reimbursed").length}/>
      </div>
      <SectionCard title="Claims inbox" subtitle="Employees submit; admin approves or rejects."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="exp-new-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New claim</Button>}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead><TableHead>Items</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-zinc-500 py-6">No claims yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell><div className="font-medium">{r.title}</div><div className="text-xs text-zinc-500">{r.purpose}</div></TableCell>
                <TableCell>{r.employee_name}</TableCell>
                <TableCell><Badge className={STATUS_COLOR[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{inr(r.total_amount)}</TableCell>
                <TableCell className="text-xs text-zinc-500">{r.items?.length || 0} items</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {r.status === "submitted" && (<>
                      <Button size="sm" onClick={()=>decide(r.id,"approve")} className="gap-1"><Check size={12}/> Approve</Button>
                      <Button size="sm" variant="outline" onClick={()=>decide(r.id,"reject")} className="gap-1"><X size={12}/> Reject</Button>
                    </>)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>New expense claim</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Title</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="March client visits"/></div>
              <div><Label>Purpose</Label><Input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Q4 business development"/></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><Label>Items</Label><Button size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus size={12}/>Add item</Button></div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start border p-2 rounded-lg">
                    <Select value={it.category} onValueChange={v=>updateItem(i, "category", v)}><SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent>{CATS.map(c=>(<SelectItem key={c} value={c} className="capitalize text-xs">{c.replace(/_/g," ")}</SelectItem>))}</SelectContent></Select>
                    <Input type="date" value={it.expense_date} onChange={e=>updateItem(i, "expense_date", e.target.value)} className="col-span-3 h-8 text-xs"/>
                    <Input type="number" value={it.amount} onChange={e=>updateItem(i, "amount", +e.target.value)} placeholder="Amount" className="col-span-2 h-8 text-xs"/>
                    <Input value={it.description} onChange={e=>updateItem(i, "description", e.target.value)} placeholder="Description" className="col-span-3 h-8 text-xs"/>
                    <Button size="sm" variant="ghost" onClick={()=>removeItem(i)} className="col-span-1 h-8 px-2"><Trash size={14}/></Button>
                  </div>
                ))}
              </div>
              <p className="text-right text-sm font-semibold mt-2">Total: {inr(total)}</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="exp-save-btn">Save & submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TravelTab() {
  const [rows, setRows] = useState([]);
  const load = async () => { try { const r = await api.get("/travel-requests"); setRows(r.data); } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); } };
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    const body = { decision };
    if (decision === "book") { body.booking_reference = prompt("Booking reference?") || ""; }
    if (decision === "reject") { body.reason = prompt("Reason?") || ""; }
    try { await api.post(`/travel-requests/${id}/decide`, body); toast.success("Updated"); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  return (
    <SectionCard title="Travel requests" subtitle="Employee requests → approved → booked → completed.">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Purpose</TableHead><TableHead>Employee</TableHead><TableHead>Destinations</TableHead>
          <TableHead>Dates</TableHead><TableHead>Status</TableHead>
          <TableHead className="text-right">Est. cost</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length===0 && <TableRow><TableCell colSpan={7} className="text-center text-zinc-500 py-6">No travel requests yet.</TableCell></TableRow>}
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell><div className="font-medium">{r.purpose}</div><div className="text-xs text-zinc-500 capitalize">{r.mode}</div></TableCell>
              <TableCell>{r.employee_name}</TableCell>
              <TableCell className="text-xs">{(r.destinations||[]).join(", ")}</TableCell>
              <TableCell className="text-xs">{r.start_date} → {r.end_date}</TableCell>
              <TableCell><Badge className={STATUS_COLOR[r.status]}>{r.status}</Badge></TableCell>
              <TableCell className="text-right tabular-nums">{inr(r.estimated_cost)}</TableCell>
              <TableCell>
                <div className="flex gap-1 justify-end">
                  {r.status === "submitted" && <>
                    <Button size="sm" onClick={()=>decide(r.id,"approve")}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={()=>decide(r.id,"reject")}>Reject</Button>
                  </>}
                  {r.status === "approved" && <Button size="sm" onClick={()=>decide(r.id,"book")}>Mark booked</Button>}
                  {r.status === "booked" && <Button size="sm" variant="outline" onClick={()=>decide(r.id,"complete")}>Complete</Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
