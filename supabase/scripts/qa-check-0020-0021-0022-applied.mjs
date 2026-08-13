#!/usr/bin/env node
// Read-only check: have migrations 0020/0021/0022 (service_records.photos,
// job_cards.arrival_photos, job_card_settings.available_statuses/line_types,
// job_cards.machine_type) actually been applied to the live project yet? Queries via the
// service-role client (bypasses RLS) so this works regardless of policy state. Writes nothing.

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

async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error;
}

async function main() {
  const results = {};
  results["0020: service_records.photos"] = await columnExists("service_records", "photos");
  results["0020: job_cards.arrival_photos"] = await columnExists("job_cards", "arrival_photos");
  results["0021: job_card_settings.available_statuses"] = await columnExists("job_card_settings", "available_statuses");
  results["0021: job_card_settings.line_types"] = await columnExists("job_card_settings", "line_types");
  results["0022: job_cards.machine_type"] = await columnExists("job_cards", "machine_type");

  console.log("Migration 0020/0021/0022 live-state check:");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${v ? "OK     " : "MISSING"} ${k}`);
  }
  const allApplied = Object.values(results).every(Boolean);
  console.log(allApplied ? "\nAll applied." : "\nNOT fully applied yet.");
  process.exit(allApplied ? 0 : 2);
}

main().catch((e) => { console.error("Check failed:", e.message); process.exit(1); });
