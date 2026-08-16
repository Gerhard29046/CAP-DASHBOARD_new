import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { APP_FIELDS, guessMapping, buildPreview, buildUpdatePayload } from "@/lib/customerImport";

const STEPS = ["Upload", "Map Columns", "Preview", "Import"];

const STATUS_META = {
  new: { label: "New", className: "bg-emerald-500/15 text-emerald-500" },
  possible_duplicate: { label: "Possible Duplicate", className: "bg-amber-500/15 text-amber-500" },
  exact_match: { label: "Exact Match", className: "bg-blue-500/15 text-blue-500" },
  invalid: { label: "Needs Attention", className: "bg-destructive/15 text-destructive" },
};

// Settings > Data Management > Import Customers -- permanent, reusable feature (per
// explicit instruction, not a one-off migration script). Flow: Upload -> Read -> Map ->
// Validate -> Preview -> Confirm -> Import, matching the requested UX exactly. Uses the
// EXISTING public.clients table only (see src/lib/customerImport.js's header) and records
// one summary row per run in public.client_imports so repeat imports (e.g. next Pastel
// export) can be compared safely.
export default function ImportCustomers() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [existingClients, setExistingClients] = useState([]);
  const [decisions, setDecisions] = useState({}); // rowIndex -> "import" | "skip"
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    if (!rawRows.length) return { rows: [], summary: { total: 0, new: 0, possible_duplicate: 0, exact_match: 0, invalid: 0 } };
    return buildPreview(rawRows, mapping, existingClients);
  }, [rawRows, mapping, existingClients]);

  // Per-row default action. 2026-08-16: "update the customers" from a repeat Pastel/Sage
  // export is now a real decision, not just import-or-skip -- an exact_match (a strong
  // signal: matching customer code, email, or phone) defaults to updating the existing
  // client, since that's the whole point of re-importing an accounting export. A
  // possible_duplicate (name-only, a weaker signal) still defaults to "skip" -- a human
  // should confirm it's really the same customer before either creating a duplicate or
  // overwriting the wrong record.
  const decisionFor = (row) => decisions[row.index] ?? (
    row.status === "new" ? "import" : row.status === "exact_match" ? "update" : "skip"
  );

  const handleFile = async (file) => {
    setError("");
    if (!file) return;
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (json.length === 0) {
        setError("This spreadsheet has no data rows on its first sheet.");
        return;
      }
      const detectedHeaders = Object.keys(json[0]);
      const clients = await apiClient.entities.Client.list();
      setHeaders(detectedHeaders);
      setRawRows(json);
      setMapping(guessMapping(detectedHeaders));
      setExistingClients(clients || []);
      setStep(1);
    } catch (e) {
      console.error("Failed to read spreadsheet:", e);
      setError("Could not read this file. Confirm it's a valid .xlsx/.xls export.");
    }
  };

  const setFieldMapping = (header, fieldKey) => {
    setMapping((prev) => ({ ...prev, [header]: fieldKey === "__unmapped__" ? null : fieldKey }));
  };

  const requiredMapped = Object.values(mapping).includes("company_name");

  const runImport = async () => {
    setImporting(true);
    setError("");
    let imported = 0, updated = 0, skipped = 0, duplicates = 0;
    try {
      for (const row of preview.rows) {
        const decision = decisionFor(row);
        if (row.status === "invalid" || decision === "skip") {
          skipped += 1;
          if (row.status === "exact_match" || row.status === "possible_duplicate") duplicates += 1;
          continue;
        }
        if (decision === "update") {
          // matchId is only ever set on exact_match/possible_duplicate rows (see
          // classifyRow) -- "update" is never offered as an option otherwise, but guard
          // anyway rather than sending an update with no id.
          if (!row.matchId) { skipped += 1; continue; }
          const existingClient = existingClients.find((c) => c.id === row.matchId);
          const payload = buildUpdatePayload(row.normalized, existingClient);
          if (Object.keys(payload).length > 0) {
            await apiClient.entities.Client.update(row.matchId, payload);
          }
          updated += 1;
          continue;
        }
        await apiClient.entities.Client.create({
          company_name: row.normalized.company_name,
          contact_person: row.normalized.contact_person || null,
          email: row.normalized.email || null,
          phone: row.normalized.phone || null,
          address: row.normalized.address || null,
          notes: row.normalized.notes || null,
          legacy_pastel_customer_code: row.normalized.legacy_pastel_customer_code || null,
          is_active: true,
        });
        imported += 1;
        if (row.status === "possible_duplicate") duplicates += 1;
      }
      const summary = await apiClient.entities.ClientImport.create({
        source_filename: fileName,
        imported_by: user?.id || null,
        row_count: preview.rows.length,
        imported_count: imported,
        updated_count: updated,
        duplicate_count: duplicates,
        skipped_count: skipped,
        column_mapping: mapping,
      });
      setResult({ imported, updated, skipped, duplicates, summary });
      setStep(3);
    } catch (e) {
      console.error("Import failed partway through:", e);
      setError(`Import stopped after an error: ${e.message || "unknown error"}. ${imported} customer(s) were already saved and ${updated} already updated before the failure -- review Clients before re-running to avoid duplicates.`);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(0); setFileName(""); setHeaders([]); setRawRows([]); setMapping({});
    setExistingClients([]); setDecisions({}); setResult(null); setError("");
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h2 className="font-heading font-semibold text-foreground">Import Customers</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Import or update customers from a Pastel / Sage One Online Accounting export (.csv, .xlsx, or .xls)
          into the existing Clients table.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${i <= step ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {i + 1}
              </span>
              {label}
            </div>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {step === 0 && (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-14 cursor-pointer hover:border-primary/40 transition-colors">
          <Upload className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-foreground font-medium">Click to select a spreadsheet</p>
          <p className="text-xs text-muted-foreground">.csv, .xlsx, or .xls — nothing is imported or updated until you confirm at the final step</p>
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>
      )}

      {step === 1 && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm text-foreground">
            <FileSpreadsheet className="w-4 h-4 text-primary" /> {fileName} — {rawRows.length} row{rawRows.length !== 1 ? "s" : ""} detected
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Match each spreadsheet column to a Clients field. Columns left "Don't import" are ignored
            (except where noted, they're kept in Notes so nothing is silently lost).
          </p>
          <div className="bg-card border border-border rounded-xl divide-y divide-border mb-4">
            {headers.map((header) => (
              <div key={header} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm text-foreground flex-1 truncate">{header}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Select value={mapping[header] || "__unmapped__"} onValueChange={(v) => setFieldMapping(header, v)}>
                  <SelectTrigger className="h-9 rounded-lg text-sm w-56 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unmapped__">Don't import</SelectItem>
                    {APP_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {!requiredMapped && (
            <p className="text-xs text-destructive mb-3">Map a column to "Company / Customer Name *" to continue.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>Start Over</Button>
            <Button disabled={!requiredMapped} onClick={() => setStep(2)}>Preview Import</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <SummaryStat label="Rows" value={preview.summary.total} />
            <SummaryStat label="New" value={preview.summary.new} accent="text-emerald-500" />
            <SummaryStat label="Possible Duplicates" value={preview.summary.possible_duplicate} accent="text-amber-500" />
            <SummaryStat label="Exact Matches" value={preview.summary.exact_match} accent="text-blue-500" />
            <SummaryStat label="Needs Attention" value={preview.summary.invalid} accent="text-destructive" />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Review each row and choose an action. "New" rows import by default. "Exact Matches" (same customer
            code, email, or phone) default to updating the existing client — only the fields present in this
            file are changed; notes are appended, never overwritten, and nothing else on the existing record is
            touched. "Possible Duplicates" (name only) default to skipped — confirm they're really the same
            customer before updating or importing as a new record.
          </p>
          {/* REAL FIX (2026-08-13 responsive pass): overflow-hidden + overflow-y-auto on
              the same element only frees the y-axis -- the x-axis stayed clipped, so this
              4-column table (including a free-text "Reason" column) would truncate rather
              than scroll on narrow phone widths. Nested overflow-x-auto fixes it while
              keeping the vertical scroll/sticky header. */}
          <div className="bg-card border border-border rounded-xl mb-4 max-h-[420px] overflow-y-auto">
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/90 backdrop-blur">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const meta = STATUS_META[row.status];
                  const disabled = row.status === "invalid";
                  const decision = decisionFor(row);
                  return (
                    <tr key={row.index} className="border-t border-border">
                      <td className="px-3 py-2">
                        <select
                          className="h-7 rounded-md border border-border bg-background text-xs px-1.5 disabled:opacity-50"
                          disabled={disabled}
                          value={disabled ? "skip" : decision}
                          onChange={(e) => setDecisions((prev) => ({ ...prev, [row.index]: e.target.value }))}
                        >
                          <option value="skip">Skip</option>
                          {row.matchId && <option value="update">Update Existing</option>}
                          <option value="import">Import as New</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {row.normalized.company_name || <span className="text-destructive">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${meta.className}`}>{meta.label}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.errors?.join(", ") || row.reasons?.join(", ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>Back to Mapping</Button>
            <Button disabled={importing} onClick={runImport}>
              {importing
                ? "Importing…"
                : `Apply to ${preview.rows.filter((r) => decisionFor(r) !== "skip" && r.status !== "invalid").length} Customers`}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="text-center py-10 bg-card border border-border rounded-xl">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-foreground font-medium">Import complete</p>
          <p className="text-sm text-muted-foreground mt-1">
            {result.imported} customer{result.imported !== 1 ? "s" : ""} imported ·{" "}
            {result.updated} updated ·{" "}
            {result.duplicates} flagged as duplicate · {result.skipped} skipped
          </p>
          <div className="flex justify-center gap-2 mt-5">
            <Button variant="outline" onClick={reset}>Import Another File</Button>
          </div>
        </div>
      )}

      <ImportHistory />
    </div>
  );
}

function SummaryStat({ label, value, accent }) {
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 text-center">
      <p className={`text-lg font-bold font-heading ${accent || "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}

function ImportHistory() {
  const [history, setHistory] = React.useState(null);

  React.useEffect(() => {
    apiClient.entities.ClientImport.list("-created_at", 10)
      .then(setHistory)
      .catch((e) => { console.error("Failed to load import history:", e); setHistory([]); });
  }, []);

  if (!history || history.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" /> Previous Imports
      </h3>
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {history.map((h) => (
          <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
            <span className="text-foreground truncate">{h.source_filename}</span>
            <span className="text-muted-foreground shrink-0 ml-3">
              {h.imported_count} imported · {h.updated_count || 0} updated · {h.duplicate_count} duplicates · {h.skipped_count} skipped
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
