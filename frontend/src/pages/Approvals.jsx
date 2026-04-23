import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { toast, Toaster } from "sonner";
import { CheckCircle, XCircle, ArrowDown, User } from "@phosphor-icons/react";

export default function Approvals() {
  const [inbox, setInbox] = useState([]);
  const [mine, setMine] = useState([]);

  const load = async () => {
    const [i, m] = await Promise.all([api.get("/approvals?status=all"), api.get("/approvals/mine")]);
    setInbox(i.data); setMine(m.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <AppShell title="Approvals">
      <Toaster richColors />
      <Tabs defaultValue="inbox" className="w-full" data-testid="approvals-tabs">
        <TabsList>
          <TabsTrigger value="inbox" data-testid="tab-inbox">Inbox ({inbox.filter(a => a.is_my_turn).length})</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-mine">Submitted ({mine.length})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All I'm involved in ({inbox.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <ApprovalsList items={inbox.filter(a => a.is_my_turn)} canAct onRefresh={load} empty="Inbox zero." />
        </TabsContent>
        <TabsContent value="mine">
          <ApprovalsList items={mine} onRefresh={load} empty="You haven't submitted anything." />
        </TabsContent>
        <TabsContent value="all">
          <ApprovalsList items={inbox} onRefresh={load} empty="Nothing here." />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ApprovalsList({ items, canAct, onRefresh, empty }) {
  if (!items.length) return <div className="py-12 text-center text-zinc-500" data-testid="approvals-empty">{empty}</div>;
  return (
    <div className="space-y-4 mt-4">
      {items.map((a) => (
        <ApprovalCard key={a.id} ap={a} canAct={canAct && a.is_my_turn} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function ApprovalCard({ ap, canAct, onRefresh }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // 'approve' | 'reject'

  const decide = async (decision) => {
    setBusy(true);
    try {
      await api.post(`/approvals/${ap.id}/decide`, { decision, comment });
      toast.success(`Request ${decision === "approve" ? "approved" : "rejected"}`);
      setOpen(null); setComment("");
      onRefresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6" data-testid={`approval-card-${ap.id}`}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={ap.status} />
            <Badge variant="outline" className="uppercase text-[10px]">{ap.request_type.replace("_", " ")}</Badge>
            <span className="text-xs text-zinc-500">Step {ap.current_step} of {ap.steps.length}</span>
          </div>
          <div className="font-display font-semibold text-lg mt-3">{ap.title}</div>
          <div className="text-sm text-zinc-600 mt-1">Raised by {ap.requester_name} · {new Date(ap.created_at).toLocaleDateString()}</div>
        </div>
        {canAct && ap.status === "pending" && (
          <div className="flex gap-2 shrink-0" data-testid={`approval-actions-${ap.id}`}>
            <Dialog open={open === "reject"} onOpenChange={(v) => setOpen(v ? "reject" : null)}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-md border-zinc-300" data-testid={`reject-btn-${ap.id}`}>
                  <XCircle size={16} className="mr-1.5" /> Reject
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
                <Textarea placeholder="Reason for rejection" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="reject-comment" />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
                  <Button disabled={busy} className="bg-red-600 hover:bg-red-700 text-white" onClick={() => decide("reject")} data-testid="reject-confirm">Confirm reject</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={open === "approve"} onOpenChange={(v) => setOpen(v ? "approve" : null)}>
              <DialogTrigger asChild>
                <Button className="bg-zinc-950 hover:bg-zinc-800 rounded-md" data-testid={`approve-btn-${ap.id}`}>
                  <CheckCircle size={16} className="mr-1.5" /> Approve
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Approve request</DialogTitle></DialogHeader>
                <Textarea placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="approve-comment" />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
                  <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => decide("approve")} data-testid="approve-confirm">Confirm approval</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Approval timeline */}
      <div className="mt-6 border-t border-zinc-100 pt-5" data-testid={`approval-timeline-${ap.id}`}>
        <div className="tiny-label">Approval chain</div>
        <ol className="mt-3 space-y-3">
          {ap.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                s.status === "approved" ? "bg-emerald-500 text-white" :
                s.status === "rejected" ? "bg-red-500 text-white" :
                s.step === ap.current_step && ap.status === "pending" ? "bg-zinc-950 text-white" :
                "bg-zinc-100 text-zinc-500 border border-zinc-200"
              }`}>
                {s.status === "approved" ? "✓" : s.status === "rejected" ? "✕" : s.step}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{s.approver_name}</div>
                <div className="text-xs text-zinc-500 capitalize">{s.approver_role.replace(/_/g, " ")} · <span className={`uppercase tracking-wider font-medium ${s.status === "approved" ? "text-emerald-600" : s.status === "rejected" ? "text-red-600" : "text-zinc-500"}`}>{s.status}</span></div>
                {s.comment && <div className="text-xs text-zinc-600 mt-1 italic">"{s.comment}"</div>}
              </div>
              {i < ap.steps.length - 1 && <ArrowDown size={12} className="text-zinc-300 mt-2" />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${map[status] || "bg-zinc-50 border-zinc-200 text-zinc-600"}`}>{status}</span>;
}
