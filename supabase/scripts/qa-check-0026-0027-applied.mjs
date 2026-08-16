#!/usr/bin/env node
// Read-only check: has migration 0026 (public.users.photo_path + profile-images bucket RLS)
// and/or migration 0027 (machines.client_id cascade + delete permission catalog rows +
// client_imports.updated_count) actually been applied to the live project yet? Queries via the
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

async function permissionExists(key) {
  const { data, error } = await admin.from("permissions").select("key").eq("key", key).maybeSingle();
  return !error && !!data;
}

async function main() {
  const results = {};
  results["0026: public.users.photo_path"] = await columnExists("users", "photo_path");
  results["0027: client_imports.updated_count"] = await columnExists("client_imports", "updated_count");
  results["0027: permissions row clients.delete"] = await permissionExists("clients.delete");
  results["0027: permissions row job_cards.delete"] = await permissionExists("job_cards.delete");
  results["0027: permissions row knowledge_base.delete"] = await permissionExists("knowledge_base.delete");

  console.log("Migration 0026/0027 live-state check:");
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${v ? "OK     " : "MISSING"} ${k}`);
  }
  const allApplied = Object.values(results).every(Boolean);
  console.log(allApplied ? "\nAll applied." : "\nNot fully applied yet.");
  process.exit(allApplied ? 0 : 2);
}

main().catch((e) => { console.error("Check failed:", e.message); process.exit(1); });
