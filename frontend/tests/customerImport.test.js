import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guessMapping, normalizeRow, normalizeEmail, normalizePhone, validateRow, classifyRow, buildPreview,
  buildUpdatePayload, findFilePoolDuplicate, isValidUuid, executeImportRows, classifyImportError,
  findDuplicateClientGroups,
} from "../src/lib/customerImport.js";

test("guessMapping pre-selects obvious header matches", () => {
  const headers = ["Customer Name", "Contact Person", "Telephone", "Email", "Random Column"];
  const mapping = guessMapping(headers);
  assert.equal(mapping["Customer Name"], "company_name");
  assert.equal(mapping["Contact Person"], "contact_person");
  assert.equal(mapping["Telephone"], "phone");
  assert.equal(mapping["Email"], "email");
  assert.equal(mapping["Random Column"], null);
});

test("normalizeRow trims and lower-cases email, preserves other legitimate text", () => {
  const mapping = { "Customer Name": "company_name", "Email": "email" };
  const row = normalizeRow({ "Customer Name": "  ABC Refrigeration  ", "Email": "  CUSTOMER@EXAMPLE.COM " }, mapping);
  assert.equal(row.company_name, "ABC Refrigeration");
  assert.equal(row.email, "customer@example.com");
});

test("normalizeRow appends unmapped-but-kept columns into notes, labelled", () => {
  const mapping = { "Customer Name": "company_name", "Some Extra Column": null };
  const row = normalizeRow({ "Customer Name": "ABC", "Some Extra Column": "keep me" }, mapping, ["Some Extra Column"]);
  assert.equal(row.notes, "Some Extra Column: keep me");
});

test("normalizeRow routes named notes-appendix fields (mobile/postal_address/vat_number) into labelled notes lines, not their own column", () => {
  const mapping = { "Customer Name": "company_name", "VAT Reg No": "vat_number", "Cell": "mobile", "Postal Addr": "postal_address" };
  const row = normalizeRow({
    "Customer Name": "ABC", "VAT Reg No": "4123456789", "Cell": "082 555 1234", "Postal Addr": "PO Box 1, Cape Town",
  }, mapping);
  assert.equal(row.vat_number, undefined);
  assert.equal(row.mobile, undefined);
  assert.equal(row.postal_address, undefined);
  assert.match(row.notes, /VAT Number: 4123456789/);
  assert.match(row.notes, /Mobile: 082 555 1234/);
  assert.match(row.notes, /Postal Address: PO Box 1, Cape Town/);
});

test("guessMapping distinguishes phone (landline) from mobile from postal_address from vat_number", () => {
  const headers = ["Telephone", "Mobile", "Postal Address", "VAT Number"];
  const mapping = guessMapping(headers);
  assert.equal(mapping["Telephone"], "phone");
  assert.equal(mapping["Mobile"], "mobile");
  assert.equal(mapping["Postal Address"], "postal_address");
  assert.equal(mapping["VAT Number"], "vat_number");
});

test("normalizePhone strips formatting so equivalent numbers compare equal", () => {
  assert.equal(normalizePhone("+27 21 123 4567"), normalizePhone("0211234567"));
});

test("validateRow flags missing company name as required (still the ONLY required field)", () => {
  assert.deepEqual(validateRow({ company_name: "" }), ["Missing customer/company name"]);
  assert.deepEqual(validateRow({ company_name: "ABC" }), []);
});

test("validateRow: malformed non-blank email is flagged, blank/missing email is not (stays optional)", () => {
  assert.deepEqual(validateRow({ company_name: "ABC", email: "not-an-email" }), [
    'Email does not look valid: "not-an-email"',
  ]);
  assert.deepEqual(validateRow({ company_name: "ABC", email: "" }), []);
  assert.deepEqual(validateRow({ company_name: "ABC" }), []);
  assert.deepEqual(validateRow({ company_name: "ABC", email: "real@example.com" }), []);
});

test("validateRow: excessively long field flags for review without inventing a new required field", () => {
  const errors = validateRow({ company_name: "ABC", address: "x".repeat(3000) });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /address is unusually long/);
});

test("classifyRow: no existing clients -> always new", () => {
  const result = classifyRow({ company_name: "ABC Refrigeration" }, []);
  assert.equal(result.status, "new");
  assert.equal(result.existingClientId, null);
});

