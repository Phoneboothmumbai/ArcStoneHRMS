import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Package, Lightning, Tag, ClockCountdown, Shield } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

export default function Modules() {
  const [catalog, setCatalog] = useState({ modules: [], bundles: [] });
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyMods, setCompanyMods] = useState([]);
  const [audit, setAudit] = useState([]);
  const [enabling, setEnabling] = useState(null);
  const [form, setForm] = useState({ mode: "active", custom_amount: "", currency: "INR" });

  const load = async () => {
    const [cat, cos] = await Promise.all([api.get("/modules/catalog"), api.get("/companies")]);
    setCatalog(cat.data);
    setCompanies(cos.data);
    if (cos.data.length && !selectedCompany) setSelectedCompany(cos.data[0].id);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    Promise.all([
      api.get(`/modules/company/${selectedCompany}`),
      api.get(`/modules/audit/${selectedCompany}`),
    ]).then(([a, b]) => { setCompanyMods(a.data); setAudit(b.data); });
  }, [selectedCompany]);

  const activeModuleIds = new Set(companyMods.filter((r) => ["active", "trial"].includes(r.status)).map((r) => r.module_id));

  const doEnable = async (mode) => {
    if (!enabling || !selectedCompany) return;
    try {
      const payload = { module_id: enabling.id, mode };
      if (form.custom_amount !== "") payload.custom_amount = Number(form.custom_amount);
      payload.currency = form.currency;
      await api.post(`/modules/company/${selectedCompany}/enable`, payload);
      toast.success(`${enabling.name} ${mode === "trial" ? "trial started" : "activated"}`);
      setEnabling(null);
      setForm({ mode: "active", custom_amount: "", currency: "INR" });
      const a = await api.get(`/modules/company/${selectedCompany}`);
      setCompanyMods(a.data);
      const b = await api.get(`/modules/audit/${selectedCompany}`);
      setAudit(b.data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const doDisable = async (mid) => {
    if (!window.confirm(`Disable '${mid}' for this company?`)) return;
    try {
      await api.post(`/modules/company/${selectedCompany}/disable`, { module_id: mid });
      toast.success("Module disabled");
      const a = await api.get(`/modules/company/${selectedCompany}`);
      setCompanyMods(a.data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const activateBundle = async (bid) => {
    if (!window.confirm(`Activate the '${bid.replace(/_/g, " ")}' bundle?`)) return;
    try {
      await api.post(`/modules/company/${selectedCompany}/activate_bundle`, { bundle_id: bid, mode: "active" });
      toast.success("Bundle activated");
      const a = await api.get(`/modules/company/${selectedCompany}`);
      setCompanyMods(a.data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const categories = [...new Set(catalog.modules.map((m) => m.category))];

  return (
    <AppShell title="Modules & entitlements">
      <Toaster richColors />
      <div className="flex items-center gap-3 mb-6" data-testid="company-picker">
        <Label className="text-xs uppercase tracking-wider text-zinc-600">Company</Label>
        <Select value={selectedCompany || ""} onValueChange={setSelectedCompany}>
          <SelectTrigger className="w-80 h-9"><SelectValue placeholder="Select a company" /></SelectTrigger>
          <SelectContent>
            {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.plan}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules" data-testid="tab-modules">Modules</TabsTrigger>
          <TabsTrigger value="bundles" data-testid="tab-bundles">Bundles</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-5 space-y-5">
          {categories.map((cat) => (
            <SectionCard key={cat} title={cat} subtitle={`${catalog.modules.filter(m => m.category === cat).length} modules`} testid={`cat-${cat}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {catalog.modules.filter((m) => m.category === cat).map((m) => {
                  const rec = companyMods.find((r) => r.module_id === m.id);
                  const isActive = activeModuleIds.has(m.id);
                  return (
                    <div key={m.id} className={`border rounded-lg p-4 ${isActive ? "border-emerald-300 bg-emerald-50/30" : "border-zinc-200 bg-white"}`} data-testid={`mod-${m.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Package size={14} weight="bold" className="text-zinc-500" />
                            <div className="font-display font-semibold">{m.name}</div>
                            {m.included_by_default && <Badge variant="outline" className="uppercase text-[10px]">Included</Badge>}
                            {rec?.status === "trial" && <Badge className="bg-amber-500 hover:bg-amber-500 text-white uppercase text-[10px]">Trial</Badge>}
                            {rec?.status === "active" && !m.included_by_default && <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white uppercase text-[10px]">Active</Badge>}
                          </div>
                          <p className="text-xs text-zinc-600 mt-1">{m.description}</p>
                          <div className="flex items-center gap-4 mt-3 text-xs">
                            {m.retail_price != null && <span className="flex items-center gap-1 text-zinc-700"><Tag size={12} />Retail ₹{m.retail_price}</span>}
                            {m.wholesale_price != null && <span className="flex items-center gap-1 text-zinc-700"><Tag size={12} />Wholesale ₹{m.wholesale_price}</span>}
                            {m.trial_days > 0 && <span className="flex items-center gap-1 text-zinc-600"><ClockCountdown size={12} />{m.trial_days}d trial</span>}
                          </div>
                        </div>
                        {!m.included_by_default && (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {!isActive ? (
                              <Button size="sm" className="bg-zinc-950 hover:bg-zinc-800 rounded-md" onClick={() => setEnabling(m)} data-testid={`enable-${m.id}`}>Enable</Button>
                            ) : (
                              <Button size="sm" variant="outline" className="rounded-md border-zinc-300 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => doDisable(m.id)} data-testid={`disable-${m.id}`}>Disable</Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          ))}
        </TabsContent>

        <TabsContent value="bundles" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {catalog.bundles.map((b) => (
              <div key={b.id} className="bg-zinc-950 text-white rounded-lg p-6 flex flex-col" data-testid={`bundle-${b.id}`}>
                <div className="flex items-center gap-2">
                  <Lightning size={16} weight="fill" className="text-amber-400" />
                  <div className="font-display font-bold text-lg">{b.name}</div>
                </div>
                <p className="text-sm text-zinc-400 mt-2 flex-1">{b.description}</p>
                <div className="mt-4 font-display font-black text-3xl tracking-tight">₹{b.retail_price}<span className="text-zinc-500 text-sm font-normal">/mo</span></div>
                <div className="text-xs text-zinc-500 mt-1">Includes {b.modules.length} modules</div>
                <Button className="mt-5 bg-white text-zinc-950 hover:bg-zinc-100" onClick={() => activateBundle(b.id)} data-testid={`activate-bundle-${b.id}`}>Activate bundle</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-5">
          <SectionCard title="Module events" subtitle="Every enable/disable/request for this company" testid="audit-log">
            <ul className="space-y-3">
              {audit.map((e, i) => (
                <li key={i} className="text-sm flex items-start gap-3 border-b border-zinc-100 pb-3 last:border-0" data-testid={`audit-row-${i}`}>
                  <Shield size={14} className="text-zinc-400 mt-0.5" />
                  <div className="flex-1">
                    <div><span className="font-medium">{e.actor_name}</span> <span className="text-zinc-500">({e.actor_role})</span> <b>{e.action}</b> {e.module_id && <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">{e.module_id}</code>}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{new Date(e.at).toLocaleString()}</div>
                  </div>
                </li>
              ))}
              {!audit.length && <li className="text-sm text-zinc-500">No events yet.</li>}
            </ul>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Enable dialog */}
      <Dialog open={!!enabling} onOpenChange={(v) => !v && setEnabling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enable {enabling?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mode</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (billed)</SelectItem>
                  <SelectItem value="trial">Trial ({enabling?.trial_days || 14} days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Custom amount <span className="text-zinc-400 font-normal">(optional)</span></Label>
                <Input type="number" className="mt-2" placeholder={String(enabling?.retail_price || "")} value={form.custom_amount} onChange={(e) => setForm({ ...form, custom_amount: e.target.value })} data-testid="enable-amount" />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnabling(null)}>Cancel</Button>
            <Button className="bg-zinc-950 hover:bg-zinc-800" onClick={() => doEnable(form.mode)} data-testid="confirm-enable">Enable</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
