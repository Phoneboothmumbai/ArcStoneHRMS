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
import { Link, useParams } from "react-router-dom";
import {
  Plus, Storefront, FileText, Receipt, Star, PaperPlaneTilt, Package, CheckCircle,
  Lock, LockOpen, Trophy, Copy, Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const err = (e) => toast.error(formatApiError(e?.response?.data?.detail));

const V_STATUS = {
  invited: "bg-zinc-100 text-zinc-700", active: "bg-emerald-100 text-emerald-700",
  blacklisted: "bg-red-100 text-red-700", suspended: "bg-amber-100 text-amber-800",
};
const RFQ_STATUS = {
  draft: "bg-zinc-100 text-zinc-700", open: "bg-blue-100 text-blue-700",
  closed: "bg-amber-100 text-amber-800", awarded: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};
const PO_STATUS = {
  draft: "bg-zinc-100 text-zinc-700", awaiting_approval: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-700", rejected: "bg-red-100 text-red-700",
  sent: "bg-blue-100 text-blue-700", acknowledged: "bg-cyan-100 text-cyan-700",
  in_transit: "bg-indigo-100 text-indigo-700", partially_received: "bg-fuchsia-100 text-fuchsia-700",
  received: "bg-teal-100 text-teal-700", invoiced: "bg-violet-100 text-violet-700",
  paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-zinc-200 text-zinc-500",
  closed: "bg-zinc-200 text-zinc-600",
};

const inr = (n, cur = "INR") => `${cur} ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// ─── Procurement Overview ────────────────────────────────────────────────
export default function ProcurementOverview() {
  const [vendors, setVendors] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [pos, setPos] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [v, r, p] = await Promise.all([
          api.get("/procurement/vendors"),
          api.get("/rfqs"),
          api.get("/purchase-orders"),
        ]);
        setVendors(v.data); setRfqs(r.data); setPos(p.data);
      } catch (e) { err(e); }
    })();
  }, []);

  const openRfqs = rfqs.filter(r => r.status === "open").length;
  const awaiting = pos.filter(p => p.status === "awaiting_approval").length;
  const spendTotal = pos.filter(p => ["paid", "invoiced"].includes(p.status)).reduce((s, p) => s + (p.grand_total || 0), 0);

  return (
    <AppShell title="Procurement">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Active vendors" value={vendors.filter(v => v.status === "active").length} testid="stat-vendors"/>
        <StatCard label="Open RFQs" value={openRfqs} testid="stat-open-rfqs"/>
        <StatCard label="POs awaiting approval" value={awaiting} testid="stat-awaiting"/>
        <StatCard label="Spend (paid+invoiced)" value={inr(spendTotal)} testid="stat-spend"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <Link to="/app/procurement/vendors" className="group border border-zinc-200 rounded-lg p-4 bg-white hover:border-orange-300 hover:shadow-sm transition" data-testid="tile-vendors">
          <div className="flex items-center gap-2 text-orange-700 mb-1.5"><Storefront size={20} weight="duotone"/><span className="font-semibold">Vendors</span></div>
          <p className="text-sm text-zinc-500">{vendors.length} total · Manage master data, ratings, portal tokens.</p>
        </Link>
        <Link to="/app/procurement/rfqs" className="group border border-zinc-200 rounded-lg p-4 bg-white hover:border-blue-300 hover:shadow-sm transition" data-testid="tile-rfqs">
          <div className="flex items-center gap-2 text-blue-700 mb-1.5"><FileText size={20} weight="duotone"/><span className="font-semibold">RFQs</span></div>
          <p className="text-sm text-zinc-500">Sealed-bid quotes with deadline · compare & award.</p>
        </Link>
        <Link to="/app/procurement/purchase-orders" className="group border border-zinc-200 rounded-lg p-4 bg-white hover:border-emerald-300 hover:shadow-sm transition" data-testid="tile-pos">
          <div className="flex items-center gap-2 text-emerald-700 mb-1.5"><Receipt size={20} weight="duotone"/><span className="font-semibold">Purchase Orders</span></div>
          <p className="text-sm text-zinc-500">Approve → Send → Receive → Invoice → Pay.</p>
        </Link>
      </div>

      <SectionCard title="Recent POs" testid="section-recent-pos">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {pos.slice(0, 8).map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs"><Link to={`/app/procurement/purchase-orders/${p.id}`} className="hover:underline">{p.code}</Link></TableCell>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell>{p.vendor_name}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(p.grand_total, p.currency)}</TableCell>
                <TableCell><Badge className={PO_STATUS[p.status]}>{p.status.replace(/_/g, " ")}</Badge></TableCell>
              </TableRow>
            ))}
            {pos.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-zinc-500">No POs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}

// ─── Vendors ─────────────────────────────────────────────────────────────
export function VendorsPage() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [f, setF] = useState({ name:"", kind:"supplier", category:"", contact_email:"", contact_name:"", phone:"", gstin:"", pan:"" });

  const load = async () => { try { const r = await api.get("/procurement/vendors"); setRows(r.data); } catch (e) { err(e); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try { await api.post("/procurement/vendors", f); toast.success("Vendor added"); setOpen(false);
      setF({ name:"", kind:"supplier", category:"", contact_email:"", contact_name:"", phone:"", gstin:"", pan:"" }); load();
    } catch (e) { err(e); }
  };
  const openDetail = async (vid) => { try { const r = await api.get(`/procurement/vendors/${vid}`); setDetail(r.data); } catch (e) { err(e); } };
  const rotateToken = async (vid) => {
    if (!window.confirm("Rotate portal token? Old token becomes invalid immediately.")) return;
    try { await api.post(`/procurement/vendors/${vid}/rotate-token`); toast.success("Token rotated"); openDetail(vid); } catch (e) { err(e); }
  };
  const copyToken = (t) => { navigator.clipboard.writeText(t); toast.success("Portal token copied"); };

  return (
    <AppShell title="Vendors">
      <SectionCard title="Vendor registry" subtitle="Master data for all suppliers, contractors, and service providers." testid="section-vendors"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-vendor-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New vendor</Button>}>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead>Category</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-zinc-500">No vendors.</TableCell></TableRow>}
            {rows.map(v => (
              <TableRow key={v.id} onClick={()=>openDetail(v.id)} className="cursor-pointer hover:bg-zinc-50" data-testid={`vendor-row-${v.id}`}>
                <TableCell className="font-mono text-xs">{v.code}</TableCell>
                <TableCell className="font-medium">{v.name}<div className="text-xs text-zinc-500">{v.contact_email}</div></TableCell>
                <TableCell className="capitalize text-xs">{(v.kind || "").replace("_"," ")}</TableCell>
                <TableCell className="text-xs">{v.category || "—"}</TableCell>
                <TableCell className="tabular-nums">{v.rating ? <span className="flex items-center gap-1"><Star size={12} weight="fill" className="text-amber-500"/> {v.rating}</span> : "—"}</TableCell>
                <TableCell><Badge className={V_STATUS[v.status]}>{v.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="new-vendor-dialog">
          <DialogHeader><DialogTitle>New vendor</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} data-testid="v-name"/></div>
              <div><Label>Kind</Label>
                <Select value={f.kind} onValueChange={v=>setF({...f,kind:v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="supplier">Supplier</SelectItem><SelectItem value="service_provider">Service Provider</SelectItem><SelectItem value="contractor">Contractor</SelectItem><SelectItem value="consultant">Consultant</SelectItem><SelectItem value="logistics">Logistics</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Input value={f.category} onChange={e=>setF({...f,category:e.target.value})} placeholder="IT hardware, stationery…"/></div>
              <div><Label>Contact name</Label><Input value={f.contact_name} onChange={e=>setF({...f,contact_name:e.target.value})}/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={f.contact_email} onChange={e=>setF({...f,contact_email:e.target.value})} data-testid="v-email"/></div>
              <div><Label>Phone</Label><Input value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>GSTIN</Label><Input value={f.gstin} onChange={e=>setF({...f,gstin:e.target.value})}/></div>
              <div><Label>PAN</Label><Input value={f.pan} onChange={e=>setF({...f,pan:e.target.value})}/></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="v-save">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(v)=>{if(!v)setDetail(null);}}>
        <DialogContent className="sm:max-w-2xl" data-testid="vendor-detail">
          {detail && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2 flex-wrap"><span>{detail.name}</span><span className="text-sm font-mono text-zinc-500">{detail.code}</span><Badge className={V_STATUS[detail.status]}>{detail.status}</Badge></DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-zinc-500">Contact</div>{detail.contact_name || "—"}<div className="text-xs">{detail.contact_email}</div></div>
                  <div><div className="text-xs text-zinc-500">Phone</div>{detail.phone || "—"}</div>
                  <div><div className="text-xs text-zinc-500">GSTIN</div><span className="font-mono text-xs">{detail.gstin || "—"}</span></div>
                  <div><div className="text-xs text-zinc-500">PAN</div><span className="font-mono text-xs">{detail.pan || "—"}</span></div>
                  <div><div className="text-xs text-zinc-500">Rating</div>{detail.rating ? `${detail.rating} / 5 (${detail.ratings_count} reviews)` : "—"}</div>
                  <div><div className="text-xs text-zinc-500">Category</div>{detail.category || "—"}</div>
                </div>
                {detail.portal_token && (
                  <div className="border-t pt-3">
                    <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Vendor Portal Token</div>
                    <div className="flex gap-2">
                      <Input value={detail.portal_token} readOnly className="font-mono text-xs" data-testid="v-portal-token"/>
                      <Button size="sm" variant="outline" onClick={()=>copyToken(detail.portal_token)}><Copy size={14}/></Button>
                      <Button size="sm" variant="outline" className="text-amber-700" onClick={()=>rotateToken(detail.id)}>Rotate</Button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">Share with vendor at: <span className="font-mono">/vendor-portal?token={detail.portal_token.slice(0,10)}...</span></p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── RFQs ────────────────────────────────────────────────────────────────
export function RFQsPage() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title:"", category:"", description:"", deadline:"", currency:"INR", items:[{id: crypto.randomUUID(), description:"", quantity:1, unit:"piece", target_unit_price:""}] });

  const load = async () => { try { const r = await api.get("/rfqs"); setRows(r.data); } catch (e) { err(e); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const body = { ...f, items: f.items.filter(i => i.description).map(i => ({...i, quantity: Number(i.quantity)||0, target_unit_price: i.target_unit_price ? Number(i.target_unit_price) : undefined })) };
      if (!body.deadline) return toast.error("Deadline required");
      await api.post("/rfqs", body); toast.success("RFQ drafted");
      setOpen(false); setF({ title:"", category:"", description:"", deadline:"", currency:"INR", items:[{id: crypto.randomUUID(), description:"", quantity:1, unit:"piece", target_unit_price:""}] });
      load();
    } catch (e) { err(e); }
  };
  const setStatus = async (id, status) => { try { await api.post(`/rfqs/${id}/status`, { status }); load(); } catch (e) { err(e); } };

  return (
    <AppShell title="RFQs">
      <SectionCard title="Request for Quotation" subtitle="Draft → Open → invite vendors → Close → Compare quotes → Award." testid="section-rfqs"
        action={<Button size="sm" onClick={()=>setOpen(true)} data-testid="new-rfq-btn" className="gap-1.5"><Plus size={14} weight="bold"/> New RFQ</Button>}>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Deadline</TableHead><TableHead>Invited</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-zinc-500">No RFQs yet.</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id} data-testid={`rfq-row-${r.id}`}>
                <TableCell className="font-mono text-xs"><Link to={`/app/procurement/rfqs/${r.id}`} className="hover:underline">{r.code}</Link></TableCell>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell className="text-xs">{r.category || "—"}</TableCell>
                <TableCell className="text-xs tabular-nums">{(r.deadline || "").slice(0,16).replace("T"," ")}</TableCell>
                <TableCell className="text-xs">{(r.invited_vendors || []).length} · quoted {(r.invited_vendors || []).filter(v=>v.quote_id).length}</TableCell>
                <TableCell><Badge className={RFQ_STATUS[r.status]}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    {r.status === "draft" && <Button size="sm" onClick={()=>setStatus(r.id,"open")} data-testid={`rfq-open-${r.id}`}>Open</Button>}
                    {r.status === "open" && <Button size="sm" variant="secondary" onClick={()=>setStatus(r.id,"closed")} data-testid={`rfq-close-${r.id}`}>Close</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl" data-testid="new-rfq-dialog">
          <DialogHeader><DialogTitle>New RFQ</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>Title</Label><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="Laptops for Q2" data-testid="rfq-title"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Input value={f.category} onChange={e=>setF({...f,category:e.target.value})} placeholder="IT hardware"/></div>
              <div><Label>Deadline</Label><Input type="datetime-local" value={f.deadline} onChange={e=>setF({...f,deadline:e.target.value ? new Date(e.target.value).toISOString() : ""})} data-testid="rfq-deadline"/></div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label>Line items</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={()=>setF({...f, items:[...f.items, {id: crypto.randomUUID(), description:"", quantity:1, unit:"piece", target_unit_price:""}]})}><Plus size={12}/> Item</Button>
              </div>
              <div className="space-y-2">
                {f.items.map((it, idx) => (
                  <div key={it.id} className="grid grid-cols-[1fr_70px_80px_100px_32px] gap-2 items-center">
                    <Input value={it.description} onChange={e=>{const xs=[...f.items]; xs[idx]={...it,description:e.target.value}; setF({...f,items:xs});}} placeholder="Description" data-testid={`rfq-item-desc-${idx}`}/>
                    <Input type="number" value={it.quantity} onChange={e=>{const xs=[...f.items]; xs[idx]={...it,quantity:e.target.value}; setF({...f,items:xs});}}/>
                    <Input value={it.unit} onChange={e=>{const xs=[...f.items]; xs[idx]={...it,unit:e.target.value}; setF({...f,items:xs});}} placeholder="unit"/>
                    <Input type="number" value={it.target_unit_price} onChange={e=>{const xs=[...f.items]; xs[idx]={...it,target_unit_price:e.target.value}; setF({...f,items:xs});}} placeholder="Target ₹"/>
                    <Button size="sm" variant="ghost" className="text-red-600 p-0 h-8 w-8" onClick={()=>setF({...f,items:f.items.filter((_,i)=>i!==idx)})} disabled={f.items.length === 1}><Trash size={14}/></Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-1">Target prices are internal only — NOT shown to vendors.</p>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={save} data-testid="rfq-save">Draft</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── RFQ Detail with invite + compare + award ────────────────────────────
export function RFQDetail() {
  const { id } = useParams();
  const [rfq, setRfq] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [compare, setCompare] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const load = async () => {
    try {
      const [r, v] = await Promise.all([api.get(`/rfqs/${id}`), api.get("/procurement/vendors?status=active")]);
      setRfq(r.data); setVendors(v.data);
      if (r.data.status === "closed" || r.data.status === "awarded") {
        try { const c = await api.get(`/rfqs/${id}/compare`); setCompare(c.data); } catch (_) {}
      } else { setCompare(null); }
    } catch (e) { err(e); }
  };
  useEffect(() => { load(); }, [id]);

  const invite = async () => {
    try {
      await api.post(`/rfqs/${id}/invite`, { vendor_ids: Array.from(selected) });
      toast.success("Vendors invited"); setInviteOpen(false); setSelected(new Set()); load();
    } catch (e) { err(e); }
  };
  const award = async (quote_id) => {
    if (!window.confirm("Award this RFQ and auto-draft a Purchase Order?")) return;
    try {
      const r = await api.post(`/rfqs/${id}/award`, { quote_id });
      toast.success(`Awarded. PO ${r.data.po.code} drafted.`); load();
    } catch (e) { err(e); }
  };
  const setStatus = async (status) => { try { await api.post(`/rfqs/${id}/status`, { status }); load(); } catch (e) { err(e); } };

  if (!rfq) return <AppShell title="RFQ"><p className="p-8 text-zinc-500">Loading…</p></AppShell>;
  const invitedIds = new Set((rfq.invited_vendors || []).map(i => i.vendor_id));
  const uninvited = vendors.filter(v => !invitedIds.has(v.id));

  return (
    <AppShell title={`${rfq.code} · ${rfq.title}`}>
      <SectionCard title="RFQ" testid="section-rfq-detail"
        action={<div className="flex gap-2 items-center">
          <Badge className={RFQ_STATUS[rfq.status]}>{rfq.status}</Badge>
          {rfq.status === "draft" && <Button size="sm" onClick={()=>setStatus("open")}>Open</Button>}
          {rfq.status === "open" && <><Button size="sm" variant="outline" onClick={()=>setInviteOpen(true)} data-testid="invite-btn"><Plus size={14}/> Invite vendors</Button><Button size="sm" variant="secondary" onClick={()=>setStatus("closed")} data-testid="close-rfq-btn">Close RFQ</Button></>}
        </div>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div><div className="text-xs text-zinc-500">Category</div>{rfq.category || "—"}</div>
          <div><div className="text-xs text-zinc-500">Deadline</div><span className="tabular-nums">{(rfq.deadline || "").slice(0,16).replace("T"," ")}</span></div>
          <div><div className="text-xs text-zinc-500">Currency</div>{rfq.currency}</div>
          <div><div className="text-xs text-zinc-500">Invited</div>{(rfq.invited_vendors || []).length} · quoted {(rfq.invited_vendors || []).filter(v => v.quote_id).length}</div>
        </div>
        <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Items</div>
        <Table>
          <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Target</TableHead></TableRow></TableHeader>
          <TableBody>{(rfq.items || []).map(it => (<TableRow key={it.id}><TableCell>{it.description}</TableCell><TableCell className="text-right tabular-nums">{it.quantity}</TableCell><TableCell>{it.unit}</TableCell><TableCell className="text-right tabular-nums">{it.target_unit_price ? inr(it.target_unit_price, rfq.currency) : "—"}</TableCell></TableRow>))}</TableBody>
        </Table>
      </SectionCard>

      <SectionCard title={`Invited vendors ${rfq.status === "open" ? <Badge className="ml-2">Sealed — visible after deadline/close</Badge> : ""}`} testid="section-invited">
        <Table>
          <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Invited</TableHead><TableHead>Viewed</TableHead><TableHead>Quote</TableHead></TableRow></TableHeader>
          <TableBody>
            {(rfq.invited_vendors || []).map((iv, idx) => (
              <TableRow key={`${iv.vendor_id}-${idx}`}>
                <TableCell className="font-medium">{iv.vendor_name}</TableCell>
                <TableCell className="text-xs">{(iv.invited_at || "").slice(0,16).replace("T"," ")}</TableCell>
                <TableCell className="text-xs">{iv.viewed_at ? (iv.viewed_at || "").slice(0,16).replace("T"," ") : <span className="text-zinc-400">not viewed</span>}</TableCell>
                <TableCell>{iv.quote_id ? <Badge className="bg-emerald-100 text-emerald-700">Submitted</Badge> : <Badge variant="outline">pending</Badge>}</TableCell>
              </TableRow>
            ))}
            {(rfq.invited_vendors || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-6 text-zinc-500">No vendors invited yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>

      {compare && compare.vendors && compare.vendors.length > 0 && (
        <SectionCard title="Quote comparison matrix" subtitle="Lowest quote shaded. Click 'Award' to pick winner." testid="section-compare">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left p-2 font-semibold">Item</th>
                  <th className="text-right p-2 font-semibold">Qty</th>
                  {compare.vendors.map(v => (
                    <th key={v.id} className="text-right p-2 font-semibold min-w-[140px]">
                      <div>{v.name}</div>
                      <div className="text-xs font-normal text-zinc-500">{v.delivery_days ? `${v.delivery_days}d delivery` : ""}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compare.matrix.map(row => (
                  <tr key={row.item_id} className="border-b border-zinc-100">
                    <td className="p-2 font-medium">{row.description}</td>
                    <td className="p-2 text-right tabular-nums">{row.quantity} {row.unit}</td>
                    {compare.vendors.map(v => {
                      const vp = row.vendor_prices[v.id];
                      const price = vp?.unit_price;
                      const allPrices = compare.vendors.map(vv => row.vendor_prices[vv.id]?.unit_price).filter(x => x != null);
                      const min = allPrices.length ? Math.min(...allPrices) : null;
                      const isMin = price != null && price === min && allPrices.length > 1;
                      return (
                        <td key={v.id} className={`p-2 text-right tabular-nums ${isMin ? "bg-emerald-50 font-semibold text-emerald-800" : ""}`}>
                          {price != null ? inr(price, compare.rfq.currency || "INR") : <span className="text-zinc-400">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-300 bg-zinc-50">
                  <td className="p-2 font-bold" colSpan={2}>Total</td>
                  {compare.vendors.map(v => {
                    const isWinner = v.total_amount === compare.lowest_total;
                    return (
                      <td key={v.id} className={`p-2 text-right tabular-nums font-bold ${isWinner ? "bg-emerald-100 text-emerald-900" : ""}`} data-testid={`compare-total-${v.id}`}>
                        {inr(v.total_amount, compare.rfq.currency || "INR")}
                        {isWinner && <div className="text-xs font-normal text-emerald-700 flex items-center justify-end gap-1 mt-1"><Trophy size={12} weight="fill"/> Lowest</div>}
                      </td>
                    );
                  })}
                </tr>
                {rfq.status === "closed" && (
                  <tr>
                    <td colSpan={2}></td>
                    {compare.vendors.map(v => (
                      <td key={v.id} className="p-2 text-right">
                        <Button size="sm" onClick={()=>award(v.quote_id)} data-testid={`award-${v.id}`} className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Trophy size={12}/> Award</Button>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="invite-dialog">
          <DialogHeader><DialogTitle>Invite vendors</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
            {uninvited.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">All active vendors already invited.</p>}
            {uninvited.map(v => (
              <label key={v.id} className={`flex items-center gap-3 p-2 rounded border ${selected.has(v.id) ? "border-orange-300 bg-orange-50" : "border-zinc-200 hover:border-zinc-300"} cursor-pointer`}>
                <input type="checkbox" checked={selected.has(v.id)} onChange={e=>{const s=new Set(selected); if(e.target.checked)s.add(v.id); else s.delete(v.id); setSelected(s);}} data-testid={`invite-${v.id}`}/>
                <div className="flex-1"><div className="font-medium text-sm">{v.name}</div><div className="text-xs text-zinc-500">{v.category || v.kind} · {v.contact_email}</div></div>
                {v.rating ? <Badge variant="outline" className="gap-1"><Star size={10} weight="fill" className="text-amber-500"/> {v.rating}</Badge> : null}
              </label>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setInviteOpen(false)}>Cancel</Button><Button onClick={invite} disabled={selected.size===0} data-testid="invite-save">Invite {selected.size}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ─── Purchase Orders ─────────────────────────────────────────────────────
export function PurchaseOrdersPage() {
  const [rows, setRows] = useState([]);
  const load = async () => { try { const r = await api.get("/purchase-orders"); setRows(r.data); } catch (e) { err(e); } };
  useEffect(() => { load(); }, []);
  return (
    <AppShell title="Purchase Orders">
      <SectionCard title="Purchase Orders" testid="section-pos">
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-zinc-500">No POs.</TableCell></TableRow>}
            {rows.map(p => (
              <TableRow key={p.id} data-testid={`po-row-${p.id}`}>
                <TableCell className="font-mono text-xs"><Link to={`/app/procurement/purchase-orders/${p.id}`} className="hover:underline">{p.code}</Link></TableCell>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell>{p.vendor_name}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(p.grand_total, p.currency)}</TableCell>
                <TableCell><Badge className={PO_STATUS[p.status]}>{p.status.replace(/_/g," ")}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </AppShell>
  );
}

// ─── PO Detail with receive / invoice / pay + rate vendor ───────────────
export function PurchaseOrderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [rate, setRate] = useState({ rating: 5, comment: "" });

  const load = async () => { try { const r = await api.get(`/purchase-orders/${id}`); setPo(r.data); } catch (e) { err(e); } };
  useEffect(() => { load(); }, [id]);

  const act = async (path, body = null) => {
    try { await api.post(`/purchase-orders/${id}/${path}`, body || {}); load(); toast.success("Done"); } catch (e) { err(e); }
  };
  const receiveAll = async () => {
    try {
      const body = { lines: po.lines.filter(l => (l.received_qty || 0) < l.quantity).map(l => ({ po_line_id: l.id, quantity: l.quantity - (l.received_qty || 0) })) };
      await api.post(`/purchase-orders/${id}/receive`, body); toast.success("All goods received"); load();
    } catch (e) { err(e); }
  };
  const invoice = async () => {
    const num = prompt("Vendor invoice number?"); if (!num) return;
    const amt = prompt("Invoice amount (₹)?", po.grand_total); if (!amt) return;
    try { await api.post(`/purchase-orders/${id}/invoice`, { invoice_number: num, invoice_amount: Number(amt) }); toast.success("Invoice recorded"); load(); } catch (e) { err(e); }
  };
  const rateVendor = async () => {
    try { await api.post("/procurement/vendors/rate", { vendor_id: po.vendor_id, rating: rate.rating, po_id: po.id, comment: rate.comment }); toast.success("Vendor rated"); setRate({ rating: 5, comment: "" }); } catch (e) { err(e); }
  };

  if (!po) return <AppShell title="PO"><p className="p-8 text-zinc-500">Loading…</p></AppShell>;

  return (
    <AppShell title={`${po.code} · ${po.title}`}>
      <SectionCard title="Purchase Order" testid="section-po-detail"
        action={<Badge className={PO_STATUS[po.status]}>{po.status.replace(/_/g," ")}</Badge>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div><div className="text-xs text-zinc-500">Vendor</div><div className="font-medium">{po.vendor_name}</div></div>
          <div><div className="text-xs text-zinc-500">Subtotal</div><span className="tabular-nums">{inr(po.subtotal, po.currency)}</span></div>
          <div><div className="text-xs text-zinc-500">Tax</div><span className="tabular-nums">{inr(po.tax_total, po.currency)}</span></div>
          <div><div className="text-xs text-zinc-500">Grand Total</div><span className="tabular-nums font-bold text-base">{inr(po.grand_total, po.currency)}</span></div>
        </div>

        <div className="text-xs font-semibold uppercase text-zinc-500 mb-2">Line items</div>
        <Table>
          <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Unit ₹</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {(po.lines || []).map(l => (<TableRow key={l.id}><TableCell>{l.description}</TableCell><TableCell className="text-right tabular-nums">{l.quantity}</TableCell><TableCell className="text-right tabular-nums">{l.received_qty || 0}</TableCell><TableCell className="text-right tabular-nums">{inr(l.unit_price, po.currency)}</TableCell><TableCell className="text-right tabular-nums">{inr(l.total, po.currency)}</TableCell></TableRow>))}
          </TableBody>
        </Table>

        <div className="border-t pt-3 mt-4 flex gap-2 flex-wrap">
          {po.status === "draft" && <Button size="sm" onClick={()=>act("submit-for-approval")} data-testid="submit-approval-btn" className="gap-1"><PaperPlaneTilt size={12}/> Submit for approval</Button>}
          {po.status === "awaiting_approval" && <><Button size="sm" onClick={()=>act("approve-decision", { decision: "approved" })} data-testid="approve-btn">Approve</Button><Button size="sm" variant="outline" className="text-red-600" onClick={()=>act("approve-decision", { decision: "rejected" })}>Reject</Button></>}
          {po.status === "approved" && <Button size="sm" onClick={()=>act("send")} data-testid="send-btn" className="gap-1"><PaperPlaneTilt size={12}/> Send to vendor</Button>}
          {(po.status === "sent" || po.status === "acknowledged" || po.status === "in_transit" || po.status === "partially_received") && <Button size="sm" onClick={receiveAll} data-testid="receive-btn" className="gap-1 bg-teal-600 hover:bg-teal-700"><Package size={12}/> Mark received</Button>}
          {(po.status === "received" || po.status === "partially_received") && <Button size="sm" onClick={invoice} data-testid="invoice-btn" className="gap-1"><Receipt size={12}/> Record invoice</Button>}
          {po.status === "invoiced" && <Button size="sm" onClick={()=>act("pay")} data-testid="pay-btn" className="gap-1 bg-emerald-600 hover:bg-emerald-700"><CheckCircle size={12}/> Mark paid</Button>}
        </div>
      </SectionCard>

      {(po.status === "paid" || po.status === "closed") && (
        <SectionCard title="Rate this vendor" subtitle="Your rating contributes to this vendor's average score." testid="section-rate">
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={()=>setRate({...rate, rating:n})} className={`h-8 w-8 rounded border-2 flex items-center justify-center ${rate.rating >= n ? "bg-amber-400 border-amber-500 text-white" : "bg-white border-zinc-200"}`} data-testid={`star-${n}`}><Star size={14} weight={rate.rating >= n ? "fill" : "regular"}/></button>
              ))}
            </div>
            <Input placeholder="Optional comment" value={rate.comment} onChange={e=>setRate({...rate, comment:e.target.value})} className="flex-1"/>
            <Button size="sm" onClick={rateVendor} data-testid="rate-save">Rate</Button>
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}