test("classifyRow: matching legacy_pastel_customer_code -> exact_match, existingClientId is the REAL database id", () => {
  const existing = [{ id: "11111111-1111-1111-1111-111111111111", company_name: "ABC Refrigeration", legacy_pastel_customer_code: "C001" }];
  const result = classifyRow({ company_name: "ABC Refrigeration (Pty) Ltd", legacy_pastel_customer_code: "C001" }, existing);
  assert.equal(result.status, "exact_match");
  assert.equal(result.existingClientId, "11111111-1111-1111-1111-111111111111");
});

test("classifyRow: matching email -> exact_match even with different name casing", () => {
  const existing = [{ id: "22222222-2222-2222-2222-222222222222", company_name: "XYZ Air Con", email: "info@xyz.co.za" }];
  const result = classifyRow({ company_name: "XYZ Aircon", email: "INFO@XYZ.CO.ZA" }, existing);
  assert.equal(result.status, "exact_match");
  assert.equal(result.existingClientId, "22222222-2222-2222-2222-222222222222");
});

test("classifyRow: same normalized name only -> possible_duplicate (not exact_match), still carries the real database id", () => {
  const existing = [{ id: "33333333-3333-3333-3333-333333333333", company_name: "ABC Refrigeration" }];
  const result = classifyRow({ company_name: "abc refrigeration" }, existing);
  assert.equal(result.status, "possible_duplicate");
  assert.equal(result.existingClientId, "33333333-3333-3333-3333-333333333333");
});

test("classifyRow: different name and no other signal -> new", () => {
  const existing = [{ id: "44444444-4444-4444-4444-444444444444", company_name: "ABC Refrigeration" }];
  const result = classifyRow({ company_name: "Totally Different Co" }, existing);
  assert.equal(result.status, "new");
  assert.equal(result.existingClientId, null);
});

// ---------------------------------------------------------------------------------------
// ROOT-CAUSE REGRESSION COVERAGE (2026-08-16): "invalid input syntax for type uuid: row-17"
// ---------------------------------------------------------------------------------------

test("isValidUuid rejects the exact string that broke production, accepts a real UUID", () => {
  assert.equal(isValidUuid("row-17"), false);
  assert.equal(isValidUuid("row-0"), false);
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
  assert.equal(isValidUuid(17), false);
  assert.equal(isValidUuid("11111111-1111-1111-1111-111111111111"), true);
});

test("findFilePoolDuplicate matches an earlier in-file row and returns a ROW INDEX, never a synthetic id string", () => {
  const filePool = [{ index: 3, normalized: { company_name: "ABC Refrigeration", email: "abc@example.com" } }];
  const match = findFilePoolDuplicate({ company_name: "ABC Refrigeration", email: "abc@example.com" }, filePool);
  assert.equal(match.rowIndex, 3);
  assert.equal(typeof match.rowIndex, "number");
});

test("findFilePoolDuplicate returns null when nothing in the pool resembles the row", () => {
  const filePool = [{ index: 0, normalized: { company_name: "Totally Different Co" } }];
  assert.equal(findFilePoolDuplicate({ company_name: "ABC Refrigeration" }, filePool), null);
});

test("TEST 7 (user spec): buildPreview NEVER produces an existingClientId that isn't a real UUID, even when a row duplicates an earlier in-file row", () => {
  // The exact shape that broke production: row 0 is "new" (no database match), row 1 is an
  // exact repeat of row 0 WITHIN THE SAME FILE, and there is no existing database client at
  // all. Before the fix, row 1 would classify as exact_match with matchId "row-0" (or
  // possible_duplicate, depending on which signal matched) and could be sent straight to
  // Supabase as a clients.id. Now it must be a completely separate status.
  const mapping = { "Customer Name": "company_name", "Email": "email" };
  const rawRows = [
    { "Customer Name": "ABC Refrigeration", "Email": "abc@example.com" },
    { "Customer Name": "ABC Refrigeration", "Email": "abc@example.com" }, // repeats row 0, no DB match exists
  ];
  const { rows } = buildPreview(rawRows, mapping, /* existingClients */ []);
  assert.equal(rows[0].status, "new");
  assert.equal(rows[0].existingClientId, null);
  assert.equal(rows[1].status, "duplicate_in_file");
  assert.equal(rows[1].existingClientId, null); // <-- the critical assertion
  assert.equal(rows[1].duplicateOfRowIndex, 0);
  // Every row in the whole preview: existingClientId is either null or a real UUID, full stop.
  for (const row of rows) {
    assert.ok(row.existingClientId === null || isValidUuid(row.existingClientId),
      `row ${row.index} has a non-UUID existingClientId: ${row.existingClientId}`);
  }
});

