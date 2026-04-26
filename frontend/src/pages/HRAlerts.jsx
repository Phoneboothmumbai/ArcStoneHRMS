import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Cake, Sparkle, Briefcase, CurrencyInr, Megaphone, Bell, Clock, Check, X, ArrowsClockwise, Gear } from "@phosphor-icons/react";
import { toast } from "sonner";

const KIND_META = {
  probation_completion:    { icon: Briefcase, label: "Probation",    color: "violet" },
  salary_review_due:       { icon: CurrencyInr, label: "Salary review", color: "emerald" },
  employee_birthday:       { icon: Cake,        label: "Birthday",     color: "pink" },
  festival_greeting:       { icon: Sparkle,     label: "Festival",     color: "amber" },
  new_joiner_announcement: { icon: Megaphone,   label: "New joiner",   color: "sky" },
  compliance_bulletin:     { icon: Bell,        label: "Compliance",   color: "rose" },
};

const COLOR = {
  violet:  { bg: "bg-violet-50",  border: "border-violet-200",  icon: "text-violet-600",  pill: "bg-violet-100 text-violet-700" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
  pink:    { bg: "bg-pink-50",    border: "border-pink-200",    icon: "text-pink-600",    pill: "bg-pink-100 text-pink-700" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   icon: "text-amber-600",   pill: "bg-amber-100 text-amber-700" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-200",     icon: "text-sky-600",     pill: "bg-sky-100 text-sky-700" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    icon: "text-rose-600",    pill: "bg-rose-100 text-rose-700" },
};

const TABS = [
  { k: "open",      l: "Open" },
  { k: "snoozed",   l: "Snoozed" },
  { k: "done",      l: "Completed" },
  { k: "dismissed", l: "Dismissed" },
];

export default function HRAlerts() {
  const [tab, setTab] = useState("open");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [decideAlert, setDecideAlert] = useState(null);
  const [decideForm, setDecideForm] = useState({ decision: "", remind_on: "", new_ctc_annual: "", revised_reason: "", note: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/lifecycle/alerts?status=${tab}&limit=200`);
      setAlerts(r.data);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const scan = async () => {
    setScanning(true);
    try {
      const r = await api.post("/lifecycle/scan");
      const c = r.data.created || {};
      const total = (c.probation || 0) + (c.salary_review || 0) + (c.birthday || 0) + (c.festival || 0);
      toast.success(`Scan complete · ${total} new alerts`);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
    finally { setScanning(false); }
  };

  const openDecide = (a, defaultDecision = "") => {
    setDecideAlert(a);
    setDecideForm({ decision: defaultDecision, remind_on: "", new_ctc_annual: "", revised_reason: "", note: "" });
  };

  const submitDecide = async () => {
    if (!decideForm.decision) { toast.error("Pick a decision"); return; }
    if (decideForm.decision === "later" && !decideForm.remind_on) { toast.error("Pick a remind date"); return; }
    if (decideAlert.kind === "salary_review_due" && decideForm.decision === "yes" && !decideForm.new_ctc_annual) {
      toast.error("Enter the new annual CTC"); return;
    }
    try {
      const payload = { decision: decideForm.decision };
      if (decideForm.decision === "later") payload.remind_on = decideForm.remind_on;
      if (decideAlert.kind === "salary_review_due" && decideForm.decision === "yes") {
        payload.new_ctc_annual = Number(decideForm.new_ctc_annual);
        if (decideForm.revised_reason) payload.revised_reason = decideForm.revised_reason;
      }
      if (decideForm.note) payload.note = decideForm.note;
      const r = await api.post(`/lifecycle/alerts/${decideAlert.id}/decide`, payload);
      const ex = r.data.__extras || {};
      if (ex.letter_id) toast.success("Decision saved · employment letter generated");
      else if (ex.new_salary_id) toast.success("Decision saved · compensation revised");
      else toast.success("Decision saved");
      setDecideAlert(null); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const counts = useMemo(() => {
    const m = { open: 0, snoozed: 0, done: 0, dismissed: 0 };
    alerts.forEach(a => { if (m[a.status] != null) m[a.status]++; });
    return m;
  }, [alerts]);

  return (
    <AppShell title="HR Alerts">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-1 border-b border-zinc-200">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              data-testid={`hr-alerts-tab-${t.k}`}
              className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${tab === t.k ? "border-zinc-950 text-zinc-950 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}>
              {t.l}
              {tab === t.k && alerts.length > 0 && <Badge variant="outline" className="ml-1.5 text-[10px]">{alerts.length}</Badge>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} data-testid="hr-alerts-settings"><Gear size={14} className="mr-1.5"/> Settings</Button>
          <Button size="sm" onClick={scan} disabled={scanning} data-testid="hr-alerts-scan" className="gap-1.5">
            <ArrowsClockwise size={14} weight={scanning ? "fill" : "bold"} className={scanning ? "animate-spin" : ""}/>
            {scanning ? "Scanning…" : "Run scan"}
          </Button>
        </div>
      </div>

      {loading && <div className="text-sm text-zinc-500 py-8 text-center">Loading…</div>}
      {!loading && alerts.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-200 py-16 text-center">
          <Bell size={32} className="text-zinc-300 mx-auto mb-3"/>
          <div className="text-sm text-zinc-500">No {tab} alerts.</div>
          {tab === "open" && (
            <Button size="sm" variant="outline" className="mt-4" onClick={scan} disabled={scanning}>
              <ArrowsClockwise size={14} className="mr-1.5"/> Run a scan now
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {alerts.map(a => <AlertCard key={a.id} a={a} onDecide={openDecide}/>)}
      </div>

      {/* Decision dialog */}
      <Dialog open={!!decideAlert} onOpenChange={v => !v && setDecideAlert(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{decideAlert?.title}</DialogTitle></DialogHeader>
          {decideAlert && <div className="space-y-4 py-2">
            <p className="text-sm text-zinc-600">{decideAlert.body}</p>

            <div>
              <Label className="text-xs uppercase text-zinc-500 tracking-wide">Decision</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {["yes", "no", "later", "dismiss"].map(d => (
                  <button key={d} type="button"
                    onClick={() => setDecideForm({ ...decideForm, decision: d })}
                    data-testid={`decide-${d}`}
                    className={`px-3 py-2 rounded border text-sm capitalize transition-colors ${decideForm.decision === d ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 hover:border-zinc-400"}`}>
                    {d === "later" ? "Remind later" : d}
                  </button>
                ))}
              </div>
            </div>

            {decideForm.decision === "later" && (
              <div>
                <Label>Remind on</Label>
                <Input type="date" className="mt-1" value={decideForm.remind_on}
                  onChange={e => setDecideForm({ ...decideForm, remind_on: e.target.value })}
                  data-testid="decide-remind-on"/>
              </div>
            )}

            {decideAlert.kind === "salary_review_due" && decideForm.decision === "yes" && (
              <>
                <div className="rounded bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                  Current CTC: <b>₹{(decideAlert.payload?.current_ctc || 0).toLocaleString("en-IN")}</b> ·
                  Years completed: <b>{decideAlert.payload?.years_completed}</b>
                </div>
                <div>
                  <Label>New annual CTC (INR) *</Label>
                  <Input type="number" className="mt-1" value={decideForm.new_ctc_annual}
                    onChange={e => setDecideForm({ ...decideForm, new_ctc_annual: e.target.value })}
                    placeholder="e.g. 1800000" data-testid="decide-new-ctc"/>
                </div>
                <div>
                  <Label>Reason for revision</Label>
                  <Input className="mt-1" value={decideForm.revised_reason}
                    onChange={e => setDecideForm({ ...decideForm, revised_reason: e.target.value })}
                    placeholder="Annual increment 2026" data-testid="decide-reason"/>
                </div>
              </>
            )}

            <div>
              <Label>Note (optional)</Label>
              <Input className="mt-1" value={decideForm.note}
                onChange={e => setDecideForm({ ...decideForm, note: e.target.value })}
                placeholder="Internal note for the audit log"
                data-testid="decide-note"/>
            </div>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecideAlert(null)}>Cancel</Button>
            <Button onClick={submitDecide} data-testid="decide-submit">Submit decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen}/>
    </AppShell>
  );
}

