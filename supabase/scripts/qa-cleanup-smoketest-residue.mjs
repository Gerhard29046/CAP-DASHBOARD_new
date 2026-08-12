#!/usr/bin/env node
// Temporary cleanup (2026-08-07, user-approved): removes exactly 2 identified leftover
// smoke-test.mjs seed rows from the live `clients` table (unambiguous: exact name match
// AND no legacy_firestore_id, since every real migrated row has one). Not a general-purpose
// script.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}
const env = loadEnv(".env");
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPROVED_IDS = [
  "804505b3-75e4-4dac-ae6b-92b5bf87aa61",
  "323569a1-9950-417d-bfc7-c0477f0bf994",
];

const { data: victims, error: selErr } = await supabase
  .from("clients")
  .select("id, company_name, legacy_firestore_id")
  .in("id", APPROVED_IDS);
if (selErr) { console.error(selErr); process.exit(1); }

for (const v of victims) {
  if (v.company_name !== "Phase 2 Smoke Test Client" || v.legacy_firestore_id !== null) {
    console.error("SAFETY CHECK FAILED, refusing to delete:", JSON.stringify(v));
    process.exit(1);
  }
}
console.log("Safety check passed for all rows:", JSON.stringify(victims));

for (const v of victims) {
  const { error } = await supabase.from("clients").delete().eq("id", v.id);
  console.log(v.id, error ? `FAILED: ${error.message}` : "deleted");
}