test("a row matching BOTH a real existing client and an earlier in-file row prioritises the real database match", () => {
  const mapping = { "Customer Name": "company_name", "Email": "email" };
  const existingClients = [{ id: "55555555-5555-5555-5555-555555555555", company_name: "Existing Co", email: "existing@example.com" }];
  const rawRows = [
    { "Customer Name": "Existing Co", "Email": "existing@example.com" }, // exact_match against DB
    { "Customer Name": "Existing Co", "Email": "existing@example.com" }, // also exact_match against DB (not duplicate_in_file)
  ];
  const { rows } = buildPreview(rawRows, mapping, existingClients);
  assert.equal(rows[0].status, "exact_match");
  assert.equal(rows[1].status, "exact_match");
  assert.equal(rows[1].existingClientId, "55555555-5555-5555-5555-555555555555");
});

test("TEST 3 (user spec): mixed import (New, New, Exact Match, New, Exact Match, Possible Duplicate) classifies every row correctly", () => {
  const mapping = { "Customer Name": "company_name", "Email": "email", "Code": "legacy_pastel_customer_code" };
  const existingClients = [
    { id: "66666666-6666-6666-6666-666666666666", company_name: "Blue Aircon", email: "blue@example.com" },
    { id: "77777777-7777-7777-7777-777777777777", company_name: "Red Refrigeration", legacy_pastel_customer_code: "C099" },
  ];
  const rawRows = [
    { "Customer Name": "Brand New Co A", "Email": "", "Code": "" },
    { "Customer Name": "Brand New Co B", "Email": "", "Code": "" },
    { "Customer Name": "Blue Aircon", "Email": "blue@example.com", "Code": "" },
    { "Customer Name": "Brand New Co C", "Email": "", "Code": "" },
    { "Customer Name": "Red Refrigeration (Pty) Ltd", "Email": "", "Code": "C099" },
    { "Customer Name": "red refrigeration", "Email": "", "Code": "" }, // name-only vs. the existing "Red Refrigeration"
  ];
  const { rows, summary } = buildPreview(rawRows, mapping, existingClients);
  assert.deepEqual(rows.map((r) => r.status), [
    "new", "new", "exact_match", "new", "exact_match", "possible_duplicate",
  ]);
  assert.equal(summary.new, 3);
  assert.equal(summary.exact_match, 2);
  assert.equal(summary.possible_duplicate, 1);
});

test("buildPreview: end-to-end summary counts match a small mixed test file (regression, existingClientId shape)", () => {
  const mapping = { "Customer Name": "company_name", "Email": "email" };
  const existingClients = [{ id: "88888888-8888-8888-8888-888888888888", company_name: "Existing Client", email: "existing@example.com" }];
  const rawRows = [
    { "Customer Name": "New Customer", "Email": "new@example.com" },       // new
    { "Customer Name": "Existing Client", "Email": "existing@example.com" }, // exact_match (email)
    { "Customer Name": "", "Email": "missing-name@example.com" },          // invalid
    { "Customer Name": "existing client", "Email": "" },                  // possible_duplicate (name only)
  ];
  const { summary, rows } = buildPreview(rawRows, mapping, existingClients);
  assert.equal(summary.total, 4);
  assert.equal(summary.new, 1);
  assert.equal(summary.exact_match, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.possible_duplicate, 1);
  assert.equal(rows[1].existingClientId, "88888888-8888-8888-8888-888888888888");
});

test("TEST 10 (user spec): possible_duplicate rows carry a real existingClientId (so a human CAN choose update) but are never auto-classified exact_match", () => {
  const existing = [{ id: "99999999-9999-9999-9999-999999999999", company_name: "ABC Refrigeration" }];
  const result = classifyRow({ company_name: "abc refrigeration" }, existing);
  assert.equal(result.status, "possible_duplicate");
  assert.ok(isValidUuid(result.existingClientId)); // update IS possible if the user explicitly picks it
  assert.notEqual(result.status, "exact_match"); // but never auto-promoted
});

