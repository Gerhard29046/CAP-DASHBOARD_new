#!/usr/bin/env node
// Live QA for Phase D (Android->Supabase core-data migration) -- exercises the EXACT PostgREST
// request shapes mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/
// SupabaseData.kt's SupabaseDataRepository makes (GET select=*&order=created_at.desc, POST with
// Prefer: return=representation, PATCH by id, DELETE by id, GET with Prefer: count=exact),
// against the real production Supabase project, using a throwaway technician test user and
// throwaway business rows. This validates the server-side contract the Kotlin code depends on --
// it does NOT compile or run the Kotlin code itself (no Android build via CLI is possible in
// this environment, see docs/ai-memory/KNOWN_ISSUES.md; Android Studio's own GUI build does work
// but can't be driven or verified headlessly here).
//
// Usage: node scripts/qa-verify-android-phase-d-rest-contract.mjs

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
const ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

const cleanup = { userId: null, clientId: null, machineId: null, serviceRecordId: null, jobCardId: null, jobCardLineId: null };

// Mirrors SupabaseData.kt's private request()/postJson-equivalent -- raw fetch, no supabase-js
// query builder, so this genuinely exercises the same HTTP shapes the Kotlin code sends.
async function pgrest(path, { method = "GET", token, body, preferReturn = false, preferCount = false } = {}) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (preferReturn) headers["Prefer"] = "return=representation";
  if (preferCount) headers["Prefer"] = "count=exact";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : null };
}

