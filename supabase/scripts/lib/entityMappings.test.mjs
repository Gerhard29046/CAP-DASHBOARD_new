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

test("knowledge_notes maps title/body and tags _legacy_knowledge_machine_id", () => {
  const { table, map } = entryFor("knowledge_notes");
  assert.equal(table, "knowledge_notes");
  const row = map({ title: "Reset procedure", body: "Hold the button for 10s.", knowledge_machine_id: "km-1" });
  assert.equal(row.title, "Reset procedure");
  assert.equal(row.body, "Hold the button for 10s.");
  assert.equal(row._legacy_knowledge_machine_id, "km-1");
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
    name: "", model: null, description: null,
  });
  const jobCardLine = entryFor("job_card_lines").map({});
  assert.equal(jobCardLine.line_type, "Labour");
  assert.equal(jobCardLine.quantity, 1);
  assert.equal(jobCardLine._legacy_job_card_id, null);
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
  const mapped = entryFor("knowledge_machines").map({ name: "Compressor X" });
  const { columns } = stripLegacyMarkers(mapped);
  assert.deepEqual(columns, { name: "Compressor X", model: null, description: null });
});
