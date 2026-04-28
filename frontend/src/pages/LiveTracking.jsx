import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AppShell from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import {
  MapPin, ArrowClockwise, Warning, Clock, User, Path, X, MagnifyingGlass, ShieldCheck,
} from "@phosphor-icons/react";

// Fix Leaflet default icon issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Colored pulsing dot markers by status
const makeIcon = (color) => L.divIcon({
  className: "",
  html: `<div style="position:relative;width:22px;height:22px;">
    <div style="position:absolute;inset:0;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>
    <div style="position:absolute;inset:-6px;border:2px solid ${color};border-radius:50%;opacity:.6;animation:pulse 1.6s infinite"></div>
  </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const ICONS = {
  on_duty:    makeIcon("#10b981"),
  signed_out: makeIcon("#71717a"),
  offline:    makeIcon("#94a3b8"),
  breach:     makeIcon("#ef4444"),
};

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtDist = (m) => m == null ? "—" : (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points.length]);  // eslint-disable-line
  return null;
}

export default function LiveTracking() {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "company_admin", "country_head", "region_head"].includes(user?.role);
  const [live, setLive] = useState({ rows: [], count: 0 });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);       // employee_id
  const [trail, setTrail] = useState(null);             // { pings: [...] }
  const [trailDate, setTrailDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [breaches, setBreaches] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const mapRef = useRef(null);

  const load = async () => {
    setRefreshing(true);
    try {
      const [l, b] = await Promise.all([
        api.get("/admin/locations/live"),
        api.get("/admin/locations/breaches", { params: { limit: 20 } }).catch(() => ({ data: [] })),
      ]);
      setLive(l.data || { rows: [], count: 0 });
      setBreaches(b.data || []);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  // Load trail whenever a selection or date changes
  useEffect(() => {
    if (!selected) { setTrail(null); return; }
    api.get(`/admin/locations/trail/${selected}`, { params: { date: trailDate } })
       .then(r => setTrail(r.data))
       .catch(() => setTrail({ pings: [] }));
  }, [selected, trailDate]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return live.rows;
    return live.rows.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.employee_code || "").toLowerCase().includes(q) ||
      (r.designation || "").toLowerCase().includes(q) ||
      (r.branch_name || "").toLowerCase().includes(q)
    );
  }, [live.rows, query]);

  const withPos = filtered.filter(r => r.last_lat != null && r.last_lon != null);
  const markers = withPos.map(r => [r.last_lat, r.last_lon]);
  const selRow = live.rows.find(r => r.employee_id === selected);

  // Center map: India if nothing else
  const center = withPos.length > 0 ? [withPos[0].last_lat, withPos[0].last_lon] : [20.5937, 78.9629];

  const onDutyCount = live.rows.filter(r => r.status === "on_duty").length;
  const breachCount = breaches.filter(b => !b.read_at).length;

  return (
    <AppShell title="Live tracking">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)] min-h-[500px]" data-testid="lt-root">
        {/* Left sidebar — employee list + filters */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input placeholder="Search employees, branches..." value={query} onChange={(e) => setQuery(e.target.value)}
              className="flex-1" data-testid="lt-search"/>
            <Button variant="outline" size="sm" onClick={load} disabled={refreshing} data-testid="lt-refresh">
              <ArrowClockwise size={14} className={refreshing ? "animate-spin" : ""}/>
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <StatPill label="On duty"  value={onDutyCount} tone="bg-emerald-50 text-emerald-700 border-emerald-200"/>
            <StatPill label="Tracked"  value={live.count}  tone="bg-zinc-50 text-zinc-700 border-zinc-200"/>
            <StatPill label="Breaches" value={breachCount} tone={breachCount > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-zinc-50 text-zinc-500 border-zinc-200"}/>
          </div>

          <div className="border border-zinc-200 rounded-md bg-white overflow-y-auto flex-1" data-testid="lt-emp-list">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-sm px-3">
                <User size={28} className="mx-auto mb-2 opacity-40" weight="duotone"/>
                No tracked employees.<br/>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setShowFlagModal(true)} className="mt-3" data-testid="lt-flag-btn">
                    Flag employees for tracking
                  </Button>
                )}
              </div>
            ) : filtered.map(r => (
              <button key={r.employee_id} onClick={() => setSelected(r.employee_id)}
                className={`w-full text-left px-3 py-2 border-b border-zinc-100 last:border-0 flex items-center gap-2 hover:bg-zinc-50 ${selected === r.employee_id ? "bg-blue-50" : ""}`}
                data-testid={`lt-emp-${r.employee_id}`}>
                <div className="w-8 h-8 rounded-full bg-zinc-200 shrink-0 flex items-center justify-center overflow-hidden">
                  {r.photo_base64 ? <img src={`data:image/jpeg;base64,${r.photo_base64}`} className="w-full h-full object-cover" alt=""/> : <User size={14} className="text-zinc-500"/>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{r.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate flex items-center gap-1.5">
                    <StatusDot status={r.status}/>
                    <span>{r.status === "on_duty" ? `On duty · ${fmtTime(r.last_seen_at)}` : r.status === "signed_out" ? `Signed out ${fmtTime(r.checked_out_at)}` : "Not active today"}</span>
                  </div>
                </div>
                {r.distance_m != null && r.status === "on_duty" && (
                  <div className="text-[10px] font-mono text-zinc-500 whitespace-nowrap">{fmtDist(r.distance_m)}</div>
                )}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-zinc-400 leading-snug">
            🔒 Privacy: You only see employees flagged as "field tracked" AND (you're HR / their direct manager / explicitly listed as a viewer). Pings only exist during active work hours. Auto-purges after 90 days.
          </p>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowFlagModal(true)} className="gap-1.5" data-testid="lt-manage-tracked">
              <MapPin size={14}/>Manage tracked employees
            </Button>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative rounded-md overflow-hidden border border-zinc-200" data-testid="lt-map">
          <MapContainer ref={mapRef} center={center} zoom={5} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {withPos.map(r => {
              const breachIds = new Set(breaches.filter(b => !b.read_at).map(b => b.employee_id));
              const isBreach = breachIds.has(r.employee_id);
              return (
                <Marker key={r.employee_id} position={[r.last_lat, r.last_lon]} icon={isBreach ? ICONS.breach : ICONS[r.status]}
                  eventHandlers={{ click: () => setSelected(r.employee_id) }}>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-bold">{r.name}</div>
                      <div className="text-xs text-zinc-600 mb-1">{r.designation}</div>
                      <div className="text-xs">Last seen: <b>{fmtDate(r.last_seen_at)}</b></div>
                      <div className="text-xs">From office: <b>{fmtDist(r.distance_m)}</b></div>
                      {isBreach && <div className="text-xs text-red-600 font-semibold mt-1">⚠️ Geofence breach</div>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {/* Branch geofence circles */}
            {withPos.filter(r => r.branch_lat != null).map(r => (
              <Circle key={`fence-${r.employee_id}-${r.branch_id}`} center={[r.branch_lat, r.branch_lon]}
                radius={500} pathOptions={{ color: "#94a3b8", weight: 1, fillOpacity: 0.05 }}/>
            ))}
            {/* Selected employee's trail */}
            {trail?.pings?.length > 1 && (
              <Polyline positions={trail.pings.map(p => [p.latitude, p.longitude])}
                pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.75 }}/>
            )}
            <FitBounds points={markers}/>
          </MapContainer>
          {refreshing && (
            <div className="absolute top-2 right-2 bg-white/90 px-2.5 py-1 rounded-full text-[10px] font-semibold text-zinc-600 border border-zinc-200 z-[500]">
              Refreshing…
            </div>
          )}
        </div>

        {/* Right drawer — selected employee detail */}
        {selRow && (
          <div className="w-full lg:w-80 shrink-0 border border-zinc-200 rounded-md bg-white p-4 overflow-y-auto" data-testid="lt-detail">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden shrink-0">
                  {selRow.photo_base64 ? <img src={`data:image/jpeg;base64,${selRow.photo_base64}`} className="w-full h-full object-cover" alt=""/> : null}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{selRow.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{selRow.designation} · {selRow.employee_code}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-400 hover:text-zinc-700"><X size={16}/></button>
            </div>

            <dl className="text-xs mt-4 space-y-1.5">
              <Row icon={Clock} label="Status" value={selRow.status === "on_duty" ? `On duty since ${fmtTime(selRow.checked_in_at)}` : selRow.status === "signed_out" ? `Signed out at ${fmtTime(selRow.checked_out_at)}` : "Not active today"}/>
              <Row icon={MapPin} label="Last seen" value={fmtDate(selRow.last_seen_at)}/>
              <Row icon={Path}   label="From home branch" value={fmtDist(selRow.distance_m) + (selRow.branch_name ? ` · ${selRow.branch_name}` : "")}/>
            </dl>

            <div className="mt-4">
              <label className="tiny-label mb-1 block">View trail for</label>
              <Input type="date" value={trailDate} onChange={(e) => setTrailDate(e.target.value)} data-testid="lt-trail-date"/>
              <p className="text-[10px] text-zinc-500 mt-1">{trail?.count ?? 0} ping{(trail?.count ?? 0) === 1 ? "" : "s"} on this day.</p>
            </div>

            {isAdmin && (
              <Button variant="outline" size="sm" className="w-full mt-4 gap-1.5" onClick={() => setShowViewerModal(true)} data-testid="lt-manage-viewers">
                <ShieldCheck size={14}/>Manage viewers
              </Button>
            )}
          </div>
        )}
      </div>

      {showViewerModal && (
        <ViewersModal eid={selected} onClose={() => setShowViewerModal(false)}/>
      )}
      {showFlagModal && (
        <FlagEmployeesModal onClose={() => setShowFlagModal(false)} onChanged={load}/>
      )}

      <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.4);opacity:0} }`}</style>
    </AppShell>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={12} className="text-zinc-400"/>
      <dt className="text-zinc-500 w-[110px] shrink-0">{label}:</dt>
      <dd className="text-zinc-800 font-medium truncate">{value}</dd>
    </div>
  );
}