async function main() {
  console.log("Creating throwaway technician test user (mirrors an ordinary Android login)...");
  const email = `qa-phase-d+technician-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
  cleanup.userId = created.user.id;
  await new Promise((r) => setTimeout(r, 500));
  // RLS (0002_rls_policies.sql) gates every write on public.has_permission('<resource>.create'
  // /.edit/.delete') against public.users.effective_permissions -- a bare "technician" role
  // with no explicit permissions granted correctly gets denied by design. Grant exactly the
  // permission set an ordinary field-technician Android user would realistically have, to test
  // the real intended path rather than an artificially permission-less account.
  await admin.from("users").update({
    role: "technician",
    is_active: true,
    effective_permissions: [
      "clients.view", "clients.create", "clients.edit",
      "machines.view", "machines.create", "machines.edit",
      "services.view", "services.create", "services.edit",
      "job_cards.view", "job_cards.create", "job_cards.edit",
      "job_cards.lines.manage",
    ],
  }).eq("id", cleanup.userId);

  // Exactly what SupabaseAuth.kt's login() does: POST /auth/v1/token?grant_type=password
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokenJson = await tokenRes.json();
  record("Login (password grant) succeeds for the throwaway technician", tokenRes.status === 200 && Boolean(tokenJson.access_token));
  const token = tokenJson.access_token;

  // === 1. clients: create (POST + Prefer: return=representation) ===
  const clientCreate = await pgrest("clients", {
    method: "POST", token, preferReturn: true,
    body: { company_name: "QA Phase D Client (delete me)", contact_person: "QA Bot", updated_at: new Date().toISOString() },
  });
  record("Create client (POST, Prefer: return=representation)", clientCreate.status === 201 && Array.isArray(clientCreate.json) && clientCreate.json[0]?.id, clientCreate.text);
  cleanup.clientId = clientCreate.json?.[0]?.id;

  // === 2. machines: create, referencing the client ===
  const machineCreate = await pgrest("machines", {
    method: "POST", token, preferReturn: true,
    body: { client_id: cleanup.clientId, brand: "QA", model: "Phase D Test Unit", machine_type: "Split AC", updated_at: new Date().toISOString() },
  });
  record("Create machine (POST, Prefer: return=representation)", machineCreate.status === 201 && machineCreate.json?.[0]?.id, machineCreate.text);
  cleanup.machineId = machineCreate.json?.[0]?.id;

  // === 3. service_records: create with the newer (post-0010) columns Android's screens read ===
  const serviceCreate = await pgrest("service_records", {
    method: "POST", token, preferReturn: true,
    body: { machine_id: cleanup.machineId, technician_name: "QA Bot", service_date: "2026-08-14", work_performed: "QA test service", updated_at: new Date().toISOString() },
  });
  record("Create service_record with service_date/work_performed (newer columns Android reads)", serviceCreate.status === 201 && serviceCreate.json?.[0]?.id, serviceCreate.text);
  cleanup.serviceRecordId = serviceCreate.json?.[0]?.id;

  // === 4. job_cards: create with job_number/date_received (newer columns Android reads) ===
  const jobCreate = await pgrest("job_cards", {
    method: "POST", token, preferReturn: true,
    body: { client_id: cleanup.clientId, machine_id: cleanup.machineId, job_number: "JOB-QA-PHASE-D", date_received: "2026-08-14", status: "Open", updated_at: new Date().toISOString() },
  });
  record("Create job_card with job_number/date_received (newer columns Android reads)", jobCreate.status === 201 && jobCreate.json?.[0]?.id, jobCreate.text);
  cleanup.jobCardId = jobCreate.json?.[0]?.id;

  // === 5. job_card_lines: create ===
  const lineCreate = await pgrest("job_card_lines", {
    method: "POST", token, preferReturn: true,
    body: { job_card_id: cleanup.jobCardId, line_type: "Labour", description: "QA test line", quantity: 1, unit_price: 100, line_total: 100, updated_at: new Date().toISOString() },
  });
  record("Create job_card_line (POST, Prefer: return=representation)", lineCreate.status === 201 && lineCreate.json?.[0]?.id, lineCreate.text);
  cleanup.jobCardLineId = lineCreate.json?.[0]?.id;

  // === 6. GET select=*&order=created_at.desc (exactly fetchAll()'s request shape) ===
  const listClients = await pgrest("clients?select=*&order=created_at.desc", { token });
  const found = listClients.json?.some((row) => row.id === cleanup.clientId);
  record("List clients (GET select=*&order=created_at.desc) includes the new row", listClients.status === 200 && found, `status=${listClients.status}`);

  // === 7. PATCH by id (exactly update()'s request shape) ===
  const patchRes = await pgrest(`clients?id=eq.${cleanup.clientId}`, {
    method: "PATCH", token, body: { notes: "Updated by QA Phase D script", updated_at: new Date().toISOString() },
  });
  record("Update client (PATCH ?id=eq.<id>)", patchRes.status === 200 || patchRes.status === 204, `status=${patchRes.status} ${patchRes.text}`);
  const { data: afterPatch } = await admin.from("clients").select("notes").eq("id", cleanup.clientId).single();
  record("Update actually persisted (verified via service-role read)", afterPatch?.notes === "Updated by QA Phase D script", `got "${afterPatch?.notes}"`);

  // === 8. Prefer: count=exact (exactly count()'s request shape) ===
  const countRes = await pgrest("clients?select=id&limit=1", { method: "GET", token, preferCount: true });
  const contentRange = countRes.headers.get("content-range");
  record("Count via Prefer: count=exact returns a Content-Range header", Boolean(contentRange), `Content-Range: ${contentRange}`);

  // === 9. Cross-table field/RLS sanity: a technician can read clients/machines/service_records/job_cards (needed for the Phase-D screens to work at all) ===
  const listMachines = await pgrest("machines?select=*", { token });
  const listServices = await pgrest("service_records?select=*", { token });
  const listJobs = await pgrest("job_cards?select=*", { token });
  const listLines = await pgrest("job_card_lines?select=*", { token });
  record("Technician can read machines", listMachines.status === 200);
  record("Technician can read service_records", listServices.status === 200);
  record("Technician can read job_cards", listJobs.status === 200);
  record("Technician can read job_card_lines", listLines.status === 200);

  // === 10. DELETE by id (exactly delete()'s request shape) -- delete the line first (FK-safe order) ===
  const deleteLineRes = await pgrest(`job_card_lines?id=eq.${cleanup.jobCardLineId}`, { method: "DELETE", token });
  record("Delete job_card_line (DELETE ?id=eq.<id>)", deleteLineRes.status === 200 || deleteLineRes.status === 204, `status=${deleteLineRes.status}`);
  const { data: afterDelete } = await admin.from("job_card_lines").select("id").eq("id", cleanup.jobCardLineId);
  record("Delete actually persisted (verified via service-role read, 0 rows remain)", afterDelete?.length === 0, `got ${afterDelete?.length} rows`);
  cleanup.jobCardLineId = null; // already deleted

  // === Cleanup ===
  // BUG FIX (2026-08-14): the old code fired these deletes with no error-checking at all (not
  // even a captured `{ error }`) and NO verification step of any kind afterward -- "Cleanup
  // complete." printed unconditionally, and cleanup status never fed into `results`/the exit
  // code. A silently-failed deleteUser() (or any of the row deletes) was therefore
  // indistinguishable from a real success. Fixed: capture each delete's own `{ error }`, then
  // independently RE-QUERY every deleted row + the auth user afterward (fresh reads, not the
  // delete calls' own return values) and record() each as a real pass/fail check so cleanup
  // failure now actually fails the script (same pattern already proven correct in
  // qa-verify-android-phase-e1-knowledge-rest-contract.mjs).
  console.log("\nCleaning up all QA fixture data...");
  async function cleanupRow(table, id) {
    if (!id) return;
    const { error } = await admin.from(table).delete().eq("id", id);
    if (error) console.error(`  cleanup call FAILED: ${table}.delete(${id}): ${error.message}`);
  }
  await cleanupRow("job_card_lines", cleanup.jobCardLineId);
  await cleanupRow("job_cards", cleanup.jobCardId);
  await cleanupRow("service_records", cleanup.serviceRecordId);
  await cleanupRow("machines", cleanup.machineId);
  await cleanupRow("clients", cleanup.clientId);
  let deleteUserErr = null;
  if (cleanup.userId) {
    const { error } = await admin.auth.admin.deleteUser(cleanup.userId);
    deleteUserErr = error;
    if (error) console.error(`  cleanup call FAILED: deleteUser(${cleanup.userId}): ${error.message}`);
  }
  console.log("Cleanup calls issued -- independently re-verifying now...");

  const rowChecks = [
    ["job_card_lines", cleanup.jobCardLineId],
    ["job_cards", cleanup.jobCardId],
    ["service_records", cleanup.serviceRecordId],
    ["machines", cleanup.machineId],
    ["clients", cleanup.clientId],
  ];
  for (const [table, id] of rowChecks) {
    if (!id) continue;
    const { data } = await admin.from(table).select("id").eq("id", id);
    record(`Cleanup verified: ${table} row gone`, (data?.length ?? -1) === 0, `remaining=${data?.length}`);
  }
  if (cleanup.userId) {
    const { data: usersAfter, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const stillListed = listErr ? true : usersAfter.users.some((u) => u.id === cleanup.userId);
    const { data: profileRow } = await admin.from("users").select("id").eq("id", cleanup.userId).maybeSingle();
    record(
      "Cleanup verified: throwaway Auth user + profile row gone (independently re-verified)",
      !deleteUserErr && !stillListed && !profileRow,
      `deleteError=${deleteUserErr ? deleteUserErr.message : "none"}, listUsersError=${listErr ? listErr.message : "none"}, stillListedInAuth=${stillListed}, profileRowExists=${!!profileRow}`
    );
  }
  console.log("Cleanup verification complete.");

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) {
    console.log("FAILURES:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`));
    process.exit(1);
  }
}

