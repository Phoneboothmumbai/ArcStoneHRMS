import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Plus, Trash, MapPin, Users, Door, Car, ProjectorScreen, Desktop } from "@phosphor-icons/react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

const TYPES = [
  { v: "meeting_room", label: "Meeting room", icon: Door },
  { v: "vehicle",      label: "Vehicle",      icon: Car },
  { v: "equipment",    label: "Equipment",    icon: ProjectorScreen },
  { v: "desk",         label: "Hot desk",     icon: Desktop },
  { v: "other",        label: "Other",        icon: MapPin },
];

const fmtTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function ResourceBooking() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "company_admin", "country_head", "region_head"].includes(user?.role);
  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResForm, setShowResForm] = useState(false);
  const [showBookForm, setShowBookForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([
        api.get("/resources"),
        api.get("/resource-bookings", { params: { from_date: new Date(Date.now() - 86400000).toISOString() } }),
      ]);
      setResources(r.data || []);
      setBookings(b.data || []);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const activeRes = resources.filter(r => r.active !== false);

  return (
    <AppShell title="Resource booking">
      <div className="space-y-5" data-testid="rb-root">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-zinc-500 max-w-2xl">
            Book meeting rooms, vehicles, projectors, or any shared resource. First-come-first-served — overlapping bookings are blocked automatically.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setShowBookForm(true)} className="bg-zinc-950 hover:bg-zinc-800 gap-1.5" data-testid="rb-new-booking-btn"><Plus size={14} weight="bold"/>New booking</Button>
            {isAdmin && (
              <Button variant="outline" onClick={() => setShowResForm(true)} data-testid="rb-new-resource-btn">+ Add resource</Button>
            )}
          </div>
        </div>

        <SectionCard title="Resources" subtitle={`${activeRes.length} available`} testid="rb-resources-section">
          {loading ? (
            <div className="text-zinc-500 text-sm">Loading…</div>
          ) : activeRes.length === 0 ? (
            <div className="text-center py-10 text-zinc-400">
              <MapPin size={36} className="mx-auto mb-2 opacity-40" weight="duotone"/>
              <div className="text-sm">No resources yet.</div>
              {isAdmin && <Button variant="outline" onClick={() => setShowResForm(true)} className="mt-3">+ Add your first resource</Button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="rb-resources-grid">
              {activeRes.map(r => {
                const Icon = TYPES.find(t => t.v === r.resource_type)?.icon || MapPin;
                const upcoming = bookings.filter(b => b.resource_id === r.id && new Date(b.starts_at) >= new Date()).slice(0, 3);
                return (
                  <div key={r.id} className="border border-zinc-200 rounded-lg p-4 bg-white hover:border-zinc-300 transition" data-testid={`rb-resource-${r.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ backgroundColor: (r.color || "#3b82f6") + "22" }}>
                        <Icon size={18} weight="duotone" style={{ color: r.color || "#3b82f6" }}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{r.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{TYPES.find(t => t.v === r.resource_type)?.label}{r.location ? ` · ${r.location}` : ""}{r.capacity ? ` · ${r.capacity} cap` : ""}</div>
                      </div>
                      {isAdmin && (
                        <button onClick={() => deleteResource(r.id, load)} className="text-zinc-400 hover:text-red-600" data-testid={`rb-delete-${r.id}`}><Trash size={14}/></button>
                      )}
                    </div>
                    {upcoming.length > 0 ? (
                      <div className="mt-3 pt-3 border-t border-zinc-100 space-y-1">
                        <div className="tiny-label">Next bookings</div>
                        {upcoming.map(b => (
                          <div key={b.id} className="text-xs text-zinc-600 flex items-center justify-between gap-2">
                            <span className="truncate">{b.created_by_name}</span>
                            <span className="text-zinc-400 whitespace-nowrap">{fmtTime(b.starts_at)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-emerald-600 font-medium">Available now</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Upcoming bookings" subtitle={`${bookings.length} in the next 30 days`} testid="rb-bookings-section">
          {bookings.length === 0 ? (
            <div className="text-zinc-400 text-sm py-6 text-center">No upcoming bookings.</div>
          ) : (
            <div className="divide-y divide-zinc-100" data-testid="rb-bookings-list">
              {bookings.map(b => (
                <div key={b.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{b.resource_name}</div>
                    <div className="text-xs text-zinc-500 truncate">{b.purpose || "—"} · by {b.created_by_name}</div>
                  </div>
                  <div className="text-xs text-zinc-700 whitespace-nowrap">{fmtTime(b.starts_at)} → {new Date(b.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  {(b.created_by === user?.id || isAdmin) && (
                    <button onClick={() => cancelBooking(b.id, load)} className="text-zinc-400 hover:text-red-600 text-xs ml-2" data-testid={`rb-cancel-${b.id}`}>Cancel</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {showResForm && <NewResourceModal onClose={() => setShowResForm(false)} onCreated={() => { setShowResForm(false); load(); }} />}
        {showBookForm && <NewBookingModal resources={activeRes} onClose={() => setShowBookForm(false)} onCreated={() => { setShowBookForm(false); load(); }} />}
      </div>
    </AppShell>
  );
}

async function deleteResource(rid, reload) {
  if (!window.confirm("Deactivate this resource? Existing bookings will remain visible.")) return;
  try { await api.delete(`/resources/${rid}`); toast.success("Resource removed."); reload(); }
  catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
}

async function cancelBooking(bid, reload) {
  if (!window.confirm("Cancel this booking?")) return;
  try { await api.delete(`/resource-bookings/${bid}`); toast.success("Booking cancelled."); reload(); }
  catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
}

function NewResourceModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("meeting_room");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return toast.error("Name required");
    setBusy(true);
    try {
      await api.post("/resources", { name: name.trim(), resource_type: type, location: location.trim() || null, capacity: capacity ? parseInt(capacity, 10) : null });
      toast.success("Resource added");
      onCreated();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Add resource" onClose={onClose}>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Conference Room A" data-testid="rb-form-name"/></Field>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-zinc-300 rounded-md h-10 px-3 text-sm bg-white" data-testid="rb-form-type">
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Floor 4" data-testid="rb-form-location"/></Field>
        <Field label="Capacity"><Input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} data-testid="rb-form-capacity"/></Field>
      </div>
      <ModalActions onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Add"/>
    </Modal>
  );
}

function NewBookingModal({ resources, onClose, onCreated }) {
  const [resource_id, setRid] = useState(resources[0]?.id || "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!resource_id) return toast.error("Pick a resource");
    if (start >= end) return toast.error("End time must be after start");
    setBusy(true);
    try {
      await api.post("/resource-bookings", {
        resource_id,
        starts_at: new Date(`${date}T${start}:00`).toISOString(),
        ends_at: new Date(`${date}T${end}:00`).toISOString(),
        purpose: purpose.trim() || null,
      });
      toast.success("Booked!");
      onCreated();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Book a resource" onClose={onClose}>
      <Field label="Resource">
        <select value={resource_id} onChange={(e) => setRid(e.target.value)} className="w-full border border-zinc-300 rounded-md h-10 px-3 text-sm bg-white" data-testid="rb-book-resource">
          {resources.map(r => <option key={r.id} value={r.id}>{r.name} {r.location ? `(${r.location})` : ""}</option>)}
        </select>
      </Field>
      <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="rb-book-date"/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} data-testid="rb-book-start"/></Field>
        <Field label="To"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="rb-book-end"/></Field>
      </div>
      <Field label="Purpose (optional)"><Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Sprint planning, client call..." data-testid="rb-book-purpose"/></Field>
      <ModalActions onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Book"/>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="rb-modal">
        <h3 className="font-semibold text-base">{title}</h3>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSubmit, busy, submitLabel }) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button onClick={onSubmit} disabled={busy} className="bg-zinc-950 hover:bg-zinc-800" data-testid="rb-modal-submit">{busy ? "Saving…" : submitLabel}</Button>
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
