import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_WORK_ITEMS, joinWorkPerformed, parseWorkPerformed } from "../src/lib/serviceWorkItems.js";

test("joinWorkPerformed joins only the selected items, in SERVICE_WORK_ITEMS order", () => {
  const result = joinWorkPerformed({
    "Cleaned Machine": true,
    "Replaced Filter Dryer": true,
    "Calibrated Scales": false,
  });
  // Canonical order regardless of the order keys were set in the selection map -- matches
  // SERVICE_WORK_ITEMS's own declared order, not insertion order.
  assert.equal(result, "Replaced Filter Dryer, Cleaned Machine");
});

test("joinWorkPerformed returns an empty string when nothing is selected", () => {
  assert.equal(joinWorkPerformed({}), "");
});

test("joinWorkPerformed ignores keys that are not real checklist items", () => {
  const result = joinWorkPerformed({ "Not a real item": true, "Cleaned Machine": true });
  assert.equal(result, "Cleaned Machine");
});

test("parseWorkPerformed round-trips a value this checklist itself produced", () => {
  const joined = joinWorkPerformed({ "Replaced Filter Dryer": true, "Cleaned Machine": true });
  assert.deepEqual(parseWorkPerformed(joined), {
    "Replaced Filter Dryer": true,
    "Cleaned Machine": true,
  });
});

test("parseWorkPerformed returns an empty selection for null/blank values", () => {
  assert.deepEqual(parseWorkPerformed(null), {});
  assert.deepEqual(parseWorkPerformed(undefined), {});
  assert.deepEqual(parseWorkPerformed(""), {});
});

test("parseWorkPerformed returns an empty selection for pre-checklist free text -- does not guess", () => {
  assert.deepEqual(parseWorkPerformed("Replaced the compressor and topped up refrigerant"), {});
});

test("parseWorkPerformed returns an empty selection if even one part is unrecognized (partial match is not good enough)", () => {
  assert.deepEqual(parseWorkPerformed("Cleaned Machine, did some other stuff"), {});
});

test("every SERVICE_WORK_ITEMS entry round-trips on its own", () => {
  for (const item of SERVICE_WORK_ITEMS) {
    assert.deepEqual(parseWorkPerformed(item), { [item]: true });
  }
});
