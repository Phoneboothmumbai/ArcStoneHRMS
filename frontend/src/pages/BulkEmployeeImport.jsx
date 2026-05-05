import { useState, useRef } from "react";
import AppShell, { SectionCard } from "../components/AppShell";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { UploadSimple, CheckCircle, Warning, FileArrowUp, ArrowClockwise } from "@phosphor-icons/react";
import { toast, Toaster } from "sonner";

/**
 * Bulk Employee Import (CSV)
 *  Step 1 — Upload CSV → /api/employees/bulk-import/dry-run (validates only)
 *  Step 2 — Preview report; if no errors → apply
 *  Step 3 — POST /api/employees/bulk-import/apply with the same CSV + flags
 */
export default function BulkEmployeeImport() {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [report, setReport] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createUsers, setCreateUsers] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const inputRef = useRef(null);

  const downloadTemplate = () => {
    const csv = `email,name,employee_code,designation,department,branch_code,employee_type,phone,date_of_joining,manager_email
jane.doe@example.com,Jane Doe,EMP-1001,Senior Engineer,Engineering,BLR-HQ,wfo,+91-9999900000,2026-04-01,manager@acme.io
john.roe@example.com,John Roe,EMP-1002,Designer,Design,MUM,hybrid,+91-9999900001,2026-04-15,manager@acme.io
`;
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "employee-import-template.csv";
    a.click();
  };

  const onFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) return toast.error("Please upload a .csv file");
    setBusy(true);
    setCsvFile(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/employees/bulk-import/dry-run", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setReport(data); setStep("preview");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Upload failed");
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!csvFile) return toast.error("Re-upload to apply");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", csvFile);
      fd.append("skip_existing", skipExisting ? "true" : "false");
      fd.append("create_user_accounts", createUsers ? "true" : "false");
      const { data } = await api.post("/employees/bulk-import/apply", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Imported ${data.created} employees`);
      setReport({ ...report, ...data }); setStep("done");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Import failed");
    } finally { setBusy(false); }
  };

  const reset = () => {
    setStep("upload"); setReport(null); setCsvFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <AppShell title="Bulk Employee Import">
      <Toaster richColors position="top-right"/>
      {step === "upload" && (
        <SectionCard title="Step 1 · Upload CSV"
          subtitle="We validate first (dry-run), preview errors, then apply only on your confirmation."
          testid="section-bulk-upload"
          action={
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={downloadTemplate} data-testid="bi-template-btn">
              <FileArrowUp size={14}/> Download template
            </Button>
          }>
          <div
            className="border-2 border-dashed border-zinc-300 rounded-lg p-12 text-center hover:border-zinc-500 transition cursor-pointer"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
            data-testid="bi-dropzone"
          >
            <UploadSimple size={36} className="mx-auto text-zinc-400 mb-2"/>
            <div className="text-sm font-medium text-zinc-700">Drop your CSV here</div>
            <div className="text-xs text-zinc-500 mt-1">or click to browse · max 5000 rows · UTF-8</div>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])}/>
          </div>
          <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
            <p className="font-medium text-zinc-700 mb-1">Required: <code className="text-[11px] bg-zinc-100 px-1.5 py-0.5 rounded">email, name</code></p>
            <p className="font-medium text-zinc-700 mt-2">Optional columns:</p>
            <code className="text-[11px] bg-zinc-50 px-2 py-1 rounded">employee_code · designation · department · branch_code · employee_type (wfo/wfh/field/hybrid) · phone · date_of_joining (YYYY-MM-DD) · ctc_annual · manager_email</code>
          </div>
          {busy && <div className="mt-4 text-sm text-zinc-500 flex items-center gap-2"><ArrowClockwise size={14} className="animate-spin"/> Validating…</div>}
        </SectionCard>
      )}

      {step === "preview" && report && (
        <SectionCard
          title={`Step 2 · Preview · ${report.valid_rows ?? 0} valid · ${report.errors?.length ?? 0} errors · ${report.warnings?.length ?? 0} warnings`}
          subtitle={report.errors?.length ? "Fix errors and re-upload before applying." : "Looks clean — choose options and apply."}
          testid="section-bulk-preview"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-9" onClick={reset} data-testid="bi-reset-btn">Re-upload</Button>
              <Button size="sm" className="h-9 gap-1.5" onClick={apply} disabled={busy || (report.errors?.length || 0) > 0} data-testid="bi-apply-btn">
                <CheckCircle size={14}/> {busy ? "Applying…" : `Apply ${report.valid_rows ?? 0}`}
              </Button>
            </div>
          }>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm border border-zinc-200 rounded p-2.5">
              <Switch checked={skipExisting} onCheckedChange={setSkipExisting} data-testid="bi-skip-existing"/>
              <div>
                <div className="font-medium">Skip existing employees</div>
                <div className="text-xs text-zinc-500">If a row's email already exists, skip it (don't update)</div>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm border border-zinc-200 rounded p-2.5">
              <Switch checked={createUsers} onCheckedChange={setCreateUsers} data-testid="bi-create-users"/>
              <div>
                <div className="font-medium">Create login accounts</div>
                <div className="text-xs text-zinc-500">Each new employee gets a User row with default password</div>
              </div>
            </label>
          </div>
          {(report.errors?.length || 0) > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs mb-3" data-testid="bi-error-banner">
              <div className="flex items-start gap-2 text-red-800 font-semibold mb-2"><Warning size={14} className="mt-0.5 flex-none"/> {report.errors.length} validation errors</div>
              <ul className="space-y-0.5 max-h-60 overflow-y-auto">
                {report.errors.slice(0, 30).map((err, i) => (
                  <li key={i} className="text-red-700"><span className="font-mono text-[11px]">row {err.row}</span> · {err.field || "—"} → {err.message}</li>
                ))}
                {report.errors.length > 30 && <li className="text-zinc-500 italic">…and {report.errors.length - 30} more</li>}
              </ul>
            </div>
          )}
          {(report.warnings?.length || 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs mb-3" data-testid="bi-warning-banner">
              <div className="font-semibold text-amber-800 mb-1">{report.warnings.length} warnings (not blocking)</div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {report.warnings.slice(0, 15).map((w, i) => (
                  <li key={i} className="text-amber-700"><span className="font-mono text-[11px]">row {w.row}</span> · {w.message}</li>
                ))}
              </ul>
            </div>
          )}
          {(report.errors?.length || 0) === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle size={14}/> All {report.valid_rows} rows pass validation. Click <strong>Apply</strong> when ready.
            </div>
          )}
        </SectionCard>
      )}

      {step === "done" && report && (
        <SectionCard title="Step 3 · Done" subtitle={`Imported ${report.created || 0} · skipped ${report.skipped || 0}`} testid="section-bulk-done">
          <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg py-12 text-center" data-testid="bi-done">
            <CheckCircle size={36} className="mx-auto text-emerald-600 mb-2"/>
            <div className="text-lg font-semibold">{report.created || 0} employees imported</div>
            {report.skipped ? <div className="text-xs text-zinc-500 mt-1">{report.skipped} skipped (already existed)</div> : null}
            <div className="mt-4 flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={reset} data-testid="bi-another-btn">Import another</Button>
              <Button size="sm" onClick={() => window.location.href = "/app/employees"} data-testid="bi-dir-btn">Go to Directory</Button>
            </div>
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}
