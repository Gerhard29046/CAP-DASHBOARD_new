#!/usr/bin/env node
// Deletes exactly the 4 throwaway QA accounts explicitly approved by the user on 2026-08-17.
// Hardcoded IDs (not a pattern match) so this can never accidentally delete anything else.
// Deletes from Supabase Auth (auth.admin.deleteUser cascades to public.users via FK) then
// independently re-verifies each is gone from BOTH auth.users and public.users.
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
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const APPROVED = [
  { id: "8b328526-26dc-49d3-887f-44fdd7296a67", email: "qa-fixes+admin-1786627520045-4gmd@invalid.local" },
  { id: "d40e9e01-b790-4469-93f1-3648c76c5a61", email: "qa-fixes+technician-1786627521518-gac2@invalid.local" },
  { id: "01a5345b-609c-4f29-ae96-0b41a5f0c92c", email: "qa-android-refresh+1786695110465-wr0314@invalid.local" },
  { id: "7bca20b5-d596-4b5f-9311-40600145f4d4", email: "qa-phase-d+technician-1786695144406-fx54@invalid.local" },
];

let pass = 0, fail = 0;
for (const u of APPROVED) {
  const { data: before } = await admin.auth.admin.getUserById(u.id).catch(() => ({ data: null }));
  if (!before?.user) {
    console.log(`SKIP ${u.email} — already gone before this run`);
    continue;
  }
  if (before.user.email !== u.email) {
    console.error(`ABORT ${u.id} — email mismatch (expected ${u.email}, got ${before.user.email}). Not deleting.`);
    fail++;
    continue;
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
  const { data: after } = await admin.auth.admin.getUserById(u.id).catch(() => ({ data: null }));
  const { data: pu } = await admin.from("users").select("id").eq("id", u.id).maybeSingle();
  const ok = !delErr && !after?.user && !pu;
  console.log(`${ok ? "PASS" : "FAIL"} — ${u.email}: auth.users gone=${!after?.user}, public.users gone=${!pu}${delErr ? `, error=${delErr.message}` : ""}`);
  ok ? pass++ : fail++;
}

const { data: remaining } = await admin.auth.admin.listUsers({ perPage: 200 });
console.log(`\nTotal Supabase Auth users remaining: ${remaining.users.length}`);
for (const u of remaining.users) console.log(` - ${u.email}`);

console.log(`\n${pass} deleted+confirmed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
