import { useEffect, useMemo, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Link } from "react-router-dom";
import { toast, Toaster } from "sonner";
import { IdentificationBadge, FlowArrow, Users, Warning, ArrowCounterClockwise, FloppyDisk, ArrowRight } from "@phosphor-icons/react";

const CLASS_COLORS = {
  on_roll: "bg-emerald-100 text-emerald-800 border-emerald-200",
  off_roll_consultant: "bg-amber-100 text-amber-800 border-amber-200",
  off_roll_contractor: "bg-sky-100 text-sky-800 border-sky-200",
  intern: "bg-violet-100 text-violet-800 border-violet-200",
};

export default function EmploymentClasses() {
  const [catalog, setCatalog] = useState({ classes: [], features: [] });
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [cat, cfg, st] = await Promise.all([
        api.get("/employment-class/catalog"),
        api.get("/admin/employment-class/config"),
        api.get("/admin/employment-class/stats"),
      ]);
      setCatalog(cat.data);
      setConfig(cfg.data);
      setMatrix(cfg.data.matrix);
      setStats(st.data);
      setDirty(false);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Failed to load");
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (classKey, featureKey) => {
    setMatrix(prev => ({
      ...prev,
      [classKey]: { ...prev[classKey], [featureKey]: !prev[classKey]?.[featureKey] },
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/employment-class/config", { matrix });
      toast.success("Permissions saved");
      setDirty(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Save failed");
    } finally { setSaving(false); }
  };

  const resetDefaults = async () => {
    if (!window.confirm("Reset to built-in defaults? All customisations will be lost.")) return;
    try {
      await api.post("/admin/employment-class/reset");
      toast.success("Reset to defaults");
      load();
    } catch (e) {
      toast.error("Reset failed");
    }
  };

  const groupedFeatures = useMemo(() => {
    const groups = {};
    (catalog.features || []).forEach(f => {
      (groups[f.group] ||= []).push(f);
    });
    return groups;
  }, [catalog.features]);

  return (
    <AppShell title="Employment Classes & Rights">
      <Toaster richColors position="top-right" />
      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList className="bg-zinc-100">
          <TabsTrigger value="permissions" data-testid="ec-tab-permissions">
            <IdentificationBadge size={14} className="mr-1.5"/> Classes & Permissions
          </TabsTrigger>
          <TabsTrigger value="workforce" data-testid="ec-tab-workforce">
            <Users size={14} className="mr-1.5"/> Workforce Breakdown
          </TabsTrigger>
          <TabsTrigger value="approvals" data-testid="ec-tab-approvals">
            <FlowArrow size={14} className="mr-1.5"/> Approval Matrix
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="space-y-3">
          <SectionCard
            title="Feature access per employment class"
            subtitle={
              config?.is_custom
                ? `Custom matrix · last updated by ${config.updated_by || "—"}`
                : "Using built-in defaults — flip any toggle to customise."
            }
            testid="section-permissions"
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={resetDefaults} data-testid="ec-reset-defaults">
                  <ArrowCounterClockwise size={14}/> Reset defaults
                </Button>
                <Button size="sm" className="gap-1.5 h-9" onClick={save} disabled={!dirty || saving} data-testid="ec-save">
                  <FloppyDisk size={14}/> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </Button>
              </div>
            }
          >
            {/* Class header cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
              {(catalog.classes || []).map(c => (
                <div key={c.key} className="border border-zinc-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${CLASS_COLORS[c.key]}`}>
                      {c.label}
                    </Badge>
                    <span className="text-xs font-medium text-zinc-700">
                      {stats?.counts?.[c.key] ?? 0}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-snug">{c.description}</p>
                </div>
              ))}
            </div>

            {/* Matrix rows grouped */}
            {Object.entries(groupedFeatures).map(([group, features]) => (
              <div key={group} className="mb-6">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-2">{group}</div>
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-zinc-600 w-[32%]">Feature</th>
                        {(catalog.classes || []).map(c => (
                          <th key={c.key} className="text-center py-2 px-2 font-medium text-zinc-600 text-xs">
                            {c.label.split(" ")[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {features.map(f => (
                        <tr key={f.key} className="border-t border-zinc-100 hover:bg-zinc-50">
                          <td className="py-2.5 px-3 font-medium text-zinc-800">{f.label}</td>
                          {(catalog.classes || []).map(c => (
                            <td key={c.key} className="py-2 px-2 text-center">
                              <Switch
                                checked={!!matrix[c.key]?.[f.key]}
                                onCheckedChange={() => toggle(c.key, f.key)}
                                data-testid={`ec-toggle-${c.key}-${f.key}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div className="flex items-start gap-2 text-xs text-zinc-600 bg-amber-50 border border-amber-200 rounded-md p-3 mt-2">
              <Warning size={16} className="text-amber-600 flex-none mt-0.5"/>
              <div>
                Changes here affect what every employee in that class can see.
                For example, off-roll consultants turned-off from <span className="font-semibold">Payroll</span> will not see payslips or PF/ESIC deductions.
                Backend enforces gating regardless of UI.
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="workforce">
          <SectionCard title="Workforce classification breakdown"
            subtitle={`Total active headcount: ${stats?.total ?? 0}`}
            testid="section-workforce"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(catalog.classes || []).map(c => {
                const count = stats?.counts?.[c.key] ?? 0;
                const pct = stats?.total ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={c.key} className="border border-zinc-200 rounded-lg p-4">
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider mb-2 ${CLASS_COLORS[c.key]}`}>
                      {c.label}
                    </Badge>
                    <div className="text-3xl font-bold text-zinc-900">{count}</div>
                    <div className="text-xs text-zinc-500 mt-1">{pct}% of workforce</div>
                    <div className="h-1.5 bg-zinc-100 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-zinc-900" style={{ width: `${pct}%` }}/>
                    </div>
                    <Link to={`/app/employees?employment_class=${c.key}`} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 mt-3">
                      View {c.label.toLowerCase()}s <ArrowRight size={11}/>
                    </Link>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="approvals">
          <SectionCard
            title="Approval Matrix"
            subtitle="Configure approval chains per request type, category, and amount band."
            testid="section-approvals-link"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-600 max-w-xl">
                Approval chains are defined in the Workflows page. Create rules like
                "Expenses &gt; ₹50K require 3 approvers: Manager → Branch Head → CFO".
                Rules respect branch, item category, leave-type and cost bands.
              </p>
              <Link to="/app/workflows">
                <Button size="sm" className="gap-1.5 h-9" data-testid="ec-open-workflows">
                  <FlowArrow size={14}/> Open Workflows
                </Button>
              </Link>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
