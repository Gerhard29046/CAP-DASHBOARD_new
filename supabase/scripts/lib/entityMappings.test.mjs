import test from "node:test";
import assert from "node:assert/strict";
import { ENTITY_COLLECTIONS, LEGACY_MARKER_KEYS, stripLegacyMarkers } from "./entityMappings.mjs";

function entryFor(collection) {
  const entry = ENTITY_COLLECTIONS.find((e) => e.collection === collection);
  assert.ok(entry, `expected an ENTITY_COLLECTIONS entry for "${collection}"`);
  return entry;
}

test("all six original collections are still present", () => {
  const names = ENTITY_COLLECTIONS.map((e) => e.collection);
  for (const expected of [
    "clients", "machines", "service_records", "job_cards", "job_card_lines", "knowledge_machines",
  ]) {
    assert.ok(names.includes(expected), `missing "${expected}"`);
  }
});

test("the four previously-missing knowledge_* collections are now mapped", () => {
  const names = ENTITY_COLLECTIONS.map((e) => e.collection);
  for (const expected of [
    "knowledge_notes", "knowledge_service_codes", "knowledge_media", "knowledge_documents",
  ]) {
    assert.ok(names.includes(expected), `missing "${expected}"`);
  }
});

test("knowledge_notes maps title/content/note_type and tags _legacy_knowledge_machine_id (field names fixed 2026-08-05, see 0013 migration)", () => {
  const { table, map } = entryFor("knowledge_notes");
  assert.equal(table, "knowledge_notes");
  const row = map({
    title: "Reset procedure", content: "Hold the button for 10s.",
    note_type: "troubleshooting", knowledge_machine_id: "km-1",
  });
  assert.equal(row.title, "Reset procedure");
  assert.equal(row.content, "Hold the button for 10s.");
  assert.equal(row.note_type, "troubleshooting");
  assert.equal(row._legacy_knowledge_machine_id, "km-1");
  assert.ok(!("body" in row), "old `body` field name should no longer be produced by this mapper");
});

test("knowledge_service_codes maps service_code/function_name, not the old `code` guess (fixed 2026-08-05, see 0013 migration)", () => {
  const { map } = entryFor("knowledge_service_codes");
  const row = map({ service_code: "SC-42", function_name: "Recovery pump reset", description: "Runs the pump reset sequence." });
  assert.equal(row.service_code, "SC-42");
  assert.equal(row.function_name, "Recovery pump reset");
  assert.equal(row.description, "Runs the pump reset sequence.");
  assert.ok(!("code" in row), "old `code` field name should no longer be produced by this mapper");
});

test("knowledge_media/knowledge_documents map file_url/original_filename/title, not the old `storage_path` guess (fixed 2026-08-05, see 0013 migration)", () => {
  const media = entryFor("knowledge_media").map({
    file_url: "https://example/signed-url", original_filename: "photo.jpg", title: "photo.jpg", caption: "Front panel",
  });
  assert.equal(media.file_url, "https://example/signed-url");
  assert.equal(media.original_filename, "photo.jpg");
  assert.equal(media.title, "photo.jpg");
  assert.equal(media.caption, "Front panel");
  assert.ok(!("storage_path" in media), "old `storage_path` field name should no longer be produced by this mapper");

  const documents = entryFor("knowledge_documents").map({
    file_url: "https://example/signed-url-2", original_filename: "manual.pdf", title: "Service manual",
  });
  assert.equal(documents.file_url, "https://example/signed-url-2");
  assert.equal(documents.original_filename, "manual.pdf");
  assert.equal(documents.title, "Service manual");
  assert.ok(!("storage_path" in documents), "old `storage_path` field name should no longer be produced by this mapper");
});

test("knowledge_service_codes/media/documents each tag _legacy_knowledge_machine_id and coerce numeric ids to strings", () => {
  for (const collection of ["knowledge_service_codes", "knowledge_media", "knowledge_documents"]) {
    const { map } = entryFor(collection);
    const row = map({ knowledge_machine_id: 42 });
    assert.equal(row._legacy_knowledge_machine_id, "42", `${collection}: expected numeric legacy id coerced to string`);
  }
});

