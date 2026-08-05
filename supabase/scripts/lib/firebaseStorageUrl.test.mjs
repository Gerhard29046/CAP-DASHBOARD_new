import test from "node:test";
import assert from "node:assert/strict";
import { extractFirebaseStoragePath } from "./firebaseStorageUrl.mjs";

test("extracts and decodes a real-shaped Firebase Storage download URL, including nested %2F-encoded folders", () => {
  const url = "https://firebasestorage.googleapis.com/v0/b/capdatabasefb2.appspot.com/o/knowledge-media%2Fabc123%2Fphoto.jpg?alt=media&token=1234-5678-90ab";
  assert.equal(extractFirebaseStoragePath(url), "knowledge-media/abc123/photo.jpg");
});

test("extracts a top-level (non-nested) object path", () => {
  const url = "https://firebasestorage.googleapis.com/v0/b/capdatabasefb2.appspot.com/o/report.pdf?alt=media&token=abcd";
  assert.equal(extractFirebaseStoragePath(url), "report.pdf");
});

test("returns null for falsy input rather than throwing", () => {
  assert.equal(extractFirebaseStoragePath(null), null);
  assert.equal(extractFirebaseStoragePath(undefined), null);
  assert.equal(extractFirebaseStoragePath(""), null);
});

test("returns null for a URL that isn't a Firebase Storage download URL (no /o/ segment)", () => {
  assert.equal(extractFirebaseStoragePath("https://example.com/some/other/path.jpg"), null);
});

test("returns null for a string that isn't a valid URL at all, instead of throwing", () => {
  assert.equal(extractFirebaseStoragePath("not-a-url"), null);
  assert.equal(extractFirebaseStoragePath("knowledge-media/abc123/photo.jpg"), null);
});

test("returns null for malformed percent-encoding rather than throwing", () => {
  const url = "https://firebasestorage.googleapis.com/v0/b/bucket/o/bad%ZZencoding?alt=media";
  assert.equal(extractFirebaseStoragePath(url), null);
});
