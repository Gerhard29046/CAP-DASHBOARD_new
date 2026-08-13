#!/usr/bin/env node
// Read-only check: has migrations 0018/0019 (products_services/job_card_settings/
// client_imports/settings.access permission) actually been applied to the live project
// yet? Queries via the service-role client (bypasses RLS) so this works regardless of
// whether any policies exist yet. Writes nothing.

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

async function checkTable(name) {
  const { error } = await admin.from(name).select("*").limit(1);
  return !error;
}

async function main() {
  const results = {};
  results.products_services = await checkTable("products_services");
  results.job_card_settings = await checkTable("job_card_settings");
  results.client_imports = await checkTable("client_imports");

  const { data: perms } = await admin.from("permissions").select("key").in("key", ["settings.access", "clients.import"]);
  results["permission:settings.access"] = Boolean(perms?.find((p) => p.key === "settings.access"));
  results["permission:clients.import"] = Boolean(perms?.find((p) => p.key === "clients.import"));

  const { data: col } = await admin.from("clients").select("legacy_pastel_customer_code").limit(1);
  results["clients.legacy_pastel_customer_code"] = col !== null;

  console.log("Migration 0018/0019 live-state check:");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${v ? "OK  " : "MISSING"} ${k}`);
  }
  const allApplied = Object.values(results).every(Boolean);
  console.log(allApplied ? "\nAll applied." : "\nNOT fully applied yet.");
  process.exit(allApplied ? 0 : 2);
}

main().catch((e) => { console.error("Check failed:", e.message); process.exit(1); });
