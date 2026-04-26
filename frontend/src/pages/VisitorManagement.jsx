import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Plus, Camera, SignOut, UserCheck, Phone, Buildings } from "@phosphor-icons/react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

const ID_TYPES = ["aadhaar", "driving_license", "passport", "voter_id", "company_id", "other"];

const fmtTime = (iso) => iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "";
const durationMin = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

export default function VisitorManagement() {
  const { user } = useAuth();
  const [today, setToday] = useState({ counts: { checked_in: 0, checked_out: 0, total: 0 }, rows: [] });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/visitors/today");
      setToday(r.data || { counts: {}, rows: [] });
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  const checkout = async (vid) => {
    if (!window.confirm("Sign this visitor out?")) return;
    try { await api.post(`/visitors/${vid}/checkout`, {}); toast.success("Checked out."); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
  };

  return (
    <AppShell title="Visitor management">
      <div className="space-y-5" data-testid="vm-root">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-zinc-500">Front-desk check-in. Hosts get notified instantly when their visitor arrives.</p>
          <Button onClick={() => setShow(true)} className="bg-zinc-950 hover:bg-zinc-800 gap-1.5" data-testid="vm-checkin-btn">
            <Plus size={14} weight="bold"/>Check in visitor
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="On premises now" value={today.counts.checked_in || 0} tone="emerald" testid="vm-stat-here"/>
          <Stat label="Signed out today" value={today.counts.checked_out || 0} tone="zinc" testid="vm-stat-out"/>
          <Stat label="Total today" value={today.counts.total || 0} tone="blue" testid="vm-stat-total"/>
        </div>

        <SectionCard title="Today's visitors" subtitle="Auto-refreshes every 30 s" testid="vm-list">
          {loading ? <div className="text-zinc-500 text-sm">Loading…</div>
          : today.rows.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <UserCheck size={36} className="mx-auto mb-2 opacity-40" weight="duotone"/>
              <div className="text-sm">No visitors today.</div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {today.rows.map(v => (
                <div key={v.id} className="py-3 flex items-center justify-between gap-3 flex-wrap" data-testid={`vm-visitor-${v.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{v.name}</span>
                      {v.company && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Buildings size={11}/>{v.company}</span>}
                      <StatusBadge status={v.status}/>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">
                      Host: <b className="text-zinc-700">{v.host_employee_name}</b>
                      {v.purpose ? ` · ${v.purpose}` : ""}
                      {v.phone ? <> · <Phone size={10} className="inline"/>{v.phone}</> : null}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-1">
                      In {fmtTime(v.checked_in_at)}
                      {v.checked_out_at && ` · Out ${fmtTime(v.checked_out_at)} (${durationMin(v.checked_in_at, v.checked_out_at)} min)`}
                      {v.badge_no && ` · Badge #${v.badge_no}`}
                    </div>
                  </div>
                  {v.status === "checked_in" && (
                    <Button variant="outline" size="sm" onClick={() => checkout(v.id)} className="text-red-600 border-red-200 hover:bg-red-50 gap-1" data-testid={`vm-checkout-${v.id}`}>
                      <SignOut size={13}/>Sign out
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {show && <CheckinModal onClose={() => setShow(false)} onCreated={() => { setShow(false); load(); }}/>}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone, testid }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    blue:    "border-blue-200 bg-blue-50 text-blue-900",
    zinc:    "border-zinc-200 bg-white text-zinc-900",
  };
  return (
    <div className={`rounded-md border p-4 ${tones[tone]}`} data-testid={testid}>
      <div className="text-xs uppercase tracking-wide opacity-70 font-semibold">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const tints = {
    checked_in:  { bg: "bg-emerald-100", fg: "text-emerald-700", l: "On premises" },
    checked_out: { bg: "bg-zinc-100",    fg: "text-zinc-600",    l: "Signed out" },
  };
  const t = tints[status] || tints.checked_in;
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.bg} ${t.fg}`}>{t.l}</span>;
}

function CheckinModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [host, setHost] = useState("");
  const [hostQuery, setHostQuery] = useState("");
  const [hostResults, setHostResults] = useState([]);
  const [hostName, setHostName] = useState("");
  const [idType, setIdType] = useState("aadhaar");
  const [idLast4, setIdLast4] = useState("");
  const [badgeNo, setBadgeNo] = useState("");
  const [photo, setPhoto] = useState(null);   // dataURL
  const [busy, setBusy] = useState(false);

  // Type-ahead employee search
  useEffect(() => {
    const q = hostQuery.trim();
    if (q.length < 2) { setHostResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get("/employees", { params: { q, limit: 10 } });
        setHostResults(r.data || []);
      } catch { setHostResults([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [hostQuery]);

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500 * 1024) return toast.error("Photo too large (≤ 500 KB).");
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!name.trim()) return toast.error("Visitor name required");
    if (!host) return toast.error("Pick the host employee");
    setBusy(true);
    try {
      await api.post("/visitors", {
        name: name.trim(),
        company: company.trim() || null,
        phone: phone.trim() || null,
        purpose: purpose.trim() || null,
        host_employee_id: host,
        photo_base64: photo,
        id_proof_type: idType,
        id_proof_last4: idLast4.trim() || null,
        badge_no: badgeNo.trim() || null,
      });
      toast.success("Visitor checked in. Host notified.");
      onCreated();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="vm-modal">
        <h3 className="font-semibold text-base">Check in a visitor</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Visitor name *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-testid="vm-form-name"/></Field>
          <Field label="Company"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" data-testid="vm-form-company"/></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" data-testid="vm-form-phone"/></Field>
          <Field label="Badge #"><Input value={badgeNo} onChange={(e) => setBadgeNo(e.target.value)} placeholder="V-042" data-testid="vm-form-badge"/></Field>
        </div>

        <Field label="Host employee *">
          <Input value={hostName || hostQuery} onChange={(e) => { setHostQuery(e.target.value); setHostName(""); setHost(""); }}
            placeholder="Type to search…" data-testid="vm-form-host"/>
          {hostResults.length > 0 && !hostName && (
            <div className="mt-1 border border-zinc-200 rounded-md bg-white shadow-sm max-h-44 overflow-y-auto">
              {hostResults.map(e => (
                <button type="button" key={e.id} onClick={() => { setHost(e.id); setHostName(e.name); setHostResults([]); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 border-b border-zinc-100 last:border-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-zinc-500 ml-2">{e.designation || e.email}</span>
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Purpose"><Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Interview, vendor meeting, client visit..." data-testid="vm-form-purpose"/></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ID proof">
            <select value={idType} onChange={(e) => setIdType(e.target.value)} className="w-full border border-zinc-300 rounded-md h-10 px-3 text-sm bg-white">
              {ID_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="Last 4 digits"><Input value={idLast4} maxLength="4" onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, ''))} placeholder="1234" data-testid="vm-form-id4"/></Field>
        </div>

        <Field label="Photo (optional)">
          <div className="flex items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 h-10 border border-zinc-300 rounded-md text-sm hover:bg-zinc-50">
              <Camera size={14}/>{photo ? "Change" : "Capture"}
              <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" data-testid="vm-form-photo"/>
            </label>
            {photo && <img src={photo} alt="Visitor" className="w-12 h-12 rounded-md object-cover border border-zinc-200"/>}
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" data-testid="vm-form-submit">{busy ? "Checking in…" : "Check in & notify host"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="tiny-label mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