test("buildUpdatePayload only includes fields the row actually has a new value for", () => {
  const row = { company_name: "ABC Refrigeration", phone: "0211234567" };
  const payload = buildUpdatePayload(row, { notes: "Old notes" });
  assert.deepEqual(payload, { company_name: "ABC Refrigeration", phone: "0211234567" });
  assert.equal(payload.email, undefined);
  assert.equal(payload.is_active, undefined);
});

test("TEST 8 (user spec): blank optional CSV fields do not overwrite existing values", () => {
  // The row only has company_name mapped/filled -- phone/email/address are blank on this
  // particular CSV row (not necessarily unmapped, just empty for this customer).
  const row = { company_name: "ABC Refrigeration" };
  const payload = buildUpdatePayload(row, { phone: "0211234567", email: "existing@example.com", address: "123 Main Rd" });
  assert.deepEqual(payload, { company_name: "ABC Refrigeration" });
  // The existing client's own phone/email/address are simply never mentioned in the
  // payload sent to Supabase -- an update() call with these keys omitted cannot blank them.
});

test("TEST 9 (user spec): notes are appended to the existing client's notes, never overwritten", () => {
  const row = { company_name: "ABC", notes: "VAT Number: 4123456789" };
  const payload = buildUpdatePayload(row, { notes: "Technician says compressor due for service." });
  assert.match(payload.notes, /Technician says compressor due for service\./);
  assert.match(payload.notes, /VAT Number: 4123456789/);
  assert.ok(payload.notes.indexOf("Technician says") < payload.notes.indexOf("VAT Number"));
});

test("buildUpdatePayload with no existing notes just uses the new notes, no leading blank stamp text", () => {
  const row = { company_name: "ABC", notes: "Cell: 0825551234" };
  const payload = buildUpdatePayload(row, { notes: "" });
  assert.match(payload.notes, /Cell: 0825551234/);
});

test("buildUpdatePayload never includes notes when the row has none", () => {
  const row = { company_name: "ABC" };
  const payload = buildUpdatePayload(row, { notes: "Existing notes stay untouched" });
  assert.equal(payload.notes, undefined);
});

// ---------------------------------------------------------------------------------------
// executeImportRows: failure isolation / retry / idempotency (framework-free, fake deps)
// ---------------------------------------------------------------------------------------

function fakeRow(index, overrides = {}) {
  return {
    index,
    normalized: { company_name: `Customer ${index}` },
    status: "new",
    existingClientId: null,
    duplicateOfRowIndex: null,
    errors: [],
    ...overrides,
  };
}

test("TEST 1 (user spec): 10 entirely new customers -> 10 created, each result carries the real created id", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => fakeRow(i));
  let created = 0;
  const deps = {
    createClient: async () => { created += 1; return { id: `uuid-${created}` }; },
    updateClient: async () => { throw new Error("should not be called for new rows"); },
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(created, 10);
  assert.equal(Object.values(results).filter((r) => r.status === "success").length, 10);
  assert.equal(results[0].clientId, "uuid-1");
});