main().catch(async (e) => {
  // Crash-path (best-effort) cleanup -- this path already always exits 1, so it was never the
  // source of the false-PASS bug (that only lived in the happy-path cleanup above). Still
  // tightened per the same "never silently swallow a cleanup error" principle: log instead of
  // fully discarding, so a real orphaned-account cause is visible in the output instead of
  // silently disappearing into `.catch(() => {})`.
  console.error("QA script crashed:", e.message);
  const logCleanupErr = (label) => (err) => { if (err) console.error(`  crash-path cleanup FAILED: ${label}: ${err.message || err}`); };
  if (cleanup.jobCardLineId) await admin.from("job_card_lines").delete().eq("id", cleanup.jobCardLineId).then((r) => logCleanupErr("job_card_lines")(r.error), logCleanupErr("job_card_lines"));
  if (cleanup.jobCardId) await admin.from("job_cards").delete().eq("id", cleanup.jobCardId).then((r) => logCleanupErr("job_cards")(r.error), logCleanupErr("job_cards"));
  if (cleanup.serviceRecordId) await admin.from("service_records").delete().eq("id", cleanup.serviceRecordId).then((r) => logCleanupErr("service_records")(r.error), logCleanupErr("service_records"));
  if (cleanup.machineId) await admin.from("machines").delete().eq("id", cleanup.machineId).then((r) => logCleanupErr("machines")(r.error), logCleanupErr("machines"));
  if (cleanup.clientId) await admin.from("clients").delete().eq("id", cleanup.clientId).then((r) => logCleanupErr("clients")(r.error), logCleanupErr("clients"));
  if (cleanup.userId) await admin.auth.admin.deleteUser(cleanup.userId).then((r) => logCleanupErr("deleteUser")(r.error), logCleanupErr("deleteUser"));
  process.exit(1);
});
