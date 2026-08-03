#!/usr/bin/env node
// Live smoke test against the real Supabase project. Verifies the schema/RLS/grants/
// triggers actually behave as designed -- NOT the Firestore data migration (that script is
// separate: migrate-firestore-to-postgres.mjs, still not executed, still blocked on
// Firebase Admin credentials, and the user has separately said not to run it this
// session).
//
// Creates ONE throwaway auth user + a handful of throwaway rows across several
// permission-gated tables, exercises RLS deny/allow through them, then cleans up. Does not
// touch Firebase, Firestore, or any real business data.
//
// Requires supabase/.env (gitignored) with:
//   SUPABASE_URL=https://<project-ref>.supabase.co
//   SUPABASE_ANON_KEY=<publishable key>              (required)
//   SUPABASE_SERVICE_ROLE_KEY=<secret key>            (optional, see below)
//
// With SUPABASE_SERVICE_ROLE_KEY set: creates the test user via auth.admin.createUser
// (email_confirm: true, no email sent), seeds/grants/cleans up via the admin client.
// Without it: falls back to a normal supabase.auth.signUp() call with the anon key (may
// trigger a real confirmation email depending on the project's auth settings), the RLS
// deny checks below become inconclusive (nothing to seed), and the test user/rows must be
// removed manually via the Supabase Dashboard afterward.
//
// Usage: cd supabase && npm install && node scripts/smoke-test.mjs

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
  } catch {
    // no .env file - fall through to process.env
  }
  return env;
}

const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY. Add them to supabase/.env (gitignored) first.");
  console.error("See this script's header comment for the exact keys needed.");
  process.exit(1);
}

