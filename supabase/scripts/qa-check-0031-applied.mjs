#!/usr/bin/env node
// Read-only-in-effect check: has migration 0031 (set_default_next_service_due trigger) been
// applied? There's no new column/table to check .from().select() against (it's a trigger on
// an existing column), so this creates ONE real throwaway service_records row (service_date
// set, next_service_due left null, against a real existing machine so the FK is satisfied),
// checks whether the trigger populated next_service_due to exactly +1 year, then deletes the
// throwaway row and independently re-confirms it's gone.

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
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in supabase/.env.");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let rowId = null;
try {
  const { data: machines, error: mErr } = await admin.from("machines").select("id").limit(1);
  if (mErr || !machines?.length) {
    console.error("Could not find any existing machine to test against:", mErr?.message);
    process.exit(1);
  }
  const machineId = machines[0].id;

  const serviceDate = "2026-08-19";
  const { data: inserted, error: insErr } = await admin
    .from("service_records")
    .insert({ machine_id: machineId, service_date: serviceDate, next_service_due: null, work_performed: "0031 QA check (throwaway, deleted immediately)" })
    .select("id, service_date, next_service_due")
    .single();

  if (insErr) {
    console.error("Insert failed (not necessarily bad -- but can't test):", insErr.message);
    process.exit(1);
  }
  rowId = inserted.id;

  const expected = "2027-08-19";
  const applied = inserted.next_service_due === expected;
  console.log(JSON.stringify({ migration_0031_applied: applied, service_date: inserted.service_date, next_service_due: inserted.next_service_due, expected }, null, 2));

  if (!applied) process.exitCode = 1;
} finally {
  if (rowId) {
    const { error: delErr } = await admin.from("service_records").delete().eq("id", rowId);
    const { data: check } = await admin.from("service_records").select("id").eq("id", rowId);
    console.log(JSON.stringify({ cleanup_delete_error: delErr?.message || null, row_still_exists: (check?.length || 0) > 0 }, null, 2));
  }
}
