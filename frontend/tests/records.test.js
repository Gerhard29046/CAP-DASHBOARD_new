import test from "node:test";
import assert from "node:assert/strict";
import { relatedRecords, sameRecordId } from "../src/lib/records.js";

test("Firestore string document IDs remain related to legacy numeric foreign keys", () => {
  assert.equal(sameRecordId("42", 42), true);
  assert.deepEqual(
    relatedRecords([
      { id: "machine-a", client_id: "client-a" },
      { id: "machine-b", client_id: 7 },
      { id: "machine-c", client_id: "other" },
    ], "client_id", "7"),
    [{ id: "machine-b", client_id: 7 }],
  );
});

test("missing IDs never match", () => {
  assert.equal(sameRecordId(null, null), false);
  assert.equal(sameRecordId(undefined, "undefined"), false);
});
