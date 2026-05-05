import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Plus, Calendar, Check, X, ClockClockwise } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";
import { useAuth } from "../context/AuthContext";

const STATUS_CLR = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  used:     "bg-zinc-100 text-zinc-700 border-zinc-200",
  expired:  "bg-zinc-100 text-zinc-500 border-zinc-200",
};
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function CompOff() {
  const { user } = useAuth();
  const isAdmin = user && ["super_admin", "company_admin", "country_head", "region_head", "branch_manager"].includes(user.role);
  return (
    <AppShell title="Comp-Off">
      <Toaster richColors position="top-right"/>
      <Tabs defaultValue={isAdmin ? "queue" : "mine"} className="space-y-4">
        <TabsList className="bg-zinc-100">
          <TabsTrigger value="mine" data-testid="cmp-tab-mine">My Comp-Off</TabsTrigger>
          {isAdmin && <TabsTrigger value="queue" data-testid="cmp-tab-queue">Approval Queue</TabsTrigger>}
        </TabsList>
        <TabsContent value="mine"><MineTab/></TabsContent>
        {isAdmin && <TabsContent value="queue"><AdminTab/></TabsContent>}
      </Tabs>
    </AppShell>
  );
}

function MineTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ work_date: "", reason: "" });

  const load = async () => {
    try { const { data } = await api.get("/comp-off/credits"); setRows(data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.work_date || !form.reason) return toast.error("Date and reason required");
    try {
      await api.post("/comp-off/credits", form);
      toast.success("Comp-off requested");
      setOpen(false); setForm({ work_date: "", reason: "" }); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Failed"); }
  };

  return (
    <SectionCard title={`${rows.length} comp-off credits`}
      subtitle="Earn comp-off when you work on a holiday or weekend. Approved credits can be used as leave."
      testid="section-mine"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-9" data-testid="cmp-new-btn"><Plus size={14}/>Request comp-off</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request comp-off credit</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div><Label>Worked on (off-day) *</Label>
                <Input type="date" className="mt-1" value={form.work_date} onChange={e => setForm({...form, work_date: e.target.value})} data-testid="cmp-date"/>
              </div>
              <div><Label>Reason *</Label>
                <Textarea rows={3} className="mt-1" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
                  placeholder="e.g. weekend deployment for client launch" data-testid="cmp-reason"/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} data-testid="cmp-submit">Submit for approval</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }>
      {rows.length === 0 ? (
        <div className="border border-dashed border-zinc-200 rounded-lg py-12 text-center text-sm text-zinc-500" data-testid="cmp-empty">
          No comp-off requests yet. Click "Request comp-off" if you worked on a weekend or holiday.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="py-2 px-3">Worked on</th><th>Reason</th><th>Status</th><th>Expires</th><th>Decided by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-zinc-100" data-testid={`cmp-row-${r.id}`}>
                  <td className="py-2 px-3 font-medium">{fmtDate(r.work_date)}</td>
                  <td className="text-zinc-700 text-xs max-w-xs truncate">{r.reason}</td>
                  <td><Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_CLR[r.status] || ""}`}>{r.status}</Badge></td>
                  <td className="text-xs text-zinc-500">{fmtDate(r.expires_on)}</td>
                  <td className="text-xs text-zinc-500">{r.decided_by_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function AdminTab() {
  const [rows, setRows] = useState([]);
  const load = async () => {
    try { const { data } = await api.get("/comp-off/credits?status=pending"); setRows(data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const decide = async (cid, action, reason = "") => {
    try {
      await api.post(`/comp-off/credits/${cid}/${action}`, { reason });
      toast.success(`${action === "approve" ? "Approved" : "Rejected"}`);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <SectionCard title={`${rows.length} pending`} subtitle="Review and approve comp-off credit requests" testid="section-queue">
      {rows.length === 0 ? (
        <div className="border border-dashed border-emerald-200 bg-emerald-50/50 rounded-lg py-10 text-center text-sm text-emerald-800" data-testid="cmp-queue-empty">
          ✓ No pending comp-off requests.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="py-2 px-3">Employee</th><th>Worked on</th><th>Reason</th><th className="text-right pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-zinc-100" data-testid={`cmpq-row-${r.id}`}>
                  <td className="py-2 px-3 font-medium">{r.employee_name}<div className="text-xs text-zinc-500">{r.employee_code}</div></td>
                  <td className="text-zinc-700">{fmtDate(r.work_date)}</td>
                  <td className="text-zinc-700 text-xs max-w-md truncate">{r.reason}</td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="outline" className="h-7 mr-1 gap-1 text-xs text-emerald-700" onClick={() => decide(r.id, "approve")} data-testid={`cmp-approve-${r.id}`}>
                      <Check size={11}/>Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-red-600" onClick={() => decide(r.id, "reject")} data-testid={`cmp-reject-${r.id}`}>
                      <X size={11}/>Reject
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
