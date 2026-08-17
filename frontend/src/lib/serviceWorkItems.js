// Shared "Work Performed" checklist for logging a service (2026-08-17, explicit user request:
// "i dont want to write too much since its a hassle... use tick boxes"). Used by both
// ServiceForm.jsx (Machine detail's Log Service / Edit Service dialog) and LogServiceModal.jsx
// (the dashboard's guided Log Service flow) so the two forms can never drift out of sync with
// each other. The Android app should mirror this exact list (see
// docs/android/ANDROID_SUPABASE_MIGRATION.md-style parity notes) -- there is no shared runtime
// between the two platforms, so keeping the Kotlin copy's wording byte-for-byte identical to
// this file is a manual-but-required step, same as this codebase's other cross-platform
// vocabularies (job card STATUSES, LINE_TYPES, ARRIVAL_CONDITIONS).
//
// Deliberately NOT a new database column: `service_records.work_performed` has always been a
// plain `text` column (0010_service_records_missing_fields.sql) and every reader of it
// (ServiceRecords.jsx, MachineDetail.jsx, Dashboard.jsx, serviceCertificatePdf.js) just displays
// it as a string -- a comma-joined list of the checked items reads perfectly fine everywhere
// that already renders this field, with zero other code changes and no migration. The
// "Findings"/"Recommendations" (findings/notes) fields are untouched free text, exactly as the
// user asked ("there is space for notes if something else was done").
export const SERVICE_WORK_ITEMS = [
  "Replaced Filter Dryer",
  "Replaced Vacuum Pump Oil",
  "Calibrated Pressure Sensor",
  "Calibrated Scales",
  "Cleaned Machine",
];

/** Turns a `{ [item]: boolean }` selection map into the exact string stored in `work_performed`. */
export function joinWorkPerformed(selected) {
  return SERVICE_WORK_ITEMS.filter((item) => selected[item]).join(", ");
}

/**
 * Reverse mapping for editing an EXISTING service record. Only recognizes a value that is
 * exactly a comma-joined combination of the known checklist items -- i.e. one this checkbox UI
 * itself produced. A record's `work_performed` written before this change (free prose) can't be
 * parsed back into checkbox state; re-editing an old record starts from an empty checklist
 * rather than guessing at the old text, which stays visible read-only exactly as before. This is
 * a disclosed, deliberate limitation, not a silent data-loss bug -- the old string is never
 * altered or discarded unless the user actually re-saves the form.
 */
export function parseWorkPerformed(value) {
  const selected = {};
  if (!value) return selected;
  const parts = String(value).split(",").map((p) => p.trim()).filter(Boolean);
  const allKnown = parts.length > 0 && parts.every((p) => SERVICE_WORK_ITEMS.includes(p));
  if (allKnown) {
    parts.forEach((p) => { selected[p] = true; });
  }
  return selected;
}
