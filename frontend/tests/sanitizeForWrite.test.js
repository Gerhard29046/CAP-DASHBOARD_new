import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeForWrite } from "../src/lib/sanitizeForWrite.js";

test("sanitizeForWrite converts empty-string values to null (the actual bug: '' sent to a date/numeric column 400s)", () => {
  const result = sanitizeForWrite({ brand: "Daikin", installation_date: "", warranty_expiry: "" });
  assert.deepEqual(result, { brand: "Daikin", installation_date: null, warranty_expiry: null });
});

test("sanitizeForWrite leaves non-empty-string values untouched, including falsy ones (0, false)", () => {
  const result = sanitizeForWrite({ count: 0, is_active: false, name: "x", notes: null });
  assert.deepEqual(result, { count: 0, is_active: false, name: "x", notes: null });
});

test("sanitizeForWrite leaves arrays and nested objects untouched (does not recurse or mangle them)", () => {
  const result = sanitizeForWrite({
    effective_permissions: ["clients.view", ""],
    preferences: { theme: "" },
  });
  // Top-level array/object values pass through as-is -- only exact top-level "" string
  // values are converted. An empty string *inside* an array/object is intentionally left
  // alone (recursing would be a much larger, unrequested behavior change).
  assert.deepEqual(result.effective_permissions, ["clients.view", ""]);
  assert.deepEqual(result.preferences, { theme: "" });
});

test("sanitizeForWrite returns non-object inputs (including arrays) unchanged", () => {
  assert.equal(sanitizeForWrite(null), null);
  assert.equal(sanitizeForWrite(undefined), undefined);
  const arr = [1, 2, 3];
  assert.equal(sanitizeForWrite(arr), arr);
});

test("sanitizeForWrite does not mutate the input object", () => {
  const input = { brand: "" };
  const result = sanitizeForWrite(input);
  assert.equal(input.brand, "");
  assert.equal(result.brand, null);
  assert.notEqual(result, input);
});
