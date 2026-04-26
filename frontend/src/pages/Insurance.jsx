import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useAuth } from "../context/AuthContext";
import { Heartbeat, Plus, ShieldStar, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";

const KIND_LABEL = {
  mediclaim: "Group Mediclaim", term_life: "Term Life", personal_accident: "Personal Accident",
  covid: "COVID Cover", vision_dental: "Vision/Dental", other: "Other",
};

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function Insurance() {
  const { user } = useAuth();
  const isHR = ["super_admin", "company_admin", "country_head", "region_head"].includes(user?.role);
  const [policies, setPolicies] = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [openClaim, setOpenClaim] = useState(null);
  const [policyForm, setPolicyForm] = useState(blank());
  const [claimForm, setClaimForm] = useState({ claim_type: "reimbursement", incident_date: "", estimated_amount: "", description: "" });

  function blank() {
    return { name: "", kind: "mediclaim", insurer_name: "", tpa_name: "", policy_number: "",
             policy_year_start: "", policy_year_end: "", coverage_summary: "",
             sum_insured_per_employee: 500000, family_floater: true,
             covers_spouse: true, covers_kids: true, covers_parents: false,
             helpdesk_email: "", helpdesk_phone: "",
             claim_steps_markdown: "1. Inform TPA helpline within 24 hours.\n2. Submit claim form + bills.\n3. Track status in HR helpdesk." };
  }

  const load = async () => {
    try { const r = await api.get("/insurance/policies"); setPolicies(r.data); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, []);

  const submitPolicy = async () => {
    try {
      await api.post("/insurance/policies", policyForm);
      toast.success("Policy added");
      setOpenNew(false); setPolicyForm(blank()); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  const submitClaim = async () => {
    if (!claimForm.description) { toast.error("Description required"); return; }
    try {
      const r = await api.post("/insurance/claim", {
        ...claimForm, policy_id: openClaim.id,
        estimated_amount: claimForm.estimated_amount ? Number(claimForm.estimated_amount) : null,
      });
      toast.success(`Claim raised — ${r.data.ticket_code}`);
      setOpenClaim(null); setClaimForm({ claim_type: "reimbursement", incident_date: "", estimated_amount: "", description: "" });
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail)); }
  };

  return (
    <AppShell title="Insurance & Benefits">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ShieldStar size={20} className="text-violet-600" weight="fill"/>
          <h2 className="text-lg font-semibold">{policies.length} active polic{policies.length === 1 ? "y" : "ies"}</h2>
        </div>
        {isHR && (
          <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)} data-testid="ins-new-btn">
            <Plus size={14} weight="bold"/> Add policy
          </Button>
        )}
      </div>

      {policies.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-200 py-16 text-center">
          <Heartbeat size={32} className="text-zinc-300 mx-auto mb-3"/>
          <div className="text-sm text-zinc-500">No insurance policies yet.</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {policies.map(p => (
          <SectionCard key={p.id} title={p.name} subtitle={`${KIND_LABEL[p.kind] || p.kind} · ${p.insurer_name}`} testid={`policy-${p.id}`}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Sum insured</span><span className="font-semibold">{inr(p.sum_insured_per_employee)}/emp</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Period</span><span className="font-mono-alt text-xs">{p.policy_year_start} → {p.policy_year_end}</span></div>
              {p.policy_number && <div className="flex justify-between"><span className="text-zinc-500">Policy #</span><span className="font-mono-alt text-xs">{p.policy_number}</span></div>}
              {p.tpa_name && <div className="flex justify-between"><span className="text-zinc-500">TPA</span><span>{p.tpa_name}</span></div>}
              <div className="flex flex-wrap gap-1 pt-1">
                {p.family_floater && <Badge variant="outline" className="text-[10px] bg-violet-50 border-violet-200 text-violet-700">Family floater</Badge>}
                {p.covers_spouse && <Badge variant="outline" className="text-[10px]">Spouse</Badge>}
                {p.covers_kids && <Badge variant="outline" className="text-[10px]">Kids</Badge>}
                {p.covers_parents && <Badge variant="outline" className="text-[10px]">Parents</Badge>}
              </div>
              {p.coverage_summary && (
                <details className="pt-2"><summary className="text-xs text-zinc-600 cursor-pointer">View coverage</summary>
                  <div className="text-xs text-zinc-700 mt-1 whitespace-pre-line">{p.coverage_summary}</div>
                </details>
              )}
              {p.claim_steps_markdown && (
                <details className="pt-1"><summary className="text-xs text-zinc-600 cursor-pointer">Claim process</summary>
                  <div className="text-xs text-zinc-700 mt-1 whitespace-pre-line">{p.claim_steps_markdown}</div>
                </details>
              )}
            </div>
            {!isHR && (
              <Button size="sm" className="mt-4 w-full" onClick={() => setOpenClaim(p)} data-testid={`policy-claim-${p.id}`}>
                <FileText size={14} className="mr-1.5"/> Raise a claim
              </Button>
            )}
          </SectionCard>
        ))}
      </div>

      {/* New policy dialog (HR) */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add insurance policy</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Policy name *</Label>
                <Input className="mt-1" value={policyForm.name} onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })} data-testid="ins-name"/>
              </div>
              <div><Label>Type</Label>
                <Select value={policyForm.kind} onValueChange={v => setPolicyForm({ ...policyForm, kind: v })}>
                  <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent>{Object.entries(KIND_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Insurer</Label>
                <Input className="mt-1" value={policyForm.insurer_name} onChange={e => setPolicyForm({ ...policyForm, insurer_name: e.target.value })} data-testid="ins-insurer"/>
              </div>
              <div><Label>TPA</Label>
                <Input className="mt-1" value={policyForm.tpa_name} onChange={e => setPolicyForm({ ...policyForm, tpa_name: e.target.value })}/>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Policy #</Label>
                <Input className="mt-1" value={policyForm.policy_number} onChange={e => setPolicyForm({ ...policyForm, policy_number: e.target.value })}/>
              </div>
              <div><Label>Year start *</Label>
                <Input type="date" className="mt-1" value={policyForm.policy_year_start} onChange={e => setPolicyForm({ ...policyForm, policy_year_start: e.target.value })}/>
              </div>
              <div><Label>Year end *</Label>
                <Input type="date" className="mt-1" value={policyForm.policy_year_end} onChange={e => setPolicyForm({ ...policyForm, policy_year_end: e.target.value })}/>
              </div>
            </div>
            <div><Label>Sum insured / employee</Label>
              <Input type="number" className="mt-1" value={policyForm.sum_insured_per_employee} onChange={e => setPolicyForm({ ...policyForm, sum_insured_per_employee: Number(e.target.value) })}/>
            </div>
            <div className="grid grid-cols-4 gap-2 text-sm">
              {["family_floater", "covers_spouse", "covers_kids", "covers_parents"].map(k => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!policyForm[k]} onChange={e => setPolicyForm({ ...policyForm, [k]: e.target.checked })}/>
                  <span className="text-xs capitalize">{k.replace(/_/g, " ").replace("covers ", "")}</span>
                </label>
              ))}
            </div>
            <div><Label>Coverage summary</Label>
              <textarea className="mt-1 w-full border border-zinc-200 rounded p-2 text-sm" rows={3}
                value={policyForm.coverage_summary} onChange={e => setPolicyForm({ ...policyForm, coverage_summary: e.target.value })}/>
            </div>
            <div><Label>Claim process (markdown)</Label>
              <textarea className="mt-1 w-full border border-zinc-200 rounded p-2 text-sm font-mono-alt" rows={4}
                value={policyForm.claim_steps_markdown} onChange={e => setPolicyForm({ ...policyForm, claim_steps_markdown: e.target.value })}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={submitPolicy} data-testid="ins-save">Save policy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim dialog (employee) */}
      <Dialog open={!!openClaim} onOpenChange={v => !v && setOpenClaim(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise a claim — {openClaim?.name}</DialogTitle></DialogHeader>
          {openClaim && <div className="space-y-3 py-2">
            <div>
              <Label>Claim type</Label>
              <Select value={claimForm.claim_type} onValueChange={v => setClaimForm({ ...claimForm, claim_type: v })}>
                <SelectTrigger className="mt-1" data-testid="claim-type"><SelectValue/></SelectTrigger>
                <SelectContent>
                  {[["cashless", "Cashless"], ["reimbursement", "Reimbursement"], ["pre_authorisation", "Pre-authorisation"], ["query", "General query"]].map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Incident date</Label>
                <Input type="date" className="mt-1" value={claimForm.incident_date} onChange={e => setClaimForm({ ...claimForm, incident_date: e.target.value })}/>
              </div>
              <div><Label>Estimated ₹</Label>
                <Input type="number" className="mt-1" value={claimForm.estimated_amount} onChange={e => setClaimForm({ ...claimForm, estimated_amount: e.target.value })}/>
              </div>
            </div>
            <div><Label>Describe what happened *</Label>
              <textarea className="mt-1 w-full border border-zinc-200 rounded p-2 text-sm" rows={4}
                value={claimForm.description} onChange={e => setClaimForm({ ...claimForm, description: e.target.value })}
                data-testid="claim-description"/>
            </div>
            <p className="text-xs text-zinc-500">A helpdesk ticket will be created and the HR team will follow up.</p>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenClaim(null)}>Cancel</Button>
            <Button onClick={submitClaim} data-testid="claim-submit">Submit claim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
