import { useEffect, useState } from "react";
import AppShell, { StatCard, SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Clock, MapPin, CheckCircle, ArrowRight } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";
import { Link } from "react-router-dom";

export default function EmployeeDashboard() {
  const [stats, setStats] = useState(null);
  const [me, setMe] = useState(null);
  const [today, setToday] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, m, t] = await Promise.all([
      api.get("/dashboard/stats"),
      api.get("/employees/me"),
      api.get("/attendance/today"),
    ]);
    setStats(s.data); setMe(m.data); setToday(t.data);
  };
  useEffect(() => { load(); }, []);

  const checkin = async () => {
    setBusy(true);
    try {
      await api.post("/attendance/checkin", { location: me?.branch_id ? "Assigned branch" : "Remote", type: me?.employee_type || "wfo" });
      await load();
      toast.success("Checked in successfully");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };
  const checkout = async () => {
    setBusy(true);
    try {
      await api.post("/attendance/checkout", {});
      await load();
      toast.success("Checked out. Great work!");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <AppShell title={`Welcome, ${me?.name?.split(" ")[0] || ""}`}>
      <Toaster richColors />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-lg p-8 hrms-rise" data-testid="employee-clock-card">
          <div className="tiny-label">Today</div>
          <div className="flex items-end justify-between mt-4">
            <div>
              <div className="font-display font-bold text-4xl tracking-tight">
                {today?.check_in ? (today?.check_out ? "Day complete" : "You are on the clock") : "Ready to clock in?"}
              </div>
              <div className="flex items-center gap-4 mt-4 text-sm text-zinc-600">
                {today?.check_in && (
                  <span className="inline-flex items-center gap-1.5" data-testid="clock-in-time"><Clock size={16}/> In at {new Date(today.check_in).toLocaleTimeString()}</span>
                )}
                {today?.check_out && (
                  <span className="inline-flex items-center gap-1.5" data-testid="clock-out-time"><CheckCircle size={16}/> Out at {new Date(today.check_out).toLocaleTimeString()} · {today.hours}h</span>
                )}
                {me && <span className="inline-flex items-center gap-1.5"><MapPin size={16}/> {me.employee_type?.toUpperCase()}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {!today?.check_in && <Button onClick={checkin} disabled={busy} className="bg-zinc-950 hover:bg-zinc-800 rounded-md h-11 px-6" data-testid="checkin-btn">Check in</Button>}
              {today?.check_in && !today?.check_out && <Button onClick={checkout} disabled={busy} variant="outline" className="rounded-md h-11 px-6 border-zinc-300" data-testid="checkout-btn">Check out</Button>}
            </div>
          </div>
        </div>
        <StatCard testid="stat-leave" label="My leave" value={stats?.my_leave ?? "—"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6" data-testid="employee-quick-actions">
        <QuickAction to="/app/leave" title="Apply for leave" subtitle="Casual, sick, earned or unpaid" testid="qa-leave" />
        <QuickAction to="/app/requests" title="Request product/service" subtitle="Routed via your approval chain" testid="qa-req" />
        <QuickAction to="/app/my-submissions" title="Track submissions" subtitle="See where each request stands" testid="qa-sub" />
      </div>

      <SectionCard title="My profile snapshot" testid="section-my-profile" >
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          {[
            ["Employee code", me?.employee_code],
            ["Job title", me?.job_title],
            ["Type", me?.employee_type?.toUpperCase()],
            ["Status", me?.status],
            ["Joined", me?.joined_on?.slice(0,10)],
            ["Email", me?.email],
            ["Phone", me?.phone || "—"],
            ["Role", me?.role_in_company?.replace(/_/g, " ")],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-zinc-100 pt-3">
              <div className="tiny-label">{k}</div>
              <div className="font-medium mt-1">{v || "—"}</div>
            </div>
          ))}
        </dl>
      </SectionCard>
    </AppShell>
  );
}

function QuickAction({ to, title, subtitle, testid }) {
  return (
    <Link to={to} className="group bg-white border border-zinc-200 rounded-lg p-6 hover:border-zinc-950 transition-colors" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display font-semibold">{title}</div>
          <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>
        </div>
        <ArrowRight size={18} className="text-zinc-400 group-hover:text-zinc-950 group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  );
}
