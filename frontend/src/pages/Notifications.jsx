import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { SectionCard } from "../components/AppShell";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Bell, CheckCircle, ArrowRight, Gear } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Notifications() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const nav = useNavigate();

  const load = async () => {
    const url = filter === "unread" ? "/notifications?unread_only=true&limit=200" : "/notifications?limit=200";
    const { data } = await api.get(url);
    setRows(data);
  };
  useEffect(() => { load(); }, [filter]);

  const readAll = async () => {
    await api.post("/notifications/read_all");
    toast.success("All marked read");
    load();
  };

  const click = async (n) => {
    if (!n.read) await api.post(`/notifications/${n.id}/read`);
    if (n.link) nav(n.link);
  };

  return (
    <AppShell title="Notifications">
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-2">
          {[{k:"all",l:"All"},{k:"unread",l:"Unread"}].map(t=>(
            <button key={t.k} onClick={()=>setFilter(t.k)}
              data-testid={`notif-filter-${t.k}`}
              className={`px-3 py-1.5 text-sm rounded-md ${filter===t.k?"bg-zinc-950 text-white":"bg-white border border-zinc-200 text-zinc-700"}`}>
              {t.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={readAll} data-testid="notif-readall-page">Mark all read</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={()=>nav("/app/notification-prefs")} data-testid="notif-prefs-link">
            <Gear size={14}/> Preferences
          </Button>
        </div>
      </div>

      <SectionCard title={`${rows.length} notification${rows.length !== 1 ? "s" : ""}`} testid="section-notif">
        {rows.length === 0 && (
          <div className="py-12 text-center">
            <Bell size={36} className="mx-auto text-zinc-300"/>
            <div className="mt-3 text-sm text-zinc-500">You're all caught up.</div>
          </div>
        )}
        <div className="divide-y divide-zinc-100">
          {rows.map(n => (
            <button
              key={n.id} onClick={()=>click(n)}
              className={`w-full text-left px-4 py-4 hover:bg-zinc-50 flex items-start gap-3 ${!n.read?"bg-blue-50/30":""}`}
              data-testid={`notif-row-${n.id}`}
            >
              {!n.read ? <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"/> : <CheckCircle size={16} className="text-zinc-300 mt-1 flex-shrink-0"/>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">{n.title}</div>
                  <Badge variant="outline" className="text-[10px]">{n.event.replace(/\./g," · ")}</Badge>
                </div>
                <div className="text-sm text-zinc-600 mt-0.5">{n.body}</div>
                <div className="text-xs text-zinc-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              {n.link && <ArrowRight size={16} className="text-zinc-300 mt-1"/>}
            </button>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}

export function NotificationPreferences() {
  const [p, setP] = useState(null);
  const load = async () => { const { data } = await api.get("/notifications/preferences"); setP(data); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    await api.put("/notifications/preferences", {
      channels: p.channels, mute_events: p.mute_events, digest_frequency: p.digest_frequency,
    });
    toast.success("Preferences saved");
    load();
  };

  if (!p) return <AppShell title="Notification preferences"><div className="text-sm text-zinc-500">Loading…</div></AppShell>;

  return (
    <AppShell title="Notification preferences">
      <SectionCard title="Channels" subtitle="Where should we send you notifications?" testid="section-channels">
        <div className="space-y-3">
          {[
            ["in_app","In-app bell","Always recommended — appears in the top bar"],
            ["email","Email","Requires email delivery to be configured by your Admin"],
            ["push","Browser push","(Coming soon)"],
          ].map(([k,lbl,desc])=>(
            <label key={k} className="flex items-start gap-3 p-3 border border-zinc-200 rounded-md cursor-pointer" data-testid={`chan-${k}`}>
              <input type="checkbox" className="mt-1" checked={!!p.channels?.[k]} onChange={e=>setP(x=>({...x,channels:{...x.channels,[k]:e.target.checked}}))} disabled={k==="push"}/>
              <div>
                <div className="font-medium text-sm">{lbl}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Digest frequency" testid="section-digest">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["realtime","Real-time"], ["daily","Daily summary"],
              ["weekly","Weekly summary"], ["off","Off"],
            ].map(([k,lbl])=>(
              <button key={k}
                onClick={()=>setP(x=>({...x,digest_frequency:k}))}
                data-testid={`digest-${k}`}
                className={`border rounded-md p-3 text-sm ${p.digest_frequency===k?"bg-zinc-950 text-white border-zinc-950":"bg-white border-zinc-200"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} data-testid="prefs-save">Save preferences</Button>
      </div>
    </AppShell>
  );
}