test("TEST 2 (user spec): existing customers update using the REAL database UUID, never row.index/synthetic id", async () => {
  const existingClients = [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", notes: "" }];
  const rows = [fakeRow(0, { status: "exact_match", existingClientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" })];
  const updateCalls = [];
  const deps = {
    createClient: async () => { throw new Error("should not be called for update rows"); },
    updateClient: async (id, payload) => { updateCalls.push({ id, payload }); },
  };
  const results = await executeImportRows(rows, () => "update", existingClients, deps);
  assert.equal(results[0].status, "updated");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.ok(isValidUuid(updateCalls[0].id));
});

test("TEST 4 (user spec): a failure partway through does not abort the batch -- every row still gets a result", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => fakeRow(i));
  const deps = {
    createClient: async (fields) => {
      if (fields.company_name === "Customer 2") throw Object.assign(new Error("simulated failure"), { code: "22P02" });
      return { id: `uuid-${fields.company_name}` };
    },
    updateClient: async () => {},
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(Object.keys(results).length, 5); // every row got a result, none silently dropped
  assert.equal(results[2].status, "failed");
  assert.equal(results[2].error, "simulated failure");
  assert.equal(results[2].errorCode, "22P02");
  // TEST 11 (user spec): failed row is correctly represented.
  // TEST 12 (user spec): the OTHER 4 rows are not incorrectly marked as failed.
  assert.equal(results[0].status, "success");
  assert.equal(results[1].status, "success");
  assert.equal(results[3].status, "success");
  assert.equal(results[4].status, "success");
});

test("TEST 5 (user spec): retrying only the failed rows does not touch rows that already succeeded", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => fakeRow(i));
  let createCalls = 0;
  const deps = {
    createClient: async () => { createCalls += 1; return { id: `uuid-${createCalls}` }; },
    updateClient: async () => {},
  };
  // First pass: row 1 fails.
  const firstDeps = {
    createClient: async (fields) => {
      createCalls += 1;
      if (fields.company_name === "Customer 1") throw new Error("simulated failure");
      return { id: `uuid-${createCalls}` };
    },
    updateClient: async () => {},
  };
  const firstResults = await executeImportRows(rows, () => "import", [], firstDeps);
  assert.equal(firstResults[1].status, "failed");
  const callsAfterFirstPass = createCalls;

  // Retry: only row 1 is re-run.
  const failedOnly = rows.filter((r) => firstResults[r.index].status === "failed");
  const retryResults = await executeImportRows(failedOnly, () => "import", [], deps);
  assert.equal(Object.keys(retryResults).length, 1);
  assert.equal(retryResults[1].status, "success");
  assert.equal(createCalls, callsAfterFirstPass + 1); // exactly one more create call, not 3
});

test("TEST 6 (user spec): re-importing the same CSV after a client now exists correctly updates instead of duplicating", async () => {
  // Simulates: row was "new" and got created in a first run; a second run of the SAME file
  // re-classifies it (via a fresh existingClients fetch) as exact_match instead.
  const createdClient = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", company_name: "ABC Refrigeration", legacy_pastel_customer_code: "C123" };
  const reclassified = classifyRow({ company_name: "ABC Refrigeration", legacy_pastel_customer_code: "C123" }, [createdClient]);
  assert.equal(reclassified.status, "exact_match");
  assert.equal(reclassified.existingClientId, createdClient.id);

  const row = fakeRow(0, { status: "exact_match", existingClientId: createdClient.id, normalized: { company_name: "ABC Refrigeration", legacy_pastel_customer_code: "C123" } });
  let createCalls = 0;
  const deps = {
    createClient: async () => { createCalls += 1; return { id: "should-not-happen" }; },
    updateClient: async () => {},
  };
  const results = await executeImportRows([row], () => "update", [createdClient], deps);
  assert.equal(results[0].status, "updated");
  assert.equal(createCalls, 0); // no duplicate created
});

test("executeImportRows: skip decisions never call create or update", async () => {
  const rows = [fakeRow(0), fakeRow(1, { status: "exact_match", existingClientId: "cccccccc-cccc-cccc-cccc-cccccccccccc" })];
  const deps = {
    createClient: async () => { throw new Error("should not be called"); },
    updateClient: async () => { throw new Error("should not be called"); },
  };
  const results = await executeImportRows(rows, () => "skip", [], deps);
  assert.equal(results[0].status, "skipped");
  assert.equal(results[1].status, "skipped");
});

test("executeImportRows: invalid rows are always skipped regardless of decision", async () => {
  const rows = [fakeRow(0, { status: "invalid", errors: ["Missing customer/company name"] })];
  const deps = {
    createClient: async () => { throw new Error("should not be called"); },
    updateClient: async () => { throw new Error("should not be called"); },
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(results[0].status, "skipped");
});

test("executeImportRows: a duplicate_in_file row with no existingClientId fails cleanly if somehow told to update, rather than reaching the database with a bad id", async () => {
  const row = fakeRow(0, { status: "duplicate_in_file", existingClientId: null, duplicateOfRowIndex: 0 });
  const deps = {
    createClient: async () => { throw new Error("should not be called"); },
    updateClient: async () => { throw new Error("updateClient should NEVER be called with no id"); },
  };
  const results = await executeImportRows([row], () => "update", [], deps);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].error, /could not be matched/);
});

// --- 2026-08-17 additions: failure-source diagnosis + large-import/partial-success accuracy ---

