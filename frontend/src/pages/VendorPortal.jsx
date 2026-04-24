import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Storefront, FileText, Package, CheckCircle, SignOut, Lock } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const err = (e) => toast.error(e?.response?.data?.detail || e?.message || "Error");

const inr = (n, cur = "INR") => `${cur} ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function VendorPortal() {
  const [params, setParams] = useSearchParams();
  const [token, setToken] = useState(() => localStorage.getItem("vendor_portal_token") || params.get("token") || "");
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("rfqs");
  const [rfqs, setRfqs] = useState([]);
  const [pos, setPos] = useState([]);
  const [activeRfq, setActiveRfq] = useState(null);
  const [tokenInput, setTokenInput] = useState("");
  const [quoteForm, setQuoteForm] = useState(null);

  const client = (t) => axios.create({ baseURL: API, headers: { "X-Vendor-Token": t || token } });

  const attemptLogin = async (t) => {
    try {
      const c = client(t);
      const r = await c.get("/vendor-portal/me");
      setMe(r.data);
      setToken(t);
      localStorage.setItem("vendor_portal_token", t);
      // Clean token from URL for safety
      if (params.get("token")) { params.delete("token"); setParams(params); }
      toast.success(`Welcome, ${r.data.name}`);
      loadAll(t);
    } catch (e) {
      err(e);
      setToken("");
      localStorage.removeItem("vendor_portal_token");
    }
  };

  const loadAll = async (t = token) => {
    try {
      const c = client(t);
      const [r, p] = await Promise.all([c.get("/vendor-portal/rfqs"), c.get("/vendor-portal/purchase-orders")]);
      setRfqs(r.data); setPos(p.data);
    } catch (e) { err(e); }
  };

  useEffect(() => {
    const urlToken = params.get("token");
    if (urlToken) attemptLogin(urlToken);
    else if (token) attemptLogin(token);
    // eslint-disable-next-line
  }, []);

  const logout = () => {
    localStorage.removeItem("vendor_portal_token");
    setToken(""); setMe(null); setRfqs([]); setPos([]);
  };

  const submitQuote = async () => {
    if (!quoteForm) return;
    try {
      await client(token).post("/vendor-portal/quotes", quoteForm);
      toast.success("Quote submitted (sealed until deadline)");
      setQuoteForm(null); setActiveRfq(null); loadAll();
    } catch (e) { err(e); }
  };
  const ackPO = async (pid) => {
    try { await client(token).post(`/vendor-portal/purchase-orders/${pid}/acknowledge`); toast.success("Acknowledged"); loadAll(); } catch (e) { err(e); }
  };

  // Login screen
  if (!me) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-zinc-100 flex items-center justify-center p-6">
        <Toaster richColors position="top-right"/>
        <Card className="w-full max-w-md p-8 shadow-xl">
          <div className="flex items-center gap-2 mb-6"><Storefront size={28} weight="duotone" className="text-orange-700"/><div><div className="font-bold text-xl">Vendor Portal</div><div className="text-xs text-zinc-500">Arcstone Procurement</div></div></div>
          <Label htmlFor="tk">Portal token</Label>
          <Input id="tk" value={tokenInput} onChange={e=>setTokenInput(e.target.value)} placeholder="Paste token from invitation email" className="font-mono text-sm" data-testid="vp-token-input"/>
          <Button className="w-full mt-4 gap-2 bg-orange-600 hover:bg-orange-700" onClick={()=>attemptLogin(tokenInput)} data-testid="vp-login-btn"><Lock size={16}/> Access portal</Button>
          <p className="text-xs text-zinc-500 mt-4 text-center">Your buyer issues you this token when they invite you to RFQs.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Toaster richColors position="top-right"/>
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><Storefront size={24} weight="duotone" className="text-orange-700"/><div><div className="font-bold">{me.name}</div><div className="text-xs text-zinc-500">{me.code} · Vendor Portal</div></div></div>
        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-100 text-emerald-700">{me.status}</Badge>
          <Button size="sm" variant="outline" onClick={logout} className="gap-1" data-testid="vp-logout"><SignOut size={14}/> Sign out</Button>
        </div>
      </header>
      <div className="border-b bg-white px-6 flex gap-2">
        <button onClick={()=>setTab("rfqs")} className={`py-3 px-3 text-sm font-medium border-b-2 ${tab==="rfqs"?"border-orange-500 text-orange-700":"border-transparent text-zinc-500 hover:text-zinc-700"}`} data-testid="vp-tab-rfqs"><FileText size={14} className="inline mr-1.5"/>RFQs ({rfqs.length})</button>
        <button onClick={()=>setTab("pos")} className={`py-3 px-3 text-sm font-medium border-b-2 ${tab==="pos"?"border-orange-500 text-orange-700":"border-transparent text-zinc-500 hover:text-zinc-700"}`} data-testid="vp-tab-pos"><Package size={14} className="inline mr-1.5"/>Purchase Orders ({pos.length})</button>
      </div>

      <main className="p-6 max-w-6xl mx-auto">
        {tab === "rfqs" && (
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Open RFQs</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead>Deadline</TableHead><TableHead>Status</TableHead><TableHead>Your quote</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {rfqs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-zinc-500">No RFQs yet.</TableCell></TableRow>}
                {rfqs.map(r => (
                  <TableRow key={r.id} data-testid={`vp-rfq-${r.id}`}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-xs tabular-nums">{(r.deadline||"").slice(0,16).replace("T"," ")}</TableCell>
                    <TableCell><Badge className={r.status==="open"?"bg-emerald-100 text-emerald-700":"bg-zinc-100 text-zinc-600"}>{r.status}</Badge></TableCell>
                    <TableCell>{r.my_quote ? <Badge className="bg-blue-100 text-blue-700">{r.my_quote.status}</Badge> : <span className="text-xs text-zinc-400">not submitted</span>}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "open" && (
                        <Button size="sm" onClick={()=>{ setActiveRfq(r); setQuoteForm({ rfq_id: r.id, currency: r.currency, total_amount: 0, delivery_days: 7, validity_days: 30, payment_terms: "", notes: "", lines: (r.items||[]).map(it => ({ rfq_item_id: it.id, unit_price: 0, quantity_offered: it.quantity })) }); }} data-testid={`vp-quote-${r.id}`}>{r.my_quote ? "Revise" : "Submit quote"}</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        {tab === "pos" && (
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Purchase Orders</h2>
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Title</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {pos.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-zinc-500">No POs.</TableCell></TableRow>}
                {pos.map(p => (
                  <TableRow key={p.id} data-testid={`vp-po-${p.id}`}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(p.grand_total, p.currency)}</TableCell>
                    <TableCell><Badge>{p.status.replace(/_/g," ")}</Badge></TableCell>
                    <TableCell className="text-right">
                      {p.status === "sent" && <Button size="sm" onClick={()=>ackPO(p.id)} className="gap-1 bg-cyan-600 hover:bg-cyan-700" data-testid={`vp-ack-${p.id}`}><CheckCircle size={12}/> Acknowledge</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </main>

      <Dialog open={!!activeRfq} onOpenChange={(v)=>{if(!v){setActiveRfq(null); setQuoteForm(null);}}}>
        <DialogContent className="sm:max-w-2xl" data-testid="vp-quote-dialog">
          {activeRfq && quoteForm && (
            <>
              <DialogHeader><DialogTitle>{activeRfq.code} — Submit Quote</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
                <div className="p-3 bg-amber-50 rounded border border-amber-200 text-sm text-amber-900">
                  <strong>Sealed bid.</strong> Your quote is hidden from the buyer (and other vendors) until the deadline {(activeRfq.deadline||"").slice(0,16).replace("T"," ")}.
                </div>
                <div className="space-y-2">
                  {(activeRfq.items || []).map((it, idx) => (
                    <div key={it.id} className="grid grid-cols-[1fr_100px_80px_130px] gap-2 items-center">
                      <div><div className="text-sm font-medium">{it.description}</div><div className="text-xs text-zinc-500">{it.quantity} {it.unit}</div></div>
                      <Input type="number" placeholder="Unit ₹" value={quoteForm.lines[idx]?.unit_price ?? ""} onChange={e=>{const ls=[...quoteForm.lines]; ls[idx]={...ls[idx], unit_price: Number(e.target.value)||0}; setQuoteForm({...quoteForm, lines:ls, total_amount: ls.reduce((s,x)=>s+(x.unit_price||0)*(x.quantity_offered||0),0) });}} data-testid={`vp-price-${idx}`}/>
                      <Input type="number" value={quoteForm.lines[idx]?.quantity_offered ?? ""} onChange={e=>{const ls=[...quoteForm.lines]; ls[idx]={...ls[idx], quantity_offered: Number(e.target.value)||0}; setQuoteForm({...quoteForm, lines:ls, total_amount: ls.reduce((s,x)=>s+(x.unit_price||0)*(x.quantity_offered||0),0) });}}/>
                      <div className="text-right text-sm font-medium tabular-nums">{inr((quoteForm.lines[idx]?.unit_price||0) * (quoteForm.lines[idx]?.quantity_offered||0), activeRfq.currency)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  <div><Label>Delivery days</Label><Input type="number" value={quoteForm.delivery_days} onChange={e=>setQuoteForm({...quoteForm, delivery_days: Number(e.target.value)||0})} data-testid="vp-delivery"/></div>
                  <div><Label>Validity (days)</Label><Input type="number" value={quoteForm.validity_days} onChange={e=>setQuoteForm({...quoteForm, validity_days: Number(e.target.value)||30})}/></div>
                </div>
                <div><Label>Payment terms</Label><Input value={quoteForm.payment_terms} onChange={e=>setQuoteForm({...quoteForm, payment_terms: e.target.value})} placeholder="30 days credit / 50% advance"/></div>
                <div><Label>Notes</Label><Textarea rows={2} value={quoteForm.notes} onChange={e=>setQuoteForm({...quoteForm, notes: e.target.value})}/></div>
                <div className="text-right text-lg font-bold">Total: {inr(quoteForm.total_amount, activeRfq.currency)}</div>
              </div>
              <DialogFooter><Button variant="outline" onClick={()=>{setActiveRfq(null); setQuoteForm(null);}}>Cancel</Button><Button onClick={submitQuote} className="bg-orange-600 hover:bg-orange-700" data-testid="vp-submit-quote">Submit sealed quote</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
