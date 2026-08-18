// Shared with ServiceForm.jsx and LogServiceModal.jsx -- both service-logging forms need to
// show the same "next service due = service date + 1 year" default a technician sees before
// saving. The actual authoritative default lives in the database
// (supabase/migrations/0031_service_records_default_next_service_due.sql's
// set_default_next_service_due() trigger, which applies no matter which client -- web or
// Android -- creates the row), so this client-side copy is purely for UI: showing the value
// live in the form instead of leaving the field looking empty/untracked until after save.

/**
 * Returns the ISO (YYYY-MM-DD) date exactly one year after `dateStr`, or "" if `dateStr` is
 * empty/unparseable.
 *
 * Deliberately does all arithmetic in UTC (Date.UTC(...) + getUTC*() accessors), never through
 * a local-time Date + toISOString() round-trip. `new Date(dateStr + "T00:00:00")` parses as
 * LOCAL midnight, and toISOString() always reports UTC -- for any timezone ahead of UTC
 * (including this app's own SAST/UTC+2), local midnight is still the previous UTC day, which
 * silently shifted the result back by one day. Caught by tests/serviceDates.test.js.
 * @param {string} dateStr
 * @returns {string}
 */
export function addOneYear(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  if (!match) return "";
  const [, year, month, day] = match;
  const utcMs = Date.UTC(Number(year) + 1, Number(month) - 1, Number(day));
  if (Number.isNaN(utcMs)) return "";
  const result = new Date(utcMs);
  const yyyy = String(result.getUTCFullYear()).padStart(4, "0");
  const mm = String(result.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(result.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
