#!/usr/bin/env node
// Read-only re-verification for migration 0028: after it's applied, every one of the 20 known
// public tables should reject an anon-key (unauthenticated) request with a hard permission
// error, not a `200 []`. Also spot-checks that a real authenticated technician account can
// still read what it's supposed to (authenticated access must be unaffected). Writes nothing
// destructive; cleans up its own throwaway auth user.
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
const ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) { console.error("Missing env"); process.exit(1); }

const TABLES = [
  "audit_logs", "client_imports", "clients", "dashboard_notes", "job_card_lines",
  "job_card_settings", "job_cards", "knowledge_documents", "knowledge_machines",
  "knowledge_media", "knowledge_notes", "knowledge_service_codes", "machines",
  "notifications", "permissions", "products_services", "role_permissions",
  "service_records", "sites", "users",
];

let pass = 0, fail = 0;
function record(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  ok ? pass++ : fail++;
}

console.log("=== Post-0028 anon access sweep (expect BLOCKED for all 20) ===");
for (const t of TABLES) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  const blocked = res.status === 401 || res.status === 403;
  record(blocked, `${t}: anon request blocked (status ${res.status})`);
}

console.log("\n=== Authenticated access spot-check (must be unaffected) ===");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const email = `qa-0028-verify+${Date.now()}@invalid.local`;
const password = "Temp-Pass-" + Math.random().toString(36).slice(2) + "!1A";
let uid = null;
try {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) throw createErr;
  uid = created.user.id;
  await admin.from("users").update({ role: "technician", is_active: true }).eq("id", uid);

  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  const token = signIn.session.access_token;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=id&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  record(res.status === 200, `authenticated technician can still read clients (status ${res.status})`);

  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/products_services?select=id&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  record(res2.status === 200, `authenticated technician can still read products_services (status ${res2.status})`);
} catch (e) {
  console.error("Setup/auth error:", e);
  fail++;
} finally {
  if (uid) {
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    const { data: verify } = await admin.auth.admin.getUserById(uid).catch(() => ({ data: null }));
    record(!delErr && !verify?.user, "throwaway QA account cleaned up and independently confirmed gone");
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