const TEST_EMAIL = `phase2-smoketest+${Date.now()}@invalid.local`;
const TEST_PASSWORD = `Sm0keTest-${Math.random().toString(36).slice(2)}`;

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} - ${name}${detail ? `: ${detail}` : ""}`);
}

// One representative permission-gated table per distinct permission-key namespace in
// 0002_rls_policies.sql, seeded in dependency order (machines needs a client_id) and
// cleaned up in reverse (machines before clients, since machines.client_id is ON DELETE
// RESTRICT -- job_cards/knowledge_machines have no FK dependency on the others here).
const RLS_TABLES = [
  { table: "clients", viewPermission: "clients.view", seed: () => ({ company_name: "Phase 2 Smoke Test Client" }) },
  { table: "machines", viewPermission: "machines.view", seed: (ctx) => ({ client_id: ctx.clients, brand: "Phase2SmokeTest" }) },
  { table: "job_cards", viewPermission: "job_cards.view", seed: () => ({ status: "Open", fault_description: "Phase 2 smoke test job card" }) },
  { table: "knowledge_machines", viewPermission: "knowledge_base.view", seed: () => ({ name: "Phase 2 Smoke Test Knowledge Machine" }) },
];

async function main() {
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Test account: ${TEST_EMAIL}`);
  console.log(`Cleanup mode: ${SUPABASE_SERVICE_ROLE_KEY ? "automatic (service_role available)" : "MANUAL (no service_role key -- delete the test user/rows yourself afterward)"}`);

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const adminClient = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

  let userId = null;
  const seededIds = {}; // table -> id

  console.log("\n=== Step 0: seed one throwaway row per RLS-tested table (service_role, bypasses RLS) ===");
  if (adminClient) {
    for (const { table, seed } of RLS_TABLES) {
      const { data, error } = await adminClient.from(table).insert(seed(seededIds)).select("id").single();
      if (error) record(`seed ${table}`, false, error.message);
      else { seededIds[table] = data.id; record(`seed ${table}`, true, data.id); }
    }
  } else {
    console.log("  (skipped -- no service_role key, cannot seed data; RLS deny checks below will be inconclusive on empty tables)");
  }

  console.log("\n=== Step 1: create test user ===");
  if (adminClient) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) { record("create test user (admin)", false, error.message); return finish(userId, adminClient, seededIds); }
    userId = data.user.id;
    record("create test user (admin)", true, userId);
  } else {
    const { data, error } = await anonClient.auth.signUp({ email: TEST_EMAIL, password: TEST_PASSWORD });
    if (error) { record("create test user (signUp)", false, error.message); return finish(userId, adminClient, seededIds); }
    userId = data.user?.id ?? null;
    record("create test user (signUp)", Boolean(userId), userId ?? "no user id returned -- email confirmation may be required before a session exists");
  }

  console.log("\n=== Step 2: sign in as test user ===");
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    record("sign in as test user", false, signInError.message);
    console.log("  (expected if using the signUp fallback and the project requires email confirmation)");
    return finish(userId, adminClient, seededIds);
  }
  record("sign in as test user", true);
  userId = userId ?? signInData.user.id;

  console.log("\n=== Step 3: handle_new_auth_user trigger created a public.users row ===");
  {
    const { data, error } = await anonClient.from("users").select("*").eq("id", userId).single();
    record("own users row exists with expected defaults", !error && data?.role === "staff" && data?.is_active === true,
      error ? error.message : `role=${data.role} is_active=${data.is_active} effective_permissions=${JSON.stringify(data.effective_permissions)}`);
  }

  console.log("\n=== Step 4: RLS denies each table with no permissions granted ===");
  for (const { table } of RLS_TABLES) {
    const { data, error } = await anonClient.from(table).select("*");
    const zeroRowsReturned = !error && Array.isArray(data) && data.length === 0;
    const seeded = Boolean(seededIds[table]);
    record(
      seeded ? `${table} select returns zero rows despite a real row existing (RLS deny proven)` : `${table} select returns zero rows (inconclusive -- table may just be empty)`,
      zeroRowsReturned,
      error ? error.message : `${data?.length ?? "?"} rows returned${seeded ? " (1 real row exists server-side)" : ""}`,
    );
  }

  console.log("\n=== Step 5: self can update own preferences ===");
  {
    const { error } = await anonClient.from("users").update({ preferences: { show_google_calendar: true } }).eq("id", userId);
    record("self-update of preferences succeeds", !error, error?.message);
  }

  console.log("\n=== Step 6: restrict_self_user_update trigger blocks self role escalation ===");
  {
    const { error } = await anonClient.from("users").update({ role: "admin" }).eq("id", userId);
    record("self-update of role is rejected by trigger", Boolean(error), error ? error.message : "UPDATE succeeded -- trigger did NOT block it (real problem)");
  }

  const seededAnyTable = RLS_TABLES.some(({ table }) => seededIds[table]);
  if (adminClient && seededAnyTable) {
    console.log("\n=== Step 7: RLS allows each table once granted its view permission (proves the ALLOW branch, not just deny) ===");
    const allPermissions = RLS_TABLES.map((t) => t.viewPermission);
    const { error: grantError } = await adminClient.from("users")
      .update({ effective_permissions: allPermissions })
      .eq("id", userId);
    if (grantError) {
      record(`grant [${allPermissions.join(", ")}] (service_role)`, false, grantError.message);
    } else {
      record(`grant [${allPermissions.join(", ")}] (service_role)`, true);
      for (const { table } of RLS_TABLES) {
        if (!seededIds[table]) continue;
        const { data, error } = await anonClient.from(table).select("*");
        const sawSeededRow = !error && Array.isArray(data) && data.some((row) => row.id === seededIds[table]);
        record(`${table} select now returns the seeded row after being granted ${RLS_TABLES.find((t) => t.table === table).viewPermission}`, sawSeededRow,
          error ? error.message : `${data?.length ?? "?"} rows returned`);
      }
    }
  } else {
    console.log("\n=== Step 7: skipped (needs service_role + at least one seeded row) ===");
  }

  console.log("\n=== Step 8: storage buckets from 0004_storage_buckets.sql exist ===");
  if (adminClient) {
    const { data, error } = await adminClient.storage.listBuckets();
    const expected = ["profile-images", "invoices", "documents", "photos", "attachments"];
    const found = new Set((data ?? []).map((b) => b.id));
    const missing = expected.filter((id) => !found.has(id));
    record("all 5 expected storage buckets exist", !error && missing.length === 0,
      error ? error.message : (missing.length ? `missing: ${missing.join(", ")}` : `found: ${expected.join(", ")}`));
  } else {
    console.log("  skipped -- needs service_role key to list buckets");
  }

  await finish(userId, adminClient, seededIds);
}

async function finish(userId, adminClient, seededIds) {
  console.log("\n=== Cleanup ===");
  if (adminClient) {
    // Reverse of RLS_TABLES seed order -- machines (ON DELETE RESTRICT on client_id) must
    // go before clients; job_cards/knowledge_machines have no FK dependency on the others.
    for (const { table } of [...RLS_TABLES].reverse()) {
      const id = seededIds[table];
      if (!id) continue;
      const { error } = await adminClient.from(table).delete().eq("id", id);
      if (error) console.error(`  Could not delete seeded ${table} row ${id}: ${error.message} -- remove manually.`);
      else console.log(`  Deleted seeded ${table} row ${id}.`);
    }
  }
  if (userId && adminClient) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) console.error(`  Could not delete test user ${userId}: ${error.message} -- remove manually via the Supabase Dashboard.`);
    else console.log(`  Deleted test user ${userId} (public.users row cascaded).`);
  } else if (userId) {
    console.log(`  No service_role key available -- manually delete test user ${userId} (${TEST_EMAIL}) via Supabase Dashboard -> Authentication -> Users.`);
  } else {
    console.log("  No test user was created -- nothing to clean up.");
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"} - ${r.name}`);
  console.log(failed.length ? `\n${failed.length} check(s) FAILED -- review before trusting RLS/grants.` : "\nAll checks passed.");
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
