#!/usr/bin/env node
// Read-only check: has migration 0030 (service_certificates, company_settings,
// generate_service_certificate() RPC) actually been applied to the live project yet?
// Queries via the service-role client (bypasses RLS) so this works regardless of policy
// state. Writes nothing.

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
  } catch { /* no .env */ }
  return env;
}

const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in supabase/.env.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function tableExists(table) {
  const { error } = await admin.from(table).select("id").limit(1);
  return !error;
}

async function rpcExists(name, args) {
  const { error } = await admin.rpc(name, args);
  // A real "function does not exist" error is PGRST202 / 42883. Any other error (e.g. a bad
  // arg value against a real function) still proves the function exists.
  if (!error) return true;
  const code = String(error.code || "");
  const message = String(error.message || "");
  if (code === "PGRST202" || code === "42883" || /Could not find the function/i.test(message)) {
    return false;
  }
  return true;
}

const results = [];
results.push(["public.service_certificates table", await tableExists("service_certificates")]);
results.push(["public.company_settings table", await tableExists("company_settings")]);
results.push([
  "generate_service_certificate() RPC",
  await rpcExists("generate_service_certificate", { p_service_record_id: "00000000-0000-0000-0000-000000000000", p_include_photos: false }),
]);

let allPass = true;
for (const [label, ok] of results) {
  console.log(`${ok ? "OK  " : "MISSING"} ${label}`);
  if (!ok) allPass = false;
}

console.log(allPass ? "\nMigration 0030 IS applied." : "\nMigration 0030 is NOT applied.");
process.exit(allPass ? 0 : 1);
