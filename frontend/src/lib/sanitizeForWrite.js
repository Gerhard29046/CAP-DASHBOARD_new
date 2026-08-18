// Pure logic, deliberately dependency-free (no Supabase import) so it can be unit-tested
// under plain `node --test`, matching this project's existing pure-logic-only test
// convention (see recordPhotoPath.js/serviceWorkItems.js).
//
// BUG FIX (2026-08-18): every form in this app initializes optional fields (dates, numbers,
// selects) to `""` when left blank (e.g. MachineForm's installation_date/warranty_expiry).
// PostgREST/Postgres rejects an empty string outright for any non-text column -- a `date`
// or numeric column gets `""` and throws `invalid input syntax for type date` (22007/22P02),
// a 400 the UI never expected. Since none of this project's write-handler call sites
// (ClientDetail.jsx's handleAddMachine, and ~15 others across the app -- see
// docs/ai-memory/KNOWN_ISSUES.md's matching entry) wrapped their `await ....create()/
// update()` in try/catch, that thrown error was never caught: the "Saving..." button state
// got stuck forever (setSaving(false) never ran) with no error shown -- the "leaving a
// field blank crashes the page" bug.
//
// Fixed at the single choke point every entity's create/update passes through
// (services/supabase/database.js's createRow/updateRow, used by makeEntity() in
// supabaseApiClient.js for every entity, plus the two singleton settings APIs that bypass
// database.js) rather than in each of the ~30 form components: an empty string is never a
// meaningful distinct value from "not set" for any column in this schema (confirmed no
// `not null default ''` text column exists anywhere in supabase/migrations/*.sql), so
// converting `""` -> `null` here is safe and matches what leaving a field blank actually
// means. Only touches values that are the exact empty string; arrays, objects, numbers,
// booleans, and already-null values pass through untouched.
export function sanitizeForWrite(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return values;
  const clean = {};
  for (const [key, value] of Object.entries(values)) {
    clean[key] = value === "" ? null : value;
  }
  return clean;
}
