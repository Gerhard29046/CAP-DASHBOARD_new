#!/usr/bin/env node
// Read-only inspection: how many real knowledge_media/knowledge_documents rows exist, and do
// their file_url values look like already-expired/expiring signed URLs? Needed to answer
// "are there already broken records" before designing the migration/backfill.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq)] = t.slice(eq + 1);
    }
  } catch {}
  return env;
}
const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const admin = createClient(fileEnv.SUPABASE_URL, fileEnv.SUPABASE_SERVICE_ROLE_KEY);

for (const table of ["knowledge_media", "knowledge_documents"]) {
  const { data, error } = await admin.from(table).select("id, knowledge_machine_id, file_url, original_filename, title, created_at");
  if (error) { console.error(table, error); continue; }
  console.log(`\n=== ${table}: ${data.length} row(s) ===`);
  for (const row of data) {
    const isSignedUrl = /\/storage\/v1\/object\/sign\//.test(row.file_url || "") || /token=/.test(row.file_url || "");
    console.log(`${row.id}  created=${row.created_at}  looksLikeSignedUrl=${isSignedUrl}  file=${row.original_filename || row.title}`);
  }
}
