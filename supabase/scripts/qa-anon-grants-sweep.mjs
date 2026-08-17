#!/usr/bin/env node
// Read-only sweep: for every known public table (from migration DDL), test what an
// UNAUTHENTICATED (anon-key, no Authorization/bearer session) request actually gets back via
// PostgREST. This tests the real client-facing exposure surface directly (the only path a real
// unauthenticated client has) since this environment has no direct Postgres connection to
// inspect pg_catalog/information_schema grants. Writes nothing, sends no session token.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
if (!SUPABASE_URL || !ANON_KEY) { console.error("Missing SUPABASE_URL/SUPABASE_ANON_KEY"); process.exit(1); }

// Table list extracted directly from `create table public.X` in supabase/migrations/*.sql.
const TABLES = [
  "audit_logs", "client_imports", "clients", "dashboard_notes", "job_card_lines",
  "job_card_settings", "job_cards", "knowledge_documents", "knowledge_machines",
  "knowledge_media", "knowledge_notes", "knowledge_service_codes", "machines",
  "notifications", "permissions", "products_services", "role_permissions",
  "service_records", "sites", "users",
];

const results = [];
for (const t of TABLES) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=3`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const body = await res.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    const rowCount = Array.isArray(parsed) ? parsed.length : null;
    results.push({ table: t, status: res.status, rowCount, body: Array.isArray(parsed) ? parsed : body });
  } catch (e) {
    results.push({ table: t, status: "ERROR", error: String(e) });
  }
}

console.log("=== Anonymous (anon key, NO bearer session) REST access — every known public table ===\n");
for (const r of results) {
  const flag = r.status === 401 || r.status === 403 ? "BLOCKED (auth error)"
    : (r.status === 200 && r.rowCount === 0) ? "200, 0 rows (RLS filtering out all rows)"
    : (r.status === 200 && r.rowCount > 0) ? "*** 200, REAL DATA RETURNED ***"
    : `status ${r.status}`;
  console.log(`${r.table.padEnd(24)} ${flag}`);
}

const exposed = results.filter(r => r.status === 200 && r.rowCount > 0);
console.log(`\n${exposed.length} table(s) returned real anonymous data.`);
if (exposed.length) {
  for (const e of exposed) console.log(JSON.stringify(e.body, null, 2));
}