test("classifyImportError: unique constraint violation (23505) diagnosed as Database", () => {
  const result = classifyImportError(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }));
  assert.equal(result.source, "Database");
  assert.match(result.detail, /unique constraint/i);
});

test("classifyImportError: RLS rejection (42501) diagnosed as Database, mentions permissions", () => {
  const result = classifyImportError(Object.assign(new Error("new row violates row-level security policy"), { code: "42501" }));
  assert.equal(result.source, "Database");
  assert.match(result.detail, /row level security|permission/i);
});

test("classifyImportError: foreign key violation (23503) diagnosed as Database", () => {
  const result = classifyImportError(Object.assign(new Error("insert or update violates foreign key constraint"), { code: "23503" }));
  assert.equal(result.source, "Database");
});

test("classifyImportError: PostgREST schema-cache error (PGRST204) diagnosed as Supabase/API, not blamed on the source file", () => {
  const result = classifyImportError(Object.assign(new Error("Could not find the column"), { code: "PGRST204" }));
  assert.equal(result.source, "Supabase/API");
});

test("classifyImportError: network/timeout error (no code, fetch-shaped message) diagnosed as Supabase/API", () => {
  const result = classifyImportError(new TypeError("Failed to fetch"));
  assert.equal(result.source, "Supabase/API");
});

test("classifyImportError: a plain frontend bug (no code, arbitrary message) diagnosed as Frontend Importer, not Database", () => {
  const result = classifyImportError(new Error("Cannot read properties of undefined (reading 'foo')"));
  assert.equal(result.source, "Frontend Importer");
});

test("classifyImportError never blames Source File -- that classification only ever happens at validateRow(), before a row reaches executeImportRows", () => {
  const samples = [
    Object.assign(new Error("x"), { code: "23505" }),
    Object.assign(new Error("x"), { code: "23503" }),
    Object.assign(new Error("x"), { code: "23514" }),
    Object.assign(new Error("x"), { code: "42501" }),
    Object.assign(new Error("x"), { code: "PGRST204" }),
    Object.assign(new Error("x"), { code: "PGRST301" }),
    new TypeError("Failed to fetch"),
    new Error("some frontend bug"),
    {},
  ];
  for (const sample of samples) {
    assert.notEqual(classifyImportError(sample).source, "Source File");
  }
});

test("executeImportRows: a Database-coded failure carries source/sourceDetail on the result, not just a raw message", async () => {
  const rows = [fakeRow(0)];
  const deps = {
    createClient: async () => { throw Object.assign(new Error("duplicate key value violates unique constraint on legacy_pastel_customer_code"), { code: "23505" }); },
    updateClient: async () => {},
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].source, "Database");
  assert.match(results[0].sourceDetail, /unique constraint/i);
});

test("executeImportRows: an RLS-denied failure carries source Database and mentions permissions, distinct from a data-format failure", async () => {
  const rows = [fakeRow(0)];
  const deps = {
    createClient: async () => { throw Object.assign(new Error("new row violates row-level security policy for table clients"), { code: "42501" }); },
    updateClient: async () => {},
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(results[0].source, "Database");
  assert.match(results[0].sourceDetail, /permission/i);
});

test("LARGE IMPORT: 1000 rows, every 7th row fails -- batch completes, exact counts, no row silently dropped", async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => fakeRow(i));
  const deps = {
    createClient: async (fields) => {
      const i = Number(fields.company_name.replace("Customer ", ""));
      if (i % 7 === 0) throw Object.assign(new Error("simulated failure"), { code: "23505" });
      return { id: `uuid-${i}` };
    },
    updateClient: async () => {},
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(Object.keys(results).length, 1000);
  const succeeded = Object.values(results).filter((r) => r.status === "success").length;
  const failed = Object.values(results).filter((r) => r.status === "failed").length;
  const expectedFailed = Array.from({ length: 1000 }, (_, i) => i).filter((i) => i % 7 === 0).length;
  assert.equal(failed, expectedFailed);
  assert.equal(succeeded, 1000 - expectedFailed);
  assert.equal(succeeded + failed, 1000);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].source, "Database");
  assert.equal(results[1].status, "success");
});

