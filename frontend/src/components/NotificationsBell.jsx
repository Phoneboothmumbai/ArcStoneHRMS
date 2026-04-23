import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle, ArrowRight } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { api } from "../lib/api";

const POLL_MS = 60_000;

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function NotificationsBell() {
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const timer = useRef(null);

  const refreshCount = async () => {
    try {
      const { data } = await api.get("/notifications/unread_count");
      setUnread(data.count);
    } catch {}
  };
  const loadList = async () => {
    try {
      const { data } = await api.get("/notifications?limit=10");
      setRows(data);
    } catch {}
  };

  useEffect(() => {
    refreshCount();
    timer.current = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => { if (open) loadList(); }, [open]);

  const markRead = async (n) => {
    if (!n.read) {
      try { await api.post(`/notifications/${n.id}/read`); } catch {}
    }
    setOpen(false);
    if (n.link) nav(n.link);
    refreshCount(); loadList();
  };

  const readAll = async () => {
    await api.post("/notifications/read_all");
    refreshCount(); loadList();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-zinc-100 transition-colors"
          data-testid="notifications-bell"
          aria-label="Notifications"
        >
          <Bell size={18} className="text-zinc-700"/>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full inline-flex items-center justify-center" data-testid="notif-count">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[380px] p-0" data-testid="notif-popover">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
          <div className="font-semibold text-sm">Notifications</div>
          {unread > 0 && (
            <button onClick={readAll} className="text-xs text-zinc-500 hover:text-zinc-900" data-testid="notif-readall">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {rows.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              You're all caught up ✨
            </div>
          )}
          {rows.map(n => (
            <button
              key={n.id}
              onClick={() => markRead(n)}
              data-testid={`notif-${n.id}`}
              className={`w-full text-left px-4 py-3 border-b border-zinc-50 hover:bg-zinc-50 flex items-start gap-3 ${!n.read ? "bg-blue-50/30" : ""}`}
            >
              {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"/>}
              {n.read && <CheckCircle size={14} className="text-zinc-300 mt-1 flex-shrink-0"/>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{n.title}</div>
                <div className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{n.body}</div>
                <div className="text-[10px] text-zinc-400 mt-1">{timeAgo(n.created_at)}</div>
              </div>
              {n.link && <ArrowRight size={14} className="text-zinc-300 mt-1"/>}
            </button>
          ))}
        </div>
        <div className="border-t border-zinc-100 p-2 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); nav("/app/notifications"); }} data-testid="notif-viewall">
            View all
          </Button>
          <Button size="sm" variant="ghost" className="text-zinc-500" onClick={() => { setOpen(false); nav("/app/notification-prefs"); }} data-testid="notif-prefs">
            Preferences
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
