import { useEffect, useRef, useState } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import {
  Buildings, Image as ImageIcon, Calendar, Receipt, Globe, Trash, FloppyDisk, UploadSimple,
} from "@phosphor-icons/react";

const MAX_BYTES = 500 * 1024;          // 500 KB raw
const ACCEPT = "image/png,image/jpeg,image/webp";

export default function CompanySettings() {
  const [s, setS] = useState(null);     // settings doc
  const [orig, setOrig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/company-settings");
      setS(data); setOrig(data);
    } catch (e) { setErr(formatApiError(e?.response?.data?.detail) || e.message); }
  };
  useEffect(() => { load(); }, []);

  if (!s) return <AppShell title="Company settings"><div className="text-zinc-500" data-testid="settings-loading">Loading…</div></AppShell>;

  const dirty = JSON.stringify(s) !== JSON.stringify(orig);
  const update = (k, v) => setS(p => ({ ...p, [k]: v }));

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) {
      toast.error("Logo must be a PNG, JPEG, or WebP image.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`Logo too large — keep it under ${MAX_BYTES / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // store as data URI; backend strips the prefix and persists clean base64 + mime
      update("logo_base64", reader.result);
      update("logo_mime_type", f.type);
    };
    reader.readAsDataURL(f);
  };

  const removeLogo = () => {
    update("logo_base64", "");
    update("logo_mime_type", "");
  };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const payload = {};
      // Only changed keys
      Object.keys(s).forEach(k => {
        if (s[k] !== orig?.[k]) payload[k] = s[k];
      });
      if (Object.keys(payload).length === 0) {
        toast.info("Nothing to save.");
        return;
      }
      const { data } = await api.patch("/company-settings", payload);
      setS(data); setOrig(data);
      toast.success("Settings updated. Logo will appear on all new PDFs immediately.");
    } catch (e) {
      const msg = formatApiError(e?.response?.data?.detail) || e.message;
      setErr(msg); toast.error(msg);
    } finally { setSaving(false); }
  };

  const logoSrc = s.logo_base64
    ? (s.logo_base64.startsWith("data:") ? s.logo_base64 : `data:${s.logo_mime_type || "image/png"};base64,${s.logo_base64}`)
    : null;

  return (
    <AppShell title="Company settings">
      <div className="max-w-4xl space-y-6" data-testid="settings-root">
        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-md text-sm" data-testid="settings-error">
            {err}
          </div>
        )}

        {/* ─── Branding ───────────────────────────────────────────────────── */}
        <SectionCard
          title="Branding"
          subtitle="Your logo prints on every payslip, letter, voucher, org chart and directory PDF."
          testid="section-branding"
          action={
            <span className="text-xs text-zinc-500">PNG / JPEG / WebP · ≤ 500 KB</span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[180px,1fr] gap-6">
            <div>
              <Label className="tiny-label mb-2 block">Logo preview</Label>
              <div className="border border-zinc-200 rounded-md bg-zinc-50 h-[120px] flex items-center justify-center overflow-hidden p-3" data-testid="logo-preview">
                {logoSrc ? (
                  <img src={logoSrc} alt="Company logo" className="max-h-full max-w-full object-contain" data-testid="logo-img" />
                ) : (
                  <div className="text-xs text-zinc-400 text-center px-2">
                    <ImageIcon size={28} className="mx-auto mb-1.5 text-zinc-300" weight="duotone"/>
                    No logo uploaded
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" data-testid="logo-file-input"/>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="flex-1 gap-1.5" data-testid="logo-upload-btn">
                  <UploadSimple size={14} weight="bold"/>{logoSrc ? "Change" : "Upload"}
                </Button>
                {logoSrc && (
                  <Button variant="outline" size="sm" onClick={removeLogo} className="text-red-600 border-red-200 hover:bg-red-50" data-testid="logo-remove-btn">
                    <Trash size={14}/>
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3 min-w-0">
              <div>
                <Label htmlFor="legal_entity_name" className="tiny-label">Legal entity name</Label>
                <Input id="legal_entity_name" value={s.legal_entity_name || ""}
                  onChange={(e) => update("legal_entity_name", e.target.value)}
                  placeholder="Acme Technologies Pvt Ltd"
                  data-testid="legal-entity-input"
                />
                <p className="text-xs text-zinc-500 mt-1">Shown as the heading on every PDF — falls back to company name if blank.</p>
              </div>
              <div>
                <Label htmlFor="registered_address" className="tiny-label">Registered address</Label>
                <Textarea id="registered_address" rows={3} value={s.registered_address || ""}
                  onChange={(e) => update("registered_address", e.target.value)}
                  placeholder="Block A, 4th Floor, ABC Tower, MG Road, Bengaluru 560001"
                  data-testid="registered-address-input"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ─── Fiscal & Payroll ──────────────────────────────────────────── */}
        <SectionCard
          title="Fiscal & payroll cycle"
          subtitle="Drives financial year, payslip cutoffs, and salary credit dates."
          testid="section-fiscal"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Fiscal year start month">
              <select value={s.fiscal_year_start_month}
                onChange={(e) => update("fiscal_year_start_month", parseInt(e.target.value, 10))}
                className="w-full border border-zinc-300 rounded-md h-10 px-3 text-sm bg-white"
                data-testid="fy-start-select">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString("default", { month: "long" })}</option>
                ))}
              </select>
            </Field>
            <Field label="Payroll cutoff day">
              <Input type="number" min="1" max="31" value={s.payroll_cutoff_day || 25}
                onChange={(e) => update("payroll_cutoff_day", parseInt(e.target.value, 10) || 25)}
                data-testid="payroll-cutoff-input"/>
            </Field>
            <Field label="Pay day (next month)">
              <Input type="number" min="1" max="31" value={s.pay_day || 1}
                onChange={(e) => update("pay_day", parseInt(e.target.value, 10) || 1)}
                data-testid="pay-day-input"/>
            </Field>
          </div>
        </SectionCard>

        {/* ─── Statutory IDs ─────────────────────────────────────────────── */}
        <SectionCard
          title="Statutory identifiers"
          subtitle="Used in CSV exports (24Q, PF ECR, ESIC) and on PDFs where regulators require them."
          testid="section-statutory"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="PAN"><Input value={s.pan || ""} onChange={(e) => update("pan", e.target.value.toUpperCase())} placeholder="AAAAA1234A" data-testid="pan-input"/></Field>
            <Field label="TAN"><Input value={s.tan || ""} onChange={(e) => update("tan", e.target.value.toUpperCase())} placeholder="DELA12345B" data-testid="tan-input"/></Field>
            <Field label="GSTIN"><Input value={s.gstin || ""} onChange={(e) => update("gstin", e.target.value.toUpperCase())} placeholder="29AAAAA1234A1Z5" data-testid="gstin-input"/></Field>
            <Field label="CIN"><Input value={s.cin || ""} onChange={(e) => update("cin", e.target.value.toUpperCase())} placeholder="U72200KA2010PTC012345" data-testid="cin-input"/></Field>
            <Field label="PF establishment code"><Input value={s.pf_establishment_code || ""} onChange={(e) => update("pf_establishment_code", e.target.value.toUpperCase())} data-testid="pf-code-input"/></Field>
            <Field label="ESIC establishment code"><Input value={s.esic_establishment_code || ""} onChange={(e) => update("esic_establishment_code", e.target.value)} data-testid="esic-code-input"/></Field>
          </div>
        </SectionCard>

        {/* ─── Localization ──────────────────────────────────────────────── */}
        <SectionCard title="Localization" subtitle="Currency and timezone used across the app." testid="section-locale">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Currency">
              <Input value={s.currency || "INR"} onChange={(e) => update("currency", e.target.value.toUpperCase())} maxLength={3} data-testid="currency-input"/>
            </Field>
            <Field label="Timezone">
              <Input value={s.timezone || "Asia/Kolkata"} onChange={(e) => update("timezone", e.target.value)} placeholder="Asia/Kolkata" data-testid="timezone-input"/>
            </Field>
          </div>
        </SectionCard>

        {/* ─── Privacy & retention ───────────────────────────────────────── */}
        <SectionCard title="Privacy & data retention" subtitle="How long sensitive operational data is kept before automatic purge." testid="section-retention">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Live-tracking ping retention (days)">
              <Input type="number" min="1" max="365" value={s.location_retention_days ?? 60}
                onChange={(e) => update("location_retention_days", parseInt(e.target.value, 10) || 60)}
                data-testid="loc-retention-input"/>
              <p className="text-xs text-zinc-500 mt-1">GPS pings older than this are auto-purged daily. 1–365 days.</p>
            </Field>
          </div>
        </SectionCard>

        {/* ─── Save bar ──────────────────────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-3 sm:-mx-5 lg:-mx-8 px-3 sm:px-5 lg:px-8 py-3 bg-white border-t border-zinc-200 flex items-center justify-between gap-3" data-testid="save-bar">
          <div className="text-xs text-zinc-500">
            {dirty ? <span className="text-amber-700 font-semibold">● Unsaved changes</span> : "All changes saved."}
          </div>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="outline" onClick={() => setS(orig)} data-testid="discard-btn">Discard</Button>
            )}
            <Button onClick={save} disabled={!dirty || saving} className="bg-zinc-950 hover:bg-zinc-800 gap-1.5" data-testid="save-btn">
              <FloppyDisk size={14} weight="fill"/>{saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
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