test("PARTIAL SUCCESS / summary accuracy: mixed new + update + skip + fail, summary counts match rowResults exactly", async () => {
  const existingClients = [{ id: "dddddddd-dddd-dddd-dddd-dddddddddddd", notes: "" }];
  const rows = [
    fakeRow(0, { status: "new" }),
    fakeRow(1, { status: "new" }),
    fakeRow(2, { status: "exact_match", existingClientId: existingClients[0].id }),
    fakeRow(3, { status: "possible_duplicate", existingClientId: null }),
    fakeRow(4, { status: "new" }),
  ];
  const decisionFor = (row) => (row.index === 3 ? "skip" : row.index === 2 ? "update" : "import");
  const deps = {
    createClient: async (fields) => {
      if (fields.company_name === "Customer 4") throw Object.assign(new Error("simulated failure"), { code: "23505" });
      return { id: `uuid-${fields.company_name}` };
    },
    updateClient: async () => {},
  };
  const results = await executeImportRows(rows, decisionFor, existingClients, deps);
  const counts = Object.values(results).reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  assert.equal(counts.success, 2);
  assert.equal(counts.updated, 1);
  assert.equal(counts.skipped, 1);
  assert.equal(counts.failed, 1);
  assert.equal(Object.keys(results).length, 5);
  assert.equal(results[0].status, "success");
  assert.equal(results[1].status, "success");
  assert.equal(results[2].status, "updated");
  assert.equal(results[2].clientId, existingClients[0].id);
  assert.equal(results[3].status, "skipped");
  assert.equal(results[4].status, "failed");
  assert.equal(results[4].source, "Database");
});

test("a failure does not roll back or affect unrelated already-succeeded rows (no implicit transaction)", async () => {
  const rows = [fakeRow(0), fakeRow(1), fakeRow(2)];
  const createdIds = [];
  const deps = {
    createClient: async (fields) => {
      if (fields.company_name === "Customer 1") throw new Error("simulated failure");
      createdIds.push(fields.company_name);
      return { id: `uuid-${fields.company_name}` };
    },
    updateClient: async () => {},
  };
  const results = await executeImportRows(rows, () => "import", [], deps);
  assert.equal(results[0].status, "success");
  assert.ok(createdIds.includes("Customer 0"));
  assert.equal(results[1].status, "failed");
  assert.equal(results[2].status, "success");
  assert.ok(createdIds.includes("Customer 2"));
});

// --- Clients page "Find Duplicates" (Priority 3) ---

test("findDuplicateClientGroups: matching email groups two real clients together", () => {
  const clients = [
    { id: "1", company_name: "ABC Refrigeration", email: "info@abc.co.za" },
    { id: "2", company_name: "ABC Refrigeration Pty Ltd", email: "INFO@ABC.CO.ZA" },
    { id: "3", company_name: "Totally Different Co", email: "other@example.com" },
  ];
  const groups = findDuplicateClientGroups(clients);
  const emailGroup = groups.find((g) => g.reason.startsWith("Same email"));
  assert.ok(emailGroup);
  assert.equal(emailGroup.clients.length, 2);
  assert.deepEqual(emailGroup.clients.map((c) => c.id).sort(), ["1", "2"]);
});

test("findDuplicateClientGroups: matching normalized phone groups clients despite different formatting", () => {
  const clients = [
    { id: "1", company_name: "A Co", phone: "+27 21 123 4567" },
    { id: "2", company_name: "B Co", phone: "021 123 4567" },
  ];
  const groups = findDuplicateClientGroups(clients);
  const phoneGroup = groups.find((g) => g.reason.startsWith("Same phone"));
  assert.ok(phoneGroup);
  assert.equal(phoneGroup.clients.length, 2);
});

test("findDuplicateClientGroups: no false positives for genuinely distinct clients", () => {
  const clients = [
    { id: "1", company_name: "Alpha Air Con", email: "alpha@example.com", phone: "0211111111" },
    { id: "2", company_name: "Beta Refrigeration", email: "beta@example.com", phone: "0222222222" },
  ];
  assert.deepEqual(findDuplicateClientGroups(clients), []);
});

test("findDuplicateClientGroups: never returns a group of fewer than 2 clients", () => {
  const clients = [
    { id: "1", company_name: "Only One", email: "unique@example.com" },
  ];
  assert.deepEqual(findDuplicateClientGroups(clients), []);
});
