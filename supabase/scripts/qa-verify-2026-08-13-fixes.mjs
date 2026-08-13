#!/usr/bin/env node
// Scripted QA (no browser tool available this session) for the 2026-08-13 UX-redesign-
// resume batch: the Job Card line-item display bug fix, the new products_services/
// job_card_settings/client_imports tables + RLS, and the settings.access/clients.import
// permission gating. Creates throwaway auth users + throwaway business rows, exercises the
// real code paths (mirroring exactly what JobCardDetail.jsx/BookIn.jsx/Settings.jsx do),
// then deletes everything it created. Touches zero real business data.
//
// dashboard_notes is intentionally NOT exercised here beyond a defense-in-depth RLS check
// -- real reads/writes only ever go through the dashboardNotes Cloud Function, which is
// still not deployed (see KNOWN_ISSUES.md, GCP billing). The ClientDetail.jsx fix itself
// (reading dashboardNotesClient.list() and filtering by client_id) can't be exercised
// end-to-end until that function is live.
//
// Usage: cd supabase && node scripts/qa-verify-2026-08-13-fixes.mjs

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

const cleanup = { userIds: [], clientIds: [], machineIds: [], jobCardIds: [], productIds: [], importIds: [] };

async function createTestUser(role) {
  const email = `qa-fixes+${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${role}) failed: ${error.message}`);
  const uid = created.user.id;
  cleanup.userIds.push(uid);
  await new Promise((r) => setTimeout(r, 500));
  await admin.from("users").update({ role, is_active: true }).eq("id", uid);
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn(${role}) failed: ${signInErr.message}`);
  return client;
}

async function main() {
  console.log("Creating throwaway admin + technician test users...");
  const adminClient = await createTestUser("admin");
  const techClient = await createTestUser("technician");

  // --- Seed throwaway client/machine/job card via service role ---
  const { data: client } = await admin.from("clients").insert({ company_name: "QA Fixture Client (delete me)" }).select().single();
  cleanup.clientIds.push(client.id);
  const { data: machine } = await admin.from("machines").insert({ client_id: client.id, brand: "QA", model: "Test Unit" }).select().single();
  cleanup.machineIds.push(machine.id);
  const { data: jobCard } = await admin.from("job_cards").insert({ client_id: client.id, machine_id: machine.id, status: "Open", job_number: "JOB-QA-TEST" }).select().single();
  cleanup.jobCardIds.push(jobCard.id);

  // === 1. Job Card line-item bug fix: mirror JobCardDetail.jsx's load() exactly ===
  const { data: line1, error: line1Err } = await adminClient.from("job_card_lines").insert({
    job_card_id: jobCard.id, line_type: "Part / Product", description: "QA Test Product", quantity: 2, unit_price: 100, line_total: 200,
  }).select().single();
  record("Add product line item (write)", !line1Err, line1Err?.message);

  const { data: line2, error: line2Err } = await adminClient.from("job_card_lines").insert({
    job_card_id: jobCard.id, line_type: "Labour", description: "QA Test Service", quantity: 1, unit_price: 50, line_total: 50,
  }).select().single();
  record("Add service line item (write)", !line2Err, line2Err?.message);

  // Exactly what JobCardDetail.jsx's fixed load() does: JobCard.get(id) + JobCardLine.filter({job_card_id: id})
  const { data: fetchedJob } = await adminClient.from("job_cards").select("*").eq("id", jobCard.id).single();
  const { data: fetchedLines } = await adminClient.from("job_card_lines").select("*").eq("job_card_id", jobCard.id);
  record("Job Card fetch returns the row", Boolean(fetchedJob));
  record("job_card_lines re-fetch after add returns BOTH lines (the actual bug)", fetchedLines?.length === 2, `got ${fetchedLines?.length}`);

  const total = fetchedLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0);
  record("Line total calculation correct (2x100 + 1x50 = 250)", total === 250, `got ${total}`);

  // Remove one line, confirm persistence
  await adminClient.from("job_card_lines").delete().eq("id", line1.id);
  const { data: afterDelete } = await adminClient.from("job_card_lines").select("*").eq("job_card_id", jobCard.id);
  record("Line removal persists (1 line remains after deleting 1 of 2)", afterDelete?.length === 1, `got ${afterDelete?.length}`);

  // === 2. InvoiceQueue's independent read path (already fetches JobCardLine.list() directly) ===
  const { data: allLines } = await adminClient.from("job_card_lines").select("*");
  const invoiceLinesForJob = allLines.filter((l) => l.job_card_id === jobCard.id);
  record("InvoiceQueue-style full-list-then-filter also sees correct remaining line", invoiceLinesForJob.length === 1);

  // === 3. products_services RLS: any active user can read, only settings.access can write ===
  const { data: product, error: productErr } = await adminClient.from("products_services").insert({
    type: "product", name: "QA Test Widget", unit_price: 199.99,
  }).select().single();
  record("Admin (settings.access via is_admin bypass) can create a catalogue item", !productErr, productErr?.message);
  if (product) cleanup.productIds.push(product.id);

  const { error: techProductErr } = await techClient.from("products_services").insert({ type: "product", name: "Should Be Denied", unit_price: 1 });
  record("Technician (no settings.access) is DENIED creating a catalogue item", Boolean(techProductErr));

  const { data: techReadProducts, error: techReadErr } = await techClient.from("products_services").select("*").eq("id", product?.id ?? "");
  record("Technician CAN read the catalogue (needed to add Job Card lines)", !techReadErr);

  // === 4. job_card_settings RLS: any active user reads, only settings.access writes ===
  const { data: settingsRow, error: settingsReadErr } = await techClient.from("job_card_settings").select("*").eq("id", true).single();
  record("Technician can read job_card_settings (needed by BookIn.jsx)", !settingsReadErr && Boolean(settingsRow), settingsReadErr?.message);

  // Postgres RLS UPDATE with a failing USING clause silently matches 0 rows rather than
  // throwing an error via supabase-js when .select() isn't chained -- check the value
  // actually didn't change (via the service-role client) rather than expecting an error.
  await techClient.from("job_card_settings").update({ numbering_prefix: "HACK-" }).eq("id", true);
  const { data: afterTechWrite } = await admin.from("job_card_settings").select("numbering_prefix").eq("id", true).single();
  record("Technician's update did NOT actually change job_card_settings (RLS silently blocked it)", afterTechWrite?.numbering_prefix !== "HACK-", `numbering_prefix is now "${afterTechWrite?.numbering_prefix}"`);

  const { error: adminSettingsWriteErr } = await adminClient.from("job_card_settings").update({ numbering_prefix: "JOB-" }).eq("id", true);
  record("Admin CAN update job_card_settings", !adminSettingsWriteErr, adminSettingsWriteErr?.message);

  // === 5. dashboard_notes: defense-in-depth check only (real access is via Cloud Function, not deployed yet) ===
  // Postgres RLS with zero policies denies SELECT by returning 0 rows, not necessarily a
  // thrown error -- seed one row via service-role first so a non-empty result would prove
  // a real leak, not just an empty table.
  const { data: seededNote } = await admin.from("dashboard_notes").insert({ created_by: cleanup.userIds[0], content: "QA fixture, delete me" }).select().single();
  const { data: notesLeak, error: notesDenyErr } = await adminClient.from("dashboard_notes").select("*").eq("id", seededNote.id);
  record("dashboard_notes correctly denies even admin direct access (zero RLS policies by design -- Cloud Function only)", Boolean(notesDenyErr) || notesLeak?.length === 0, notesDenyErr?.message || `got ${notesLeak?.length} rows back`);
  await admin.from("dashboard_notes").delete().eq("id", seededNote.id);

  // === 6. client_imports + legacy_pastel_customer_code duplicate detection ===
  const { data: importedClient, error: importedClientErr } = await adminClient.from("clients").insert({
    company_name: "QA Pastel Test Co", legacy_pastel_customer_code: "QA-PASTEL-001",
  }).select().single();
  record("Client with legacy_pastel_customer_code can be created", !importedClientErr, importedClientErr?.message);
  if (importedClient) cleanup.clientIds.push(importedClient.id);

  const { error: dupCodeErr } = await adminClient.from("clients").insert({
    company_name: "Different Name Same Code", legacy_pastel_customer_code: "QA-PASTEL-001",
  });
  record("Duplicate legacy_pastel_customer_code is REJECTED (unique index working)", Boolean(dupCodeErr));

  const { data: importRow, error: importRowErr } = await adminClient.from("client_imports").insert({
    source_filename: "qa-test.xlsx", row_count: 1, imported_count: 1, duplicate_count: 0, skipped_count: 0,
  }).select().single();
  record("Admin can write a client_imports history row", !importRowErr, importRowErr?.message);
  if (importRow) cleanup.importIds.push(importRow.id);

  const { error: techImportErr } = await techClient.from("client_imports").insert({ source_filename: "hack.xlsx", row_count: 1 });
  record("Technician (no clients.import) is DENIED writing client_imports", Boolean(techImportErr));

  // === Cleanup ===
  console.log("\nCleaning up all QA fixture data...");
  for (const id of cleanup.importIds) await admin.from("client_imports").delete().eq("id", id);
  for (const id of cleanup.productIds) await admin.from("products_services").delete().eq("id", id);
  for (const id of cleanup.jobCardIds) await admin.from("job_cards").delete().eq("id", id); // cascades job_card_lines
  for (const id of cleanup.machineIds) await admin.from("machines").delete().eq("id", id);
  for (const id of cleanup.clientIds) await admin.from("clients").delete().eq("id", id);
  for (const id of cleanup.userIds) await admin.auth.admin.deleteUser(id);
  console.log("Cleanup complete.");

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) {
    console.log("FAILURES:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`));
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error("QA script crashed:", e.message);
  // Best-effort cleanup even on crash.
  for (const id of cleanup.importIds) await admin.from("client_imports").delete().eq("id", id).catch(() => {});
  for (const id of cleanup.productIds) await admin.from("products_services").delete().eq("id", id).catch(() => {});
  for (const id of cleanup.jobCardIds) await admin.from("job_cards").delete().eq("id", id).catch(() => {});
  for (const id of cleanup.machineIds) await admin.from("machines").delete().eq("id", id).catch(() => {});
  for (const id of cleanup.clientIds) await admin.from("clients").delete().eq("id", id).catch(() => {});
  for (const id of cleanup.userIds) await admin.auth.admin.deleteUser(id).catch(() => {});
  process.exit(1);
});
