import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORD_PHOTO_NAMESPACES, buildRecordPhotoPath } from "../src/lib/recordPhotoPath.js";

test("buildRecordPhotoPath builds a service-records path with exactly 2 folder segments", () => {
  const path = buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.serviceRecord, "11111111-1111-1111-1111-111111111111", "photo.webp");
  const segments = path.split("/");
  // namespace, recordId, filename -- filename is the object's own name, not a folder segment,
  // matching storage.foldername()'s behavior (drops only the last segment). Exactly 2 folder
  // segments before it is what migration 0024's <> 2 check requires.
  assert.equal(segments.length, 3);
  assert.equal(segments[0], "service-records");
  assert.equal(segments[1], "11111111-1111-1111-1111-111111111111");
  assert.match(segments[2], /^[0-9a-f-]{36}-photo\.webp$/);
});

test("buildRecordPhotoPath builds a job-cards path with exactly 2 folder segments", () => {
  const path = buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.jobCard, "22222222-2222-2222-2222-222222222222", "arrival.webp");
  const segments = path.split("/");
  assert.equal(segments.length, 3);
  assert.equal(segments[0], "job-cards");
  assert.equal(segments[1], "22222222-2222-2222-2222-222222222222");
  assert.match(segments[2], /^[0-9a-f-]{36}-arrival\.webp$/);
});

test("buildRecordPhotoPath rejects an unrecognized namespace", () => {
  assert.throws(() => buildRecordPhotoPath("random-prefix", "id", "x.webp"), /invalid namespace/);
});

test("buildRecordPhotoPath rejects a missing recordId", () => {
  assert.throws(() => buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.serviceRecord, "", "x.webp"), /recordId is required/);
  assert.throws(() => buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.serviceRecord, null, "x.webp"), /recordId is required/);
});

test("buildRecordPhotoPath rejects a missing fileName", () => {
  assert.throws(() => buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.serviceRecord, "id", ""), /fileName is required/);
});

test("buildRecordPhotoPath generates a fresh uuid segment on every call (no path collisions between uploads)", () => {
  const a = buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.serviceRecord, "id", "same-name.webp");
  const b = buildRecordPhotoPath(RECORD_PHOTO_NAMESPACES.serviceRecord, "id", "same-name.webp");
  assert.notEqual(a, b);
});

test("the two namespace constants match migration 0024's exact expected prefixes", () => {
  assert.equal(RECORD_PHOTO_NAMESPACES.serviceRecord, "service-records");
  assert.equal(RECORD_PHOTO_NAMESPACES.jobCard, "job-cards");
});
