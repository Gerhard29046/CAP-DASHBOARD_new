// Pure logic for Settings > Data Management > Import Customers (Pastel Excel import).
// Deliberately framework-free (no React, no Supabase) so it can be unit tested directly
// and reused by the wizard UI (ImportCustomers.jsx) without re-deriving this logic.
//
// Maps onto the EXISTING public.clients columns only (see
// supabase/migrations/0001_initial_schema.sql / 0019_client_imports.sql) --
// company_name/contact_person/email/phone/address/notes/is_active/legacy_pastel_customer_code.
// No second customer table, no guessed/invented Pastel-specific columns (mobile, VAT
// number, postal address) until a real spreadsheet is inspected and the user decides those
// need dedicated columns -- until then they're still first-class, explicitly named mapping
// targets (not silently dropped), just stored as clearly labelled lines inside the
// existing `notes` column instead of their own column. See NOTES_APPENDIX_FIELDS below.

// Defense-in-depth for the exact bug class this file's 2026-08-16 rewrite fixed (see
// findFilePoolDuplicate's doc comment): any code path about to send an id to Supabase as a
// clients.id UUID should assert it with this first. Deliberately a plain regex, not a
// library -- Postgres's `uuid` type accepts the standard 8-4-4-4-12 hex form gen_random_uuid()
// always produces, so that's the only shape that should ever reach here.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// Every field the importer can write to public.clients. `key: null` fields (unmapped) are
// simply not written. Fields with `appendToNotes: true` don't have their own column yet --
// see NOTES_APPENDIX_FIELDS.
export const APP_FIELDS = [
  { key: "company_name", label: "Company / Customer Name", required: true },
  { key: "contact_person", label: "Contact Person", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "mobile", label: "Mobile", required: false, appendToNotes: true },
  { key: "address", label: "Address", required: false },
  { key: "postal_address", label: "Postal Address", required: false, appendToNotes: true },
  { key: "vat_number", label: "VAT Number", required: false, appendToNotes: true },
  { key: "legacy_pastel_customer_code", label: "Customer / Account Number (Pastel)", required: false },
  { key: "notes", label: "Notes", required: false },
];

// key -> the label written into `notes` for fields that don't have their own clients
// column yet (see APP_FIELDS' appendToNotes flag). Real data is never discarded, just
// stored as "Label: value" lines inside the existing notes column.
export const NOTES_APPENDIX_FIELDS = Object.fromEntries(
  APP_FIELDS.filter((f) => f.appendToNotes).map((f) => [f.key, f.label])
);

// Common Pastel/generic export header spellings -> our field key, used only to *pre-select*
// a mapping the administrator can still change before importing (per explicit instruction:
// "Where the column names match automatically, pre-select the mapping. Allow the
// administrator to change the mapping before importing.").
const HEADER_SYNONYMS = {
  company_name: ["customer name", "customer", "company", "company name", "account name", "name", "client name", "business name"],
  contact_person: ["contact person", "contact", "contact name", "attention"],
  email: ["email", "e-mail", "email address"],
  phone: ["telephone", "phone", "tel", "phone number", "landline"],
  mobile: ["mobile", "cell", "cellphone", "mobile number", "cell number"],
  address: ["address", "physical address", "street address"],
  postal_address: ["postal address", "postal", "mailing address", "po box"],
  vat_number: ["vat number", "vat no", "vat reg no", "vat registration number", "tax number"],
  legacy_pastel_customer_code: ["customer code", "account code", "customer id", "account number", "code"],
  notes: ["notes", "comment", "comments", "remarks"],
};

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Given raw spreadsheet headers, pre-select a best-guess mapping to APP_FIELDS keys. */
export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    let matchedKey = null;
    for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      if (used.has(key)) continue;
      if (synonyms.includes(normalized)) { matchedKey = key; break; }
    }
    if (matchedKey) { mapping[header] = matchedKey; used.add(matchedKey); }
    else mapping[header] = null;
  }
  return mapping;
}

export function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : "";
}

/** Digits only, with leading South African country code (27) or trunk "0" stripped, so
 * "+27 21 123 4567", "0211234567", and "27 21 123 4567" all compare equal on the same
 * canonical 9-digit local number, without discarding/rewriting the original stored value
 * anywhere -- this is only used for duplicate-matching comparisons. */
export function normalizePhone(value) {
  if (!value) return "";
  let digits = String(value).replace(/[^\d]/g, "");
  if (digits.startsWith("27") && digits.length > 9) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length > 9) digits = digits.slice(1);
  return digits;
}

