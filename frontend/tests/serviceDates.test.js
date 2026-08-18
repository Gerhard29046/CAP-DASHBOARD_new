import { test } from "node:test";
import assert from "node:assert/strict";
import { addOneYear } from "../src/lib/serviceDates.js";

test("addOneYear adds exactly one year to a plain ISO date", () => {
  assert.equal(addOneYear("2026-08-18"), "2027-08-18");
});

test("addOneYear handles the Feb 29 leap-day edge case by rolling to Mar 1", () => {
  // JS Date's setFullYear on Feb 29 rolls forward into March in a non-leap target year --
  // documenting the actual behavior rather than asserting an invented "Feb 28" convention.
  assert.equal(addOneYear("2024-02-29"), "2025-03-01");
});

test("addOneYear returns an empty string for an empty/undefined input", () => {
  assert.equal(addOneYear(""), "");
  assert.equal(addOneYear(undefined), "");
});

test("addOneYear returns an empty string for an unparseable date string", () => {
  assert.equal(addOneYear("not-a-date"), "");
});

test("addOneYear crosses a year boundary correctly for a December date", () => {
  assert.equal(addOneYear("2026-12-31"), "2027-12-31");
});
