import { useEffect, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { FloppyDisk, Receipt, FileArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

const SECTIONS = [
  { v: "80C",        label: "Section 80C — PF/PPF/ELSS/LIC/tuition (cap ₹1.5L)" },
  { v: "80CCD_1B",   label: "Section 80CCD(1B) — NPS additional (cap ₹50K)" },
  { v: "80D",        label: "Section 80D — Health insurance premium" },
  { v: "80E",        label: "Section 80E — Education-loan interest" },
  { v: "80G",        label: "Section 80G — Donations" },
  { v: "80TTA",      label: "Section 80TTA — Savings interest (cap ₹10K)" },
  { v: "HRA",        label: "HRA — Rent receipts" },
  { v: "LTA",        label: "LTA — Leave travel" },
  { v: "home_loan",  label: "Sec 24(b) — Home-loan interest (cap ₹2L)" },
  { v: "other",      label: "Other" },
];

// Generate FY list — last 1, current, next
const fyOptions = (() => {
  const d = new Date();
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return [fyStart - 1, fyStart, fyStart + 1].map(y => `${y}-${y + 1}`);
})();

const fmtINR = n => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function InvestmentDeclarations() {
  const [fy, setFy] = useState(fyOptions[1]);
  const [decl, setDecl] = useState({ items: [], rent_monthly: 0, metro_city: false, tax_regime: "new" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/declarations/me?financial_year=${fy}`);
      setDecl({
        ...data,
        items: data?.items || [],
        rent_monthly: data?.rent_monthly || 0,
        metro_city: !!data?.metro_city,
        tax_regime: data?.tax_regime || "new",
      });
    } catch {
      setDecl({ items: [], rent_monthly: 0, metro_city: false, tax_regime: "new" });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fy]);

  const addItem = () => setDecl(d => ({ ...d, items: [...(d.items || []), { section: "80C", label: "", declared_amount: 0, proof_attached: false }] }));
  const updateItem = (i, k, v) => setDecl(d => ({ ...d, items: d.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const removeItem = (i) => setDecl(d => ({ ...d, items: d.items.filter((_, idx) => idx !== i) }));

  const save = async () => {
    setBusy(true);
    try {
      await api.post("/declarations/me", {
        financial_year: fy,
        tax_regime: decl.tax_regime || "new",
        items: (decl.items || []).map(it => ({
          section: it.section,
          label: it.label || "",
          declared_amount: Number(it.declared_amount || 0),
          proof_attached: !!it.proof_attached,
        })),
        rent_monthly: Number(decl.rent_monthly || 0),
        metro_city: !!decl.metro_city,
        notes: decl.notes || null,
      });
      toast.success("Declaration saved");
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Save failed"); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!window.confirm("Submit final declaration for review? You won't be able to edit until HR reviews.")) return;
    try {
      await api.post(`/declarations/me/submit?financial_year=${fy}`);
      toast.success("Submitted for HR review");
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Submit failed"); }
  };

  const total = (decl.items || []).reduce((s, it) => s + Number(it.declared_amount || 0), 0);
  const annualRent = Number(decl.rent_monthly || 0) * 12;
  const locked = decl.status === "submitted" || decl.status === "approved";

  return (
    <AppShell title="Investment Declarations">
      <Toaster richColors position="top-right"/>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <Receipt size={18} className="text-zinc-500"/>
        <Label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Financial year</Label>
        <Select value={fy} onValueChange={setFy}>
          <SelectTrigger className="w-44 h-9" data-testid="decl-fy-select"><SelectValue/></SelectTrigger>
          <SelectContent>{fyOptions.map(o => <SelectItem key={o} value={o}>FY {o}</SelectItem>)}</SelectContent>
        </Select>
        <Label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold ml-2">Tax regime</Label>
        <Select value={decl.tax_regime || "new"} onValueChange={v => setDecl({ ...decl, tax_regime: v })} disabled={locked}>
          <SelectTrigger className="w-32 h-9" data-testid="decl-regime-select"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="old">Old</SelectItem>
            <SelectItem value="new">New</SelectItem>
          </SelectContent>
        </Select>
        {decl?.status && (
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${
            decl.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            decl.status === "submitted" ? "bg-amber-50 text-amber-700 border-amber-200" :
            decl.status === "rejected" ? "bg-red-50 text-red-700 border-red-200" :
            "bg-zinc-100 text-zinc-700 border-zinc-200"}`}>{decl.status}</Badge>
        )}
      </div>

      <SectionCard
        title={`Total declared — ${fmtINR(total)}`}
        subtitle="Add deductions you'll claim. Submit by Jan-end of the FY for proof verification."
        testid="section-declarations"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={save} disabled={busy || locked} data-testid="decl-save-btn">
              <FloppyDisk size={14}/> {busy ? "Saving…" : "Save draft"}
            </Button>
            {!locked && (
              <Button size="sm" className="h-9 gap-1.5" onClick={submit} data-testid="decl-submit-btn">
                <FileArrowUp size={14}/> Submit
              </Button>
            )}
          </div>
        }>
        <div className="space-y-2">
          {(decl.items || []).length === 0 && (
            <div className="border border-dashed border-zinc-200 rounded-lg py-8 text-center text-sm text-zinc-500" data-testid="decl-empty">
              No declarations yet. Click "Add item" to add an investment under any section.
            </div>
          )}
          {(decl.items || []).map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center border border-zinc-200 rounded p-2.5" data-testid={`decl-item-${i}`}>
              <div className="col-span-3">
                <Select value={it.section} onValueChange={v => updateItem(i, "section", v)} disabled={locked}>
                  <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                  <SelectContent>{SECTIONS.map(s => <SelectItem key={s.v} value={s.v}>{s.v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-5">
                <Input value={it.label || ""} onChange={e => updateItem(i, "label", e.target.value)} placeholder="e.g. LIC policy #A1234" disabled={locked} className="h-9" data-testid={`decl-label-${i}`}/>
              </div>
              <div className="col-span-3">
                <Input type="number" min="0" value={it.declared_amount || ""} onChange={e => updateItem(i, "declared_amount", e.target.value)} placeholder="₹ Amount" disabled={locked} className="h-9" data-testid={`decl-amt-${i}`}/>
              </div>
              <div className="col-span-1 text-right">
                {!locked && <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => removeItem(i)}><Trash size={12}/></Button>}
              </div>
            </div>
          ))}
        </div>
        {!locked && (
          <Button size="sm" variant="outline" className="mt-3 gap-1.5 h-9" onClick={addItem} data-testid="decl-add-btn">
            <Plus size={14}/> Add item
          </Button>
        )}

        <div className="mt-6 pt-5 border-t border-zinc-200">
          <h3 className="text-sm font-semibold mb-3">HRA — rent paid</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Monthly rent</Label>
              <Input type="number" min="0" value={decl.rent_monthly || ""} onChange={e => setDecl({ ...decl, rent_monthly: e.target.value })} disabled={locked} className="mt-1" data-testid="decl-rent"/>
              <p className="text-[11px] text-zinc-500 mt-0.5">Annual: {fmtINR(annualRent)}</p>
            </div>
            <label className="flex items-center gap-2 mt-6">
              <Switch checked={!!decl.metro_city} onCheckedChange={v => setDecl({ ...decl, metro_city: v })} disabled={locked} data-testid="decl-metro"/>
              Metro city (50% HRA exemption)
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-zinc-200 pt-3">
          <div className="text-sm text-zinc-700">Total deductions declared</div>
          <div className="text-2xl font-bold">{fmtINR(total)}</div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