function AlertCard({ a, onDecide }) {
  const meta = KIND_META[a.kind] || { icon: Bell, label: a.kind, color: "violet" };
  const c = COLOR[meta.color];
  const Icon = meta.icon;
  const isOpen = a.status === "open";
  const isSnoozed = a.status === "snoozed";

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-4 transition-shadow hover:shadow-sm`}
      data-testid={`alert-card-${a.kind}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-none w-9 h-9 rounded-md bg-white flex items-center justify-center ${c.icon}`}>
          <Icon size={18} weight="bold"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={`text-[10px] uppercase ${c.pill} border-transparent`}>{meta.label}</Badge>
            {a.due_date && <span className="text-[11px] text-zinc-500">due {a.due_date}</span>}
            {isSnoozed && <span className="text-[11px] text-amber-700 inline-flex items-center gap-1"><Clock size={11}/> until {a.snoozed_until}</span>}
            {a.result && a.status === "done" && <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1"><Check size={11} weight="bold"/> {a.result}</span>}
          </div>
          <h3 className="font-semibold text-sm text-zinc-900 truncate">{a.title}</h3>
          <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{a.body}</p>
          {a.payload?.current_ctc != null && (
            <div className="mt-2 text-xs text-zinc-500">
              Current CTC: ₹{(a.payload.current_ctc || 0).toLocaleString("en-IN")}
            </div>
          )}
          {(isOpen || isSnoozed) && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" onClick={() => onDecide(a, "yes")} data-testid={`alert-yes-${a.id}`}><Check size={13} weight="bold" className="mr-1"/>Yes</Button>
              <Button size="sm" variant="outline" onClick={() => onDecide(a, "no")} data-testid={`alert-no-${a.id}`}><X size={13} className="mr-1"/>No</Button>
              <Button size="sm" variant="outline" onClick={() => onDecide(a, "later")} data-testid={`alert-later-${a.id}`}><Clock size={13} className="mr-1"/>Later</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({ open, onOpenChange }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    if (open) { api.get("/lifecycle/settings").then(r => setS(r.data)).catch(() => {}); }
  }, [open]);

  const save = async () => {
    try {
      await api.put("/lifecycle/settings", {
        probation_months: Number(s.probation_months),
        salary_review_months: Number(s.salary_review_months),
        send_birthday_wishes: !!s.send_birthday_wishes,
        birthday_message_template: s.birthday_message_template,
        festivals: s.festivals,
        new_joiner_default_scope: s.new_joiner_default_scope,
      });
      toast.success("Settings saved");
      onOpenChange(false);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const toggleFest = (idx) => setS({ ...s, festivals: s.festivals.map((f, i) => i === idx ? { ...f, active: !(f.active ?? true) } : f) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Lifecycle alert settings</DialogTitle></DialogHeader>
        {!s ? <div className="py-6 text-sm text-zinc-500">Loading…</div> : (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Probation period (months)</Label>
                <Input type="number" className="mt-1" value={s.probation_months}
                  onChange={e => setS({ ...s, probation_months: e.target.value })} data-testid="settings-probation"/>
              </div>
              <div>
                <Label>Salary review cadence (months)</Label>
                <Input type="number" className="mt-1" value={s.salary_review_months}
                  onChange={e => setS({ ...s, salary_review_months: e.target.value })} data-testid="settings-salary-review"/>
              </div>
            </div>
            <div>
              <Label>New joiner default broadcast scope</Label>
              <Select value={s.new_joiner_default_scope}
                onValueChange={v => setS({ ...s, new_joiner_default_scope: v })}>
                <SelectTrigger className="mt-1" data-testid="settings-scope"><SelectValue/></SelectTrigger>
                <SelectContent>
                  {["company", "department", "branch", "team"].map(x =>
                    <SelectItem key={x} value={x}>{x}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pt-2">
              <input type="checkbox" checked={!!s.send_birthday_wishes}
                onChange={e => setS({ ...s, send_birthday_wishes: e.target.checked })}/>
              Send automatic birthday wishes
            </label>
            <div>
              <Label>Birthday message template</Label>
              <Input className="mt-1" value={s.birthday_message_template}
                onChange={e => setS({ ...s, birthday_message_template: e.target.value })}/>
              <p className="text-[11px] text-zinc-500 mt-1">Use <code>{`{{name}}`}</code> to substitute the employee's name.</p>
            </div>
            <div>
              <Label>Festivals (auto-greetings)</Label>
              <div className="mt-2 space-y-2">
                {(s.festivals || []).map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 border border-zinc-200 rounded">
                    <input type="checkbox" checked={f.active ?? true} onChange={() => toggleFest(idx)}/>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-zinc-500">{f.message}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono-alt">{f.date_pattern}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!s} data-testid="settings-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
