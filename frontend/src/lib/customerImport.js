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

export function validateRow(row) {
  const errors = [];
  if (!row.company_name || !row.company_name.trim()) errors.push("Missing customer/company name");
  return errors;
}

/**
 * Classify a normalized import row against already-known existing clients.
 * Returns { status: "new" | "possible_duplicate" | "exact_match", reasons: string[] }.
 *
 * Conservative by design (per explicit instruction): name-only similarity is only ever a
 * "possible_duplicate", never an "exact_match". An exact_match requires a strong signal
 * (matching legacy_pastel_customer_code, or matching email, or matching normalized phone)
 * or an exact normalized-name match combined with at least one other matching signal.
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
    return { status: "exact_match", matchId: strongMatch.id, reasons };
  }
  if (nameMatch) {
    return { status: "possible_duplicate", matchId: nameMatch.id, reasons: [`Similar name to existing client "${nameMatch.company_name}"`] };
  }
  return { status: "new", matchId: null, reasons: [] };
}

/**
 * Build the full preview for a parsed spreadsheet: per-row validation + duplicate
 * classification, plus totals for the summary the administrator reviews before confirming.
 *
 * Checks each row against BOTH the existing database (`existingClients`) AND every
 * already-processed row earlier in the same spreadsheet -- a real Pastel export can itself
 * contain duplicate/repeated rows, not just duplicates of already-known customers. A row
 * that would import is added to the running "known" pool (tagged with a synthetic id) so
 * later rows in the same file can be flagged against it too.
 */
export function buildPreview(rawRows, mapping, existingClients, extraColumnsToKeep = []) {
  const knownPool = [...existingClients];
  const rows = rawRows.map((rawRow, index) => {
    const normalized = normalizeRow(rawRow, mapping, extraColumnsToKeep);
    const errors = validateRow(normalized);
    const classification = errors.length === 0 ? classifyRow(normalized, knownPool) : { status: "invalid", matchId: null, reasons: [] };
    // Only add to the pool if it's not itself flagged as a duplicate of something already
    // in the pool -- otherwise every subsequent "new" row would also start colliding with
    // a duplicate's own (potentially inconsistent) data instead of the original. A 3rd
    // occurrence of the same row later in the file still correctly matches the 1st (the
    // one actually in the pool), so nothing is lost by not also pooling duplicates.
    if (classification.status === "new") {
      knownPool.push({ id: `row-${index}`, ...normalized });
    }
    return { index, raw: rawRow, normalized, errors, ...classification };
  });

  const summary = {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    possible_duplicate: rows.filter((r) => r.status === "possible_duplicate").length,
    exact_match: rows.filter((r) => r.status === "exact_match").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };

  return { rows, summary };
}