function StatPill({ label, value, tone }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${tone}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}

function StatusDot({ status }) {
  const colors = { on_duty: "bg-emerald-500", signed_out: "bg-zinc-400", offline: "bg-zinc-300" };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status]}`}/>;
}

function FlagEmployeesModal({ onClose, onChanged }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/employees", { params: { q: query, limit: 50 } });
      setRows(r.data || []);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [query]);  // eslint-disable-line

  const toggle = async (emp) => {
    const next = !emp.is_field_tracked;
    try {
      await api.post(`/admin/locations/field-flag/${emp.id}`, { is_field_tracked: next });
      toast.success(next ? `${emp.name} is now field-tracked.` : `${emp.name} no longer tracked.`);
      setRows(rs => rs.map(r => r.id === emp.id ? { ...r, is_field_tracked: next } : r));
      onChanged?.();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-lg p-5 space-y-3 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="lt-flag-modal">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Flag employees for field tracking</h3>
          <button onClick={onClose} className="text-zinc-400"><X size={16}/></button>
        </div>
        <p className="text-xs text-zinc-500">
          Only flagged employees appear on the live map. Their phones send background GPS pings during work hours. Office employees should usually stay off.
        </p>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" data-testid="lt-flag-search"/>
        <div className="border border-zinc-200 rounded-md flex-1 overflow-y-auto">
          {loading ? <div className="py-10 text-center text-zinc-400 text-sm">Loading…</div>
          : rows.length === 0 ? <div className="py-10 text-center text-zinc-400 text-sm">No employees.</div>
          : rows.map(e => (
            <label key={e.id} className="flex items-center gap-3 px-3 py-2 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 cursor-pointer" data-testid={`lt-flag-row-${e.id}`}>
              <input type="checkbox" checked={!!e.is_field_tracked} onChange={() => toggle(e)} className="w-4 h-4"/>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{e.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{e.designation || e.email} · {e.employee_type || "full_time"}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ViewersModal({ eid, onClose }) {
  const [current, setCurrent] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [empName, setEmpName] = useState("");

  const load = async () => {
    const r = await api.get(`/admin/locations/viewers/${eid}`);
    setCurrent(r.data?.viewers || []);
    setEmpName(r.data?.employee?.name || "");
  };
  useEffect(() => { load(); }, [eid]);  // eslint-disable-line

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get("/employees", { params: { q, limit: 10 } });
        setResults(r.data || []);
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = async (u) => {
    if (!u.user_id) return toast.error("This employee has no login user yet.");
    if (current.find(v => v.id === u.user_id)) return;
    const next = [...current.map(v => v.id), u.user_id];
    try {
      await api.patch(`/admin/locations/viewers/${eid}`, { viewer_user_ids: next });
      toast.success(`${u.name} can now view the map.`);
      setQuery(""); setResults([]); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
  };

  const remove = async (uid) => {
    const next = current.filter(v => v.id !== uid).map(v => v.id);
    try {
      await api.patch(`/admin/locations/viewers/${eid}`, { viewer_user_ids: next });
      toast.success("Removed.");
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || e.message); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()} data-testid="lt-viewers-modal">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Who can view {empName}'s location?</h3>
          <button onClick={onClose} className="text-zinc-400"><X size={16}/></button>
        </div>
        <p className="text-xs text-zinc-500">HR admins and their direct manager can always see this employee. Add TLs, mentors, or other specific people here.</p>

        <div className="space-y-1">
          {current.length === 0 && <p className="text-xs text-zinc-400 py-2">No extra viewers yet.</p>}
          {current.map(v => (
            <div key={v.id} className="flex items-center justify-between bg-zinc-50 px-3 py-2 rounded-md">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{v.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{v.email} · {v.role}</div>
              </div>
              <button onClick={() => remove(v.id)} className="text-red-600 hover:text-red-800 text-xs font-semibold">Remove</button>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-zinc-100">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employees to add…" data-testid="lt-viewer-search"/>
          {results.length > 0 && (
            <div className="border border-zinc-200 rounded-md mt-1 max-h-44 overflow-y-auto">
              {results.map(e => (
                <button key={e.id} onClick={() => add(e)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 border-b border-zinc-100 last:border-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-zinc-500 ml-2">{e.designation || e.email}</span>
                  {!e.user_id && <span className="text-[10px] text-amber-600 ml-1">(no login)</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
