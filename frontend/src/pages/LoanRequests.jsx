import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../context/AuthContext";
import { Handshake, Plus, Check, X } from "@phosphor-icons/react";
import { toast } from "sonner";

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function LoanRequests() {
  const { user } = useAuth();
  const isHR = ["super_admin", "company_admin", "country_head", "region_head"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("pending");
  const [openNew, setOpenNew] = useState(false);
  const [openDecide, setOpenDecide] = useState(null);
  const [decideForm, setDecideForm] = useState({ decision: "approve", interest_pct: 0, start_month: "", note: "" });
  const [newForm, setNewForm] = useState({ loan_type: "salary_advance", amount: "", tenure_months: 12, purpose: "" });

  const load = async () => {
    try { const r = await api.get(`/loan-requests?status=${tab}`); setRows(r.data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const submitNew = async () => {
    if (!newForm.amount || !newForm.purpose) { toast.error("Amount and purpose required"); return; }
    try {
      await api.post("/loan-requests", { ...newForm, amount: Number(newForm.amount) });
      toast.success("Loan request submitted");
      setOpenNew(false); setNewForm({ loan_type: "salary_advance", amount: "", tenure_months: 12, purpose: "" });
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const submitDecide = async () => {
    try {
      await api.post(`/loan-requests/${openDecide.id}/decide`, decideForm);
      toast.success(`Loan ${decideForm.decision}d`);
      setOpenDecide(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <AppShell title="Loan Requests">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1 border-b border-zinc-200">
          {["pending", "approved", "rejected"].map(t => (
            <button key={t} onClick={() => setTab(t)} data-testid={`loanreq-tab-${t}`}
              className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors capitalize ${tab === t ? "border-zinc-950 text-zinc-950 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}>{t}</button>
          ))}
        </div>
        {!isHR && (
          <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)} data-testid="loanreq-new-btn">
            <Plus size={14} weight="bold"/> Request a loan
          </Button>
        )}
      </div>

      <SectionCard title={`${rows.length} ${tab} request(s)`} testid="section-loanreq">
        {rows.length === 0 && <div className="text-sm text-zinc-500 py-6 text-center">No requests in this state.</div>}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead>
            <TableHead>Tenure</TableHead><TableHead>Purpose</TableHead><TableHead>Created</TableHead><TableHead/>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id} data-testid={`loanreq-row-${r.id}`}>
                <TableCell>
                  <div className="font-medium">{r.employee_name}</div>
                  <div className="text-xs text-zinc-500">{r.employee_code}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] capitalize">{r.loan_type.replace("_", " ")}</Badge></TableCell>
                <TableCell className="font-semibold">{inr(r.amount)}</TableCell>
                <TableCell>{r.tenure_months}mo</TableCell>
                <TableCell className="text-xs text-zinc-600 max-w-md truncate">{r.purpose}</TableCell>
                <TableCell className="text-xs font-mono-alt">{r.created_at?.slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  {isHR && r.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => { setOpenDecide(r); setDecideForm({ decision: "approve", interest_pct: 0, start_month: "", note: "" }); }} data-testid={`loanreq-decide-${r.id}`}>Decide</Button>
                  )}
                  {r.status === "approved" && r.loan_id && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 border-emerald-200 text-emerald-700">Loan #{r.loan_id.slice(0, 6)}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request a loan / advance</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Loan type</Label>
              <Select value={newForm.loan_type} onValueChange={v => setNewForm({ ...newForm, loan_type: v })}>
                <SelectTrigger className="mt-1" data-testid="loanreq-type"><SelectValue/></SelectTrigger>
                <SelectContent>
                  {["salary_advance", "personal", "medical", "housing", "other"].map(t =>
                    <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount (INR)</Label>
                <Input type="number" className="mt-1" value={newForm.amount} onChange={e => setNewForm({ ...newForm, amount: e.target.value })} data-testid="loanreq-amount"/>
              </div>
              <div><Label>Tenure (months)</Label>
                <Input type="number" className="mt-1" value={newForm.tenure_months} onChange={e => setNewForm({ ...newForm, tenure_months: Number(e.target.value) })}/>
              </div>
            </div>
            <div><Label>Purpose</Label>
              <Input className="mt-1" value={newForm.purpose} onChange={e => setNewForm({ ...newForm, purpose: e.target.value })} placeholder="e.g. Down payment for home renovation" data-testid="loanreq-purpose"/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={submitNew} data-testid="loanreq-submit"><Handshake size={14} className="mr-1.5"/>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openDecide} onOpenChange={v => !v && setOpenDecide(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decide loan request</DialogTitle></DialogHeader>
          {openDecide && <div className="space-y-3 py-2">
            <div className="rounded bg-zinc-50 p-3 text-sm">
              <b>{openDecide.employee_name}</b> · {inr(openDecide.amount)} for {openDecide.tenure_months}mo<br/>
              <span className="text-zinc-600">{openDecide.purpose}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {["approve", "reject"].map(d => (
                <button key={d} type="button" onClick={() => setDecideForm({ ...decideForm, decision: d })}
                  data-testid={`loanreq-decision-${d}`}
                  className={`px-4 py-2 rounded border text-sm capitalize ${decideForm.decision === d ? (d === "approve" ? "border-emerald-600 bg-emerald-600 text-white" : "border-red-600 bg-red-600 text-white") : "border-zinc-200"}`}>{d}</button>
              ))}
            </div>
            {decideForm.decision === "approve" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Interest %</Label>
                  <Input type="number" step="0.5" className="mt-1" value={decideForm.interest_pct} onChange={e => setDecideForm({ ...decideForm, interest_pct: Number(e.target.value) })}/>
                </div>
                <div><Label>Start month (YYYY-MM)</Label>
                  <Input type="month" className="mt-1" value={decideForm.start_month} onChange={e => setDecideForm({ ...decideForm, start_month: e.target.value })}/>
                </div>
              </div>
            )}
            <div><Label>Note</Label>
              <Input className="mt-1" value={decideForm.note} onChange={e => setDecideForm({ ...decideForm, note: e.target.value })}/>
            </div>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDecide(null)}>Cancel</Button>
            <Button onClick={submitDecide} data-testid="loanreq-decide-submit">{decideForm.decision === "approve" ? <><Check size={14} className="mr-1.5"/>Approve & create loan</> : <><X size={14} className="mr-1.5"/>Reject</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
