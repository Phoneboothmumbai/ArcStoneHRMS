import { useEffect, useState } from "react";
import AppShell, { SectionCard, StatCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, User, ArrowUUpLeft } from "@phosphor-icons/react";
import { toast } from "sonner";

const CATS = ["laptop","desktop","monitor","keyboard_mouse","mobile","tablet","headphone","access_card","vehicle","furniture","software_license","sim_card","camera","other"];
const STATUS_COLOR = {
  available:"bg-emerald-100 text-emerald-800",
  assigned:"bg-blue-100 text-blue-800",
  maintenance:"bg-amber-100 text-amber-800",
  retired:"bg-zinc-100 text-zinc-700",
  lost:"bg-red-100 text-red-800",
};
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function Assets() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(null);   // asset.id or null
  const [empChoice, setEmpChoice] = useState("");
  const [f, setF] = useState(blank());
  function blank() { return { asset_tag:"", category:"laptop", make:"", model:"", serial_number:"", purchase_cost:0, purchase_date:"", useful_life_years:4, depreciation_method:"slm", location:"", notes:"" }; }

  const load = async () => {
    try {
      const [a, e] = await Promise.all([api.get("/assets"), api.get("/employees")]);
      setRows(a.data); setEmployees(e.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.post("/assets", f); toast.success("Asset added"); setOpen(false); setF(blank()); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const assign = async () => {
    try { await api.post("/asset-assignments/assign", { asset_id: assignOpen, employee_id: empChoice });
      toast.success("Assigned"); setAssignOpen(null); setEmpChoice(""); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const returnAsset = async (asset) => {
    const cond = window.prompt("Return condition? excellent / good / fair / damaged / lost", "good");
    if (!cond) return;
    try {
      // find active assignment
      const asmts = await api.get(`/asset-assignments?employee_id=${asset.assigned_to_employee_id}&current_only=true`);
      const a = (asmts.data || []).find(x => x.asset_id === asset.id);
      if (!a) { toast.error("No active assignment found"); return; }
      await api.post(`/asset-assignments/${a.id}/return`, { condition: cond });
      toast.success("Returned"); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const totalCost = rows.reduce((s, r) => s + (r.purchase_cost || 0), 0);
  const totalBV = rows.reduce((s, r) => s + (r.current_book_value || 0), 0);

  return (
    <AppShell title="Assets">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total assets" value={rows.length}/>
        <StatCard label="Assigned" value={rows.filter(r=>r.status==="assigned").length}/>
        <StatCard label="Available" value={rows.filter(r=>r.status==="available").length}/>
        <StatCard label="Book value" value={inr(totalBV)} hint={`${inr(totalCost)} cost`}/>
      </div>

      <SectionCard title="Asset register" subtitle="IT, mobile, access cards, vehicles. Depreciation auto-computed."
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="asset-new-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New asset</Button>}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tag</TableHead><TableHead>Item</TableHead><TableHead>Category</TableHead>
            <TableHead>Status</TableHead><TableHead>Assigned to</TableHead>
            <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Book value</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length===0 && <TableRow><TableCell colSpan={8} className="text-center text-zinc-500 py-6">No assets yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.asset_tag}</TableCell>
                <TableCell>{r.make} {r.model}</TableCell>
                <TableCell className="capitalize text-xs text-zinc-500">{r.category?.replace(/_/g," ")}</TableCell>
                <TableCell><Badge className={STATUS_COLOR[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-sm">{r.assigned_to_employee_name || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.purchase_cost)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(r.current_book_value)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {r.status === "available" && <Button size="sm" onClick={()=>{ setAssignOpen(r.id); setEmpChoice(""); }} className="gap-1"><User size={12}/> Assign</Button>}
                    {r.status === "assigned" && <Button size="sm" variant="outline" onClick={()=>returnAsset(r)} className="gap-1"><ArrowUUpLeft size={12}/> Return</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New asset</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Asset tag</Label><Input value={f.asset_tag} onChange={e=>setF({...f, asset_tag:e.target.value})} placeholder="ACME-LT-0001"/></div>
              <div>
                <Label>Category</Label>
                <Select value={f.category} onValueChange={v=>setF({...f, category:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{CATS.map(c=>(<SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g," ")}</SelectItem>))}</SelectContent></Select>
              </div>
              <div><Label>Make</Label><Input value={f.make} onChange={e=>setF({...f, make:e.target.value})}/></div>
              <div><Label>Model</Label><Input value={f.model} onChange={e=>setF({...f, model:e.target.value})}/></div>
              <div><Label>Serial</Label><Input value={f.serial_number} onChange={e=>setF({...f, serial_number:e.target.value})}/></div>
              <div><Label>Purchase date</Label><Input type="date" value={f.purchase_date} onChange={e=>setF({...f, purchase_date:e.target.value})}/></div>
              <div><Label>Cost</Label><Input type="number" value={f.purchase_cost} onChange={e=>setF({...f, purchase_cost:+e.target.value})}/></div>
              <div><Label>Life (years)</Label><Input type="number" value={f.useful_life_years} onChange={e=>setF({...f, useful_life_years:+e.target.value})}/></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignOpen} onOpenChange={()=>setAssignOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign to employee</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Employee</Label>
            <Select value={empChoice} onValueChange={setEmpChoice}><SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{employees.map(e=>(<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}</SelectContent></Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setAssignOpen(null)}>Cancel</Button><Button onClick={assign}>Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