test("missing optional fields fall back to documented defaults, not undefined", () => {
  assert.deepEqual(entryFor("clients").map({}), {
    company_name: "", contact_person: null, email: null, phone: null,
    address: null, notes: null, is_active: true,
  });
  assert.deepEqual(entryFor("knowledge_machines").map({}), {
    manufacturer: null, model_name: null, variant: null, product_code: null,
    category: null, summary: null, supported_refrigerants: [],
    technical_specifications: {}, main_functions: [],
  });
  const jobCardLine = entryFor("job_card_lines").map({});
  assert.equal(jobCardLine.line_type, "Labour");
  assert.equal(jobCardLine.quantity, 1);
  assert.equal(jobCardLine._legacy_job_card_id, null);
});

test("knowledge_machines maps the real field set, not the original name/model/description guess (fixed 2026-08-04)", () => {
  const { map } = entryFor("knowledge_machines");
  const row = map({
    manufacturer: "Wigam", model_name: "Optima", variant: "Pro", product_code: "OPT-100",
    category: "AC Machine", summary: "Flagship unit.",
    supported_refrigerants: ["R-134a", "R-1234yf"],
    technical_specifications: { "Tank Capacity": "12kg" },
    main_functions: ["Recovery", "Recycling"],
  });
  assert.equal(row.manufacturer, "Wigam");
  assert.equal(row.model_name, "Optima");
  assert.deepEqual(row.supported_refrigerants, ["R-134a", "R-1234yf"]);
  assert.deepEqual(row.technical_specifications, { "Tank Capacity": "12kg" });
  assert.deepEqual(row.main_functions, ["Recovery", "Recycling"]);
  assert.ok(!("name" in row) && !("model" in row) && !("description" in row),
    "old name/model/description fields should no longer be produced by this mapper");
});

test("date-typed fields coerce empty string to null, not a literal \"\" (fixed 2026-08-04 -- found via a live dry-run: 4 of 6 real machines docs have installation_date: \"\")", () => {
  const machineRow = entryFor("machines").map({ installation_date: "", warranty_expiry: "" });
  assert.equal(machineRow.installation_date, null);
  assert.equal(machineRow.warranty_expiry, null);

  const serviceRow = entryFor("service_records").map({ next_service_due: "", service_date: "" });
  assert.equal(serviceRow.next_service_due, null);
  assert.equal(serviceRow.service_date, null);

  const jobCardRow = entryFor("job_cards").map({ date_completed: "", date_received: "" });
  assert.equal(jobCardRow.date_completed, null);
  assert.equal(jobCardRow.date_received, null);

  // Real dates still pass through unchanged.
  const withRealDate = entryFor("machines").map({ installation_date: "1995-04-05" });
  assert.equal(withRealDate.installation_date, "1995-04-05");
});

test("job_cards maps job_number/date_received (added 2026-08-04 after a live dry-run spot-check found them missing)", () => {
  const { map } = entryFor("job_cards");
  const row = map({ job_number: "JOB-314551", date_received: "2026-07-22" });
  assert.equal(row.job_number, "JOB-314551");
  assert.equal(row.date_received, "2026-07-22");
  const empty = map({});
  assert.equal(empty.job_number, null);
  assert.equal(empty.date_received, null);
});

test("stripLegacyMarkers removes every known marker key and never leaks one into columns", () => {
  const mapped = entryFor("job_cards").map({ client_id: "c1", machine_id: "m1" });
  const { columns, legacy } = stripLegacyMarkers(mapped);
  for (const key of LEGACY_MARKER_KEYS) {
    assert.ok(!(key in columns), `"${key}" leaked into insertable columns`);
  }
  assert.equal(legacy._legacy_client_id, "c1");
  assert.equal(legacy._legacy_machine_id, "m1");
  assert.equal(legacy._legacy_knowledge_machine_id, null);
});

test("stripLegacyMarkers is a no-op on columns for entities with no legacy markers (e.g. knowledge_machines)", () => {
  const mapped = entryFor("knowledge_machines").map({ manufacturer: "Wigam" });
  const { columns } = stripLegacyMarkers(mapped);
  assert.deepEqual(columns, {
    manufacturer: "Wigam", model_name: null, variant: null, product_code: null,
    category: null, summary: null, supported_refrigerants: [],
    technical_specifications: {}, main_functions: [],
  });
});
