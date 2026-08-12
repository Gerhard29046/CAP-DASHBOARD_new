#!/usr/bin/env node
// QA helper (2026-08-11): exercises upload/download/delete against all 5 real Supabase
// Storage buckets (profile-images, invoices, documents, photos, attachments) as a real
// authenticated user (anon key, mirrors frontend/src/services/supabase/storage.js), proving
// the RLS policies in 0004_storage_buckets.sql actually work end-to-end, not just that the
// SQL applied without error. All uploads are throwaway, tagged, and deleted by this script.
//
// Usage: node scripts/qa-storage-buckets.mjs <email> <password>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    // fall through
  }
  return env;
}

const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/qa-storage-buckets.mjs <email> <password>");
  process.exit(1);
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} - ${name}${detail ? `: ${detail}` : ""}`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Each bucket has a real MIME-type allowlist (0004_storage_buckets.sql) -- use content that
// actually satisfies it per bucket, otherwise a rejection just proves the allowlist works,
// not whether upload/download/RLS actually function for real content.
// 1x1 transparent PNG (67 bytes), and a minimal valid empty PDF, both real/parseable.
const PNG_1X1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
const PDF_MINIMAL = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

const BUCKET_CONTENT = {
  "profile-images": { bytes: PNG_1X1, contentType: "image/png", ext: "png" },
  invoices: { bytes: PDF_MINIMAL, contentType: "application/pdf", ext: "pdf" },
  documents: { bytes: PDF_MINIMAL, contentType: "application/pdf", ext: "pdf" },
  photos: { bytes: PNG_1X1, contentType: "image/png", ext: "png" },
  attachments: { bytes: new TextEncoder().encode("PHASE3-QA-STORAGE-TEST-DELETE-ME"), contentType: "text/plain", ext: "txt" },
};

async function testBucket(bucket, pathPrefix) {
  const { bytes, contentType, ext } = BUCKET_CONTENT[bucket];
  const path = `${pathPrefix}/qa-storage-test-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    record(`${bucket}: upload`, false, upErr.message);
    return;
  }
  record(`${bucket}: upload`, true, path);

  const { data: dlData, error: dlErr } = await supabase.storage.from(bucket).download(path);
  if (dlErr) {
    record(`${bucket}: download`, false, dlErr.message);
  } else {
    const downloaded = new Uint8Array(await dlData.arrayBuffer());
    const matches = downloaded.length === bytes.length && downloaded.every((b, i) => b === bytes[i]);
    record(`${bucket}: download`, matches, `${downloaded.length} bytes, content matches: ${matches}`);
  }

  const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  record(`${bucket}: createSignedUrl`, !signErr && !!signed?.signedUrl, signErr?.message);

  const { error: delErr } = await supabase.storage.from(bucket).remove([path]);
  if (delErr) {
    record(`${bucket}: delete (MANUAL CLEANUP MAY BE NEEDED)`, false, `path=${path}: ${delErr.message}`);
  } else {
    record(`${bucket}: delete`, true);
  }
}

async function main() {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    record("sign in", false, signInError.message);
    printSummary();
    process.exit(1);
  }
  record("sign in", true, `uid=${signInData.user.id}`);
  const uid = signInData.user.id;

  await testBucket("profile-images", uid); // RLS requires {auth.uid()}/... prefix
  await testBucket("invoices", "qa-test"); // requires invoices.queue.view / invoices.edit permission
  await testBucket("documents", "qa-test"); // any active profile
  await testBucket("photos", "qa-test"); // any active profile
  await testBucket("attachments", "qa-test"); // any active profile

  await supabase.auth.signOut();
  printSummary();
}

function printSummary() {
  console.log("\n=== Summary ===");
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.log(`${failed.length} check(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("All checks passed.");
  }
}

main().catch((e) => {
  console.error("Unexpected script error:", e);
  process.exit(1);
});