export function normalizeName(value) {
  return value ? String(value).trim().toLowerCase().replace(/\s+/g, " ") : "";
}

/** Looser than normalizeName -- strips ALL whitespace and non-alphanumeric characters, so
 * "XYZ Air Con (Pty) Ltd" and "XYZ Aircon (Pty) Ltd" compare equal for possible-duplicate
 * purposes. Only used for the fuzzy possible_duplicate signal, never for exact_match --
 * exact_match still requires a strong signal (code/email/phone), so this being loose can't
 * cause a false exact_match, only a possible_duplicate flag for a human to review. */
function normalizeNameLoose(value) {
  return value ? String(value).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

/** Apply a header->field mapping to one raw spreadsheet row, producing a clients-shaped
 * object. Fields mapped to a NOTES_APPENDIX_FIELDS key (mobile/postal_address/vat_number --
 * real, named import targets that don't have their own clients column yet) are appended
 * into `notes` as labelled lines, never dropped. Unmapped source columns the caller wants
 * preserved should be passed via `extraColumnsToKeep` (header names) -- same treatment.
 * Trims whitespace on every field; does not rewrite legitimate content otherwise (per
 * explicit instruction not to aggressively rewrite data).
 */
export function normalizeRow(rawRow, mapping, extraColumnsToKeep = []) {
  const out = {};
  const noteLines = [];
  for (const [header, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey) continue;
    const value = rawRow[header];
    if (value === undefined || value === null) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    if (NOTES_APPENDIX_FIELDS[fieldKey]) {
      noteLines.push(`${NOTES_APPENDIX_FIELDS[fieldKey]}: ${trimmed}`);
      continue;
    }
    out[fieldKey] = fieldKey === "email" ? normalizeEmail(trimmed) : trimmed;
  }
  const extras = extraColumnsToKeep
    .filter((header) => mapping[header] === null && rawRow[header] != null && String(rawRow[header]).trim())
    .map((header) => `${header}: ${String(rawRow[header]).trim()}`);
  const allExtraLines = [...noteLines, ...extras];
  if (allExtraLines.length) {
    out.notes = [out.notes, ...allExtraLines].filter(Boolean).join("\n");
  }
  return out;
}

// Generous sanity ceilings, not business rules -- these exist only to catch a mis-mapped
// column dumping an entire cell's worth of unrelated data into the wrong field (a common
// real Excel-export failure mode), not to constrain legitimate business data. None of these
// are enforced by the database (public.clients' text columns are unbounded), so they are
// deliberately loose. Never applied to fields the user hasn't chosen to import.
const FIELD_MAX_LENGTHS = {
  company_name: 300,
  contact_person: 300,
  email: 320, // RFC 5321 max mailbox length
  phone: 40,
  address: 2000,
  legacy_pastel_customer_code: 100,
  notes: 10000,
};

// Deliberately permissive (matches real-world messy export data) -- only rejects strings
// with no "@" or no "." after the "@" at all, not full RFC validation. An email this loose
// check would reject is almost certainly a data-entry/mapping error, not a real address.
const LOOSE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Per-row validation before ANY database write is attempted (2026-08-16, hardening pass).
 * Deliberately does NOT invent new required fields -- company_name remains the only
 * required field, matching the pre-existing rule and the real public.clients schema
 * (every other column is nullable). Optional fields stay optional: a blank/unmapped email
 * or phone is never an error, only a malformed *non-blank* one is.
 */
export function validateRow(row) {
  const errors = [];
  if (!row.company_name || !row.company_name.trim()) errors.push("Missing customer/company name");
  if (row.email && !LOOSE_EMAIL_PATTERN.test(row.email)) errors.push(`Email does not look valid: "${row.email}"`);
  for (const [field, max] of Object.entries(FIELD_MAX_LENGTHS)) {
    if (row[field] && String(row[field]).length > max) {
      errors.push(`${field.replace(/_/g, " ")} is unusually long (${row[field].length} characters) -- check the column mapping`);
    }
  }
  return errors;
}

/**
 * Classify a normalized import row against the REAL, already-known database clients only.
 * Returns { status: "new" | "possible_duplicate" | "exact_match", existingClientId,
 * reasons }. `existingClientId` is ALWAYS either a genuine `clients.id` UUID (sourced
 * directly from an `existingClients` row) or `null` -- never anything synthesized here.
 * See `findFilePoolDuplicate` below for the SEPARATE, intra-file duplicate signal this
 * function intentionally does not produce.
 *
 * Conservative by design (per explicit instruction): name-only similarity is only ever a
 * "possible_duplicate", never an "exact_match". An exact_match requires a strong signal
 * (matching legacy_pastel_customer_code, or matching email, or matching normalized phone).
 */
export function classifyRow(row, existingClients) {
  const reasons = [];
  let strongMatch = null;
  let nameMatch = null;

  const rowEmail = normalizeEmail(row.email);
  const rowPhone = normalizePhone(row.phone);
  const rowNameLoose = normalizeNameLoose(row.company_name);
  const rowCode = row.legacy_pastel_customer_code ? String(row.legacy_pastel_customer_code).trim() : "";

  for (const existing of existingClients) {
    const exCode = existing.legacy_pastel_customer_code ? String(existing.legacy_pastel_customer_code).trim() : "";
    const exEmail = normalizeEmail(existing.email);
    const exPhone = normalizePhone(existing.phone);
    const exNameLoose = normalizeNameLoose(existing.company_name);

    const codeMatches = rowCode && exCode && rowCode === exCode;
    const emailMatches = rowEmail && exEmail && rowEmail === exEmail;
    const phoneMatches = rowPhone && exPhone.length >= 7 && rowPhone === exPhone;
    // Loose match (whitespace/punctuation-insensitive) so real-world formatting variants
    // ("Air Con" vs "Aircon", "(Pty) Ltd" vs "Pty Ltd") are still caught as a possible
    // duplicate for a human to review -- never auto-promoted to exact_match on its own.
    const nameMatches = rowNameLoose && exNameLoose && rowNameLoose === exNameLoose;

    if (codeMatches) { strongMatch = existing; reasons.push(`Same customer code (${rowCode})`); break; }
    if (emailMatches) { strongMatch = existing; reasons.push(`Same email (${row.email})`); break; }
    if (phoneMatches) { strongMatch = existing; reasons.push(`Same phone number (${row.phone})`); break; }
    if (nameMatches && !nameMatch) { nameMatch = existing; }
  }

  if (strongMatch) {
    return { status: "exact_match", existingClientId: strongMatch.id, reasons };
  }
  if (nameMatch) {
    return { status: "possible_duplicate", existingClientId: nameMatch.id, reasons: [`Similar name to existing client "${nameMatch.company_name}"`] };
  }
  return { status: "new", existingClientId: null, reasons: [] };
}

/**
 * ROOT-CAUSE FIX (2026-08-16): a real Pastel/Sage export can itself contain the same
 * customer twice (or more), not just duplicates of already-known database customers. The
 * previous implementation caught this by adding "new" rows to the SAME pool `classifyRow`
 * matched against real `existingClients`, tagged with a synthetic `id: "row-17"` -- which
 * meant a later row matching an EARLIER ROW IN THE SAME FILE (not the database) came back
 * from classifyRow with `matchId: "row-17"`, a string that is not a UUID and does not exist
 * in `public.clients`. "Update Existing" then sent it straight to
 * `PATCH /clients?id=eq.row-17`, which Postgres correctly rejected with `22P02 invalid input
 * syntax for type uuid`. That failure was silent about *why* -- the row was never actually
 * matched to a database record at all, it only resembled a row that hadn't been saved yet.
 *
 * The fix is a genuinely separate identity: this function is called only against
 * `filePool` (in-file rows seen so far that were NOT themselves matched to a real database
 * client), completely independent of `classifyRow`'s `existingClients` matching above.
 * It returns a row INDEX (a real, harmless number -- never sent to Supabase, never
 * confused with a UUID) or null, never a synthetic id string standing in for a database key.
 */
export function findFilePoolDuplicate(row, filePool) {
  const rowEmail = normalizeEmail(row.email);
  const rowPhone = normalizePhone(row.phone);
  const rowNameLoose = normalizeNameLoose(row.company_name);
  const rowCode = row.legacy_pastel_customer_code ? String(row.legacy_pastel_customer_code).trim() : "";

  for (const entry of filePool) {
    const exCode = entry.normalized.legacy_pastel_customer_code ? String(entry.normalized.legacy_pastel_customer_code).trim() : "";
    const exEmail = normalizeEmail(entry.normalized.email);
    const exPhone = normalizePhone(entry.normalized.phone);
    const exNameLoose = normalizeNameLoose(entry.normalized.company_name);

    if (rowCode && exCode && rowCode === exCode) {
      return { rowIndex: entry.index, reason: `Same customer code (${rowCode}) as row ${entry.index + 1} in this file` };
    }
    if (rowEmail && exEmail && rowEmail === exEmail) {
      return { rowIndex: entry.index, reason: `Same email as row ${entry.index + 1} in this file` };
    }
    if (rowPhone && exPhone.length >= 7 && rowPhone === exPhone) {
      return { rowIndex: entry.index, reason: `Same phone number as row ${entry.index + 1} in this file` };
    }
    if (rowNameLoose && exNameLoose && rowNameLoose === exNameLoose) {
      return { rowIndex: entry.index, reason: `Similar name to row ${entry.index + 1} in this file` };
    }
  }
  return null;
}

/**
 * Build the field payload for UPDATING an already-existing client from a normalized import
 * row (2026-08-16: "update the customers" from a repeat Pastel/Sage export, not just import
 * new ones). Deliberately partial/non-destructive:
 * - Only fields the row actually has a new (truthy) value for are included -- a spreadsheet
 *   column left unmapped, or blank on this particular row, never blanks out existing data
 *   the app already has for that client.
 * - `notes` is APPENDED to the existing client's current notes, never overwritten, so
 *   manually-typed service notes unrelated to the accounting export survive an update.
 * - `is_active` is never touched here -- that flag is only ever set (to true) on create, an
 *   update should never silently reactivate/deactivate a client as a side effect of a
 *   Pastel refresh.
 */
export function buildUpdatePayload(row, existingClient) {
  const payload = {};
  for (const field of ["company_name", "contact_person", "email", "phone", "address", "legacy_pastel_customer_code"]) {
    if (row[field]) payload[field] = row[field];
  }
  if (row.notes) {
    const existingNotes = (existingClient?.notes || "").trim();
    const stamp = `Updated from import ${new Date().toISOString().slice(0, 10)}:\n${row.notes}`;
    payload.notes = existingNotes ? `${existingNotes}\n\n${stamp}` : stamp;
  }
  return payload;
}

/**
 * Build the full preview for a parsed spreadsheet: per-row validation + duplicate
 * classification, plus totals for the summary the administrator reviews before confirming.
 *
 * Checks each row against BOTH the existing database (`existingClients`, via `classifyRow`)
 * AND every already-processed row earlier in the same spreadsheet that ISN'T itself a
 * database match (via `findFilePoolDuplicate`) -- a real Pastel export can itself contain
 * duplicate/repeated rows, not just duplicates of already-known customers. These are two
 * genuinely separate signals with two separate identity types (`existingClientId`, a real
 * `clients.id` UUID or null; `duplicateOfRowIndex`, a row number or null) -- deliberately
 * never merged into one field, which is exactly the bug this shape fixes (see
 * `findFilePoolDuplicate`'s own doc comment for the full history).
 *
 * A row only enters the in-file pool if it wasn't matched to either a real database client
 * OR an earlier file row -- otherwise every subsequent occurrence would start colliding with
 * a duplicate's own (potentially inconsistent) data instead of the original. A 3rd occurrence
 * of the same row later in the file still correctly matches the 1st (the one actually in the
 * pool), so nothing is lost by not also pooling duplicates.
 */
export function buildPreview(rawRows, mapping, existingClients, extraColumnsToKeep = []) {
  const filePool = [];
  const rows = rawRows.map((rawRow, index) => {
    const normalized = normalizeRow(rawRow, mapping, extraColumnsToKeep);
    const errors = validateRow(normalized);
    if (errors.length > 0) {
      return { index, raw: rawRow, normalized, errors, status: "invalid", existingClientId: null, duplicateOfRowIndex: null, reasons: [] };
    }

    const dbMatch = classifyRow(normalized, existingClients);
    if (dbMatch.status !== "new") {
      return { index, raw: rawRow, normalized, errors, ...dbMatch, duplicateOfRowIndex: null };
    }

    const fileMatch = findFilePoolDuplicate(normalized, filePool);
    if (fileMatch) {
      return {
        index, raw: rawRow, normalized, errors,
        status: "duplicate_in_file",
        existingClientId: null,
        duplicateOfRowIndex: fileMatch.rowIndex,
        reasons: [fileMatch.reason],
      };
    }

    filePool.push({ index, normalized });
    return { index, raw: rawRow, normalized, errors, status: "new", existingClientId: null, duplicateOfRowIndex: null, reasons: [] };
  });

  const summary = {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    possible_duplicate: rows.filter((r) => r.status === "possible_duplicate").length,
    exact_match: rows.filter((r) => r.status === "exact_match").length,
    duplicate_in_file: rows.filter((r) => r.status === "duplicate_in_file").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };

  return { rows, summary };
}

/**
 * Executes the import for a set of preview rows (from `buildPreview`), one row at a time,
 * with EACH ROW'S SUCCESS OR FAILURE FULLY ISOLATED from every other row.
 *
 * 2026-08-16 reliability rewrite: previously the whole batch ran inside one try/catch, so a
 * single row's error (originally the "row-17" id-type-confusion bug, but any other row-level
 * error would have the same effect) aborted every remaining row -- against a real ~877-row
 * file, the database was left in a partial, uncertain state with no way to safely continue.
 * Now every row's outcome is recorded independently and the loop always runs to completion,
 * so a full run always produces an accurate final count, never a partial abort.
 *
 * Framework/network-free by design (like the rest of this file) -- `deps.createClient`/
 * `deps.updateClient` are injected so the exact same failure-isolation/retry logic the real
 * UI runs can be unit tested with fake implementations that fail on cue, with no live
 * Supabase connection needed (see customerImport.test.js).
 *
 * @param rows - preview rows to execute (a full run, or just a retry subset).
 * @param getDecision - (row) => "import" | "update" | "skip".
 * @param existingClients - current known existing clients; used both to build the
 *   non-destructive update payload (existingClient.notes) and, when `reclassifyOnRetry` is
 *   set, to re-resolve a row's real target before retrying it.
 * @param deps.createClient - async (fields) => createdRow (must include the real `.id`
 *   Postgres generated).
 * @param deps.updateClient - async (id, fields) => void.
 * @param reclassifyOnRetry - true for a retry run: re-classifies each "update" row against
 *   the (caller-refreshed) `existingClients` list before executing, so a retry correctly
 *   targets anything a previous attempt already created/changed instead of using a
 *   preview-time-stale id (idempotency safety -- prevents a retry from creating duplicates).
 * @returns { [rowIndex]: { status: "success"|"updated"|"skipped"|"failed", clientId?, error? } }
 */
export async function executeImportRows(rows, getDecision, existingClients, deps, reclassifyOnRetry = false) {
  const results = {};
  for (const row of rows) {
    const decision = getDecision(row);
    if (row.status === "invalid" || decision === "skip") {
      results[row.index] = { status: "skipped" };
      continue;
    }
    try {
      if (decision === "update") {
        let targetId = row.existingClientId;
        if (reclassifyOnRetry) {
          const reclassified = classifyRow(row.normalized, existingClients);
          if (reclassified.existingClientId) targetId = reclassified.existingClientId;
        }
        if (!targetId) {
          results[row.index] = {
            status: "failed",
            error: "This row could not be matched to an existing customer to update.",
          };
          continue;
        }
        // Defense-in-depth: structurally, targetId can now only ever come from a real
        // existingClients row (see the identity-model rewrite above), but this assertion
        // makes it immediately obvious -- instead of a raw Postgres 22P02 error -- if that
        // ever regresses. See isValidUuid's doc comment.
        if (!isValidUuid(targetId)) {
          results[row.index] = {
            status: "failed",
            error: `Internal error: expected a database ID, got "${targetId}". This row was not sent to the database.`,
          };
          continue;
        }
        const existingClient = existingClients.find((c) => c.id === targetId);
        const payload = buildUpdatePayload(row.normalized, existingClient);
        if (Object.keys(payload).length > 0) {
          await deps.updateClient(targetId, payload);
        }
        results[row.index] = { status: "updated", clientId: targetId };
      } else {
        const created = await deps.createClient({
          company_name: row.normalized.company_name,
          contact_person: row.normalized.contact_person || null,
          email: row.normalized.email || null,
          phone: row.normalized.phone || null,
          address: row.normalized.address || null,
          notes: row.normalized.notes || null,
          legacy_pastel_customer_code: row.normalized.legacy_pastel_customer_code || null,
          is_active: true,
        });
        results[row.index] = { status: "success", clientId: created?.id };
      }
    } catch (e) {
      results[row.index] = {
        status: "failed",
        error: e.message || "Unknown error",
        errorCode: e.code || null,
      };
    }
  }
  return results;
}
