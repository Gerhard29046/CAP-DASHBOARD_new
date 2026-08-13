#!/usr/bin/env node
// READ-ONLY investigation of the 2 leftover "qa-fixes+..." throwaway auth users discovered
// live during the Android Phase C session (2026-08-13) -- both escaped cleanup in an earlier,
// unrelated QA run of supabase/scripts/qa-verify-2026-08-13-fixes.mjs. That script creates
// `qa-fixes+admin-{timestamp}-{random}@invalid.local` / `qa-fixes+technician-{...}@invalid.local`
// accounts, exercises RLS, then deletes them in a cleanup block at the end of main() (also
// mirrored in the top-level .catch() for a best-effort delete on crash). This script makes NO
// writes and NO deletions -- it only reports what currently exists in production, so the user
// can make an informed, explicit decision before anything is removed.
//
// Usage: node scripts/qa-investigate-leftover-qa-users.mjs

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
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Tables that have a plausible "who did this" foreign key into auth users / public.users,
// checked for whether either leftover uid appears anywhere as an owner/actor.
const REFERENCING_TABLES = [
  { table: "clients", column: "created_by" },
  { table: "machines", column: "created_by" },
  { table: "service_records", column: "created_by" },
  { table: "job_cards", column: "created_by" },
  { table: "job_card_lines", column: "created_by" },
  { table: "dashboard_notes", column: "created_by" },
  { table: "client_imports", column: "imported_by" },
  { table: "knowledge_machines", column: "created_by" },
  { table: "knowledge_notes", column: "created_by" },
];

async function main() {
  console.log("Listing all Supabase Auth users (paginated)...\n");
  let page = 1;
  const perPage = 200;
  const allUsers = [];
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    allUsers.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  console.log(`Total Supabase Auth users: ${allUsers.length}`);
  allUsers.forEach((u) => console.log(`  - ${u.email}  (id=${u.id}, created_at=${u.created_at}, last_sign_in_at=${u.last_sign_in_at})`));

  const qaUsers = allUsers.filter((u) => (u.email || "").startsWith("qa-fixes+"));
  console.log(`\nMatching "qa-fixes+*" throwaway-pattern users: ${qaUsers.length}`);

  for (const u of qaUsers) {
    console.log(`\n=== ${u.email} (id=${u.id}) ===`);
    console.log(`  created_at: ${u.created_at}`);
    console.log(`  last_sign_in_at: ${u.last_sign_in_at}`);
    console.log(`  email_confirmed_at: ${u.email_confirmed_at}`);
    console.log(`  user_metadata: ${JSON.stringify(u.user_metadata)}`);
    console.log(`  app_metadata: ${JSON.stringify(u.app_metadata)}`);

    const { data: profile, error: profileErr } = await admin
      .from("users")
      .select("id, email, role, is_active, full_name, effective_permissions, created_at")
      .eq("id", u.id)
      .maybeSingle();
    if (profileErr) console.log(`  public.users row: ERROR (${profileErr.message})`);
    else if (!profile) console.log(`  public.users row: none`);
    else console.log(`  public.users row: role=${profile.role} is_active=${profile.is_active} full_name=${profile.full_name} created_at=${profile.created_at}`);

    let anyReference = false;
    for (const { table, column } of REFERENCING_TABLES) {
      const { data: rows, error: refErr } = await admin.from(table).select("id").eq(column, u.id).limit(5);
      if (refErr) {
        // Column/table may not exist on every table -- not fatal, just note it.
        continue;
      }
      if (rows && rows.length > 0) {
        anyReference = true;
        console.log(`  REFERENCED by ${table}.${column}: ${rows.length} row(s) (ids: ${rows.map((r) => r.id).join(", ")})`);
      }
    }
    if (!anyReference) console.log("  No references found in any checked business table (created_by/imported_by).");
  }

  console.log("\nDone. No writes or deletions were performed.");
}

main().catch((e) => {
  console.error("Investigation script crashed:", e.message);
  process.exit(1);
});
