#!/usr/bin/env node
// Firestore -> Postgres (Supabase) data-migration script. Phase 1 deliverable, expanded
// during the "continue building it but do not execute" instruction (2026-08-03).
//
// SAFETY: defaults to a DRY RUN (reads Firestore, prints what WOULD happen, writes
// NOTHING to Supabase, creates NO auth users, copies NO files) unless run with --apply.
// Never run --apply against production without a recent Firestore export/backup and the
// user's explicit go-ahead -- see CLAUDE.md section 12. This script has NEVER been
// executed (dry run or otherwise) as of this writing -- it has only been syntax-checked
// with `node --check`. Review carefully, install deps (`cd supabase && npm install`),
// and dry-run it yourself before ever considering --apply.
//
// Requires two separate credentials, neither of which should be committed or pasted into
// chat:
//   1. Firebase Admin credentials: set GOOGLE_APPLICATION_CREDENTIALS to the path of a
//      downloaded service-account JSON key (Firebase Console -> Project Settings ->
//      Service Accounts -> Generate new private key, project capdatabasefb2), OR run
//      `gcloud auth application-default login` yourself first (interactive; not something
//      Queen Bee attempted or should attempt on your behalf).
//   2. Supabase service_role key: already stored in ../.env as SUPABASE_SERVICE_ROLE_KEY
//      (gitignored, server-side only).
//
// Prerequisite: supabase/migrations/0001-0006 must already be applied (run manually by
// the user via the SQL Editor) before this script's --apply mode can do anything useful;
// dry-run mode only needs Firestore read access and works regardless. 0006 specifically
// (added 2026-08-03, Phase 2 prep) adds legacy_firestore_id to the four knowledge_* tables
// below that 0003 originally missed -- without it, the users-phase relink of
// knowledge_notes.created_by will fail with an unknown-column error.
//
// Phases (run in order, each gated by --apply for its writes):
//   A. entities  - import clients/machines/service_records/job_cards/job_card_lines/
//                  knowledge_machines/knowledge_notes/knowledge_service_codes/
//                  knowledge_media/knowledge_documents, tagged with legacy_firestore_id.
//                  Mapping table lives in scripts/lib/entityMappings.mjs (unit-tested
//                  separately -- see entityMappings.test.mjs).
//   B. relink    - re-point client_id/machine_id/job_card_id/knowledge_machine_id FK
//                  columns from the Firestore doc-id values they held in Firestore to the
//                  new Postgres uuids generated in phase A, using the legacy_firestore_id
//                  columns.
//   C. users     - create a Supabase Auth user per Firestore users/{uid} doc (via
//                  auth.admin.createUser), then update the auto-created public.users
//                  profile row with role/effective_permissions/is_active/preferences and
//                  legacy_firebase_uid, then re-link knowledge_notes.created_by.
//   D. storage   - copy files referenced by knowledge_media/knowledge_documents
//                  storage_path fields from Firebase Storage to the matching Supabase
//                  bucket. Best-effort; logs and continues on individual file failures
//                  rather than aborting the whole migration.
//   E. verify    - read-only: compares Firestore doc counts against Postgres row counts
//                  per collection/table and prints a match/mismatch report. No writes.
//
// Usage:
//   node scripts/migrate-firestore-to-postgres.mjs                       # dry run, all phases
//   node scripts/migrate-firestore-to-postgres.mjs --apply               # writes, all phases
//   node scripts/migrate-firestore-to-postgres.mjs --apply --phases=entities,relink
//   node scripts/migrate-firestore-to-postgres.mjs --apply --only=clients,machines
//   node scripts/migrate-firestore-to-postgres.mjs --phases=verify        # read-only check

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import admin from "firebase-admin";
import { ENTITY_COLLECTIONS, stripLegacyMarkers } from "./lib/entityMappings.mjs";

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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || fileEnv.FIREBASE_PROJECT_ID || "capdatabasefb2";
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || fileEnv.FIRESTORE_DATABASE_ID || "capdashboard";
const FIREBASE_STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || fileEnv.FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.firebasestorage.app`;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY = (args.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "").split(",").filter(Boolean);
const PHASES = (args.find((a) => a.startsWith("--phases="))?.split("=")[1] ?? "entities,relink,users,storage,verify").split(",").filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Check supabase/.env.");
  process.exit(1);
}

admin.initializeApp({ projectId: FIREBASE_PROJECT_ID, storageBucket: FIREBASE_STORAGE_BUCKET });
// Named Firestore database, matching frontend/src/lib/firebase.js's
// getFirestore(firebaseApp, "capdashboard") -- do NOT default to the (default) database.
const firestore = admin.firestore();
firestore.settings({ databaseId: FIRESTORE_DATABASE_ID });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Phase A: entities
// ---------------------------------------------------------------------------
// Column-mapping per collection -> table now lives in scripts/lib/entityMappings.mjs
// (imported above), so it can be unit-tested without firebase-admin/@supabase/supabase-js.
// Field names match supabase/migrations/0001_initial_schema.sql (verified against real
// component usage 2026-08-03). `id` is NOT reused from Firestore doc IDs -- a fresh uuid is
// generated and the Firestore doc ID is kept in `legacy_firestore_id` so phase B can
// re-link FKs.

// In-memory legacy-id -> new-uuid maps, populated during phase A, consumed by phase B.
// Also re-derivable from the database alone (via legacy_firestore_id columns) if phase B
// is run in a separate invocation from phase A -- see loadIdMapFromDb().
const idMaps = { clients: new Map(), machines: new Map(), job_cards: new Map(), knowledge_machines: new Map() };

async function loadIdMapFromDb(table) {
  const map = new Map();
  const { data, error } = await supabase.from(table).select("id, legacy_firestore_id").not("legacy_firestore_id", "is", null);
  if (error) throw error;
  for (const row of data) map.set(row.legacy_firestore_id, row.id);
  return map;
}

async function runEntityPhase() {
  console.log("\n=== Phase A: entities ===");
  const targets = ONLY.length ? ENTITY_COLLECTIONS.filter((c) => ONLY.includes(c.collection)) : ENTITY_COLLECTIONS;
  const results = [];

  for (const { collection, table, map } of targets) {
    const snapshot = await firestore.collection(collection).get();
    console.log(`\n${collection} -> ${table}: ${snapshot.size} docs`);
    if (snapshot.empty) { results.push({ collection, count: 0 }); continue; }

    const rows = snapshot.docs.map((doc) => {
      const { columns } = stripLegacyMarkers(map(doc.data()));
      return { legacy_firestore_id: doc.id, ...columns };
    });

    console.log(`  sample: ${JSON.stringify(rows[0])}`);

    if (!APPLY) { console.log("  (dry run - not written)"); results.push({ collection, count: rows.length }); continue; }

    for (const insertRow of rows) {
      const { data, error } = await supabase.from(table).insert(insertRow).select("id").single();
      if (error) { console.error(`  ERROR inserting into ${table} (legacy id ${insertRow.legacy_firestore_id}):`, error.message); continue; }
      if (table === "clients") idMaps.clients.set(insertRow.legacy_firestore_id, data.id);
      if (table === "machines") idMaps.machines.set(insertRow.legacy_firestore_id, data.id);
      if (table === "job_cards") idMaps.job_cards.set(insertRow.legacy_firestore_id, data.id);
      if (table === "knowledge_machines") idMaps.knowledge_machines.set(insertRow.legacy_firestore_id, data.id);
    }
    console.log(`  inserted up to ${rows.length} rows into ${table}`);
    results.push({ collection, count: rows.length });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Phase B: relink (client_id / machine_id / job_card_id FKs)
// ---------------------------------------------------------------------------
async function runRelinkPhase() {
  console.log("\n=== Phase B: relink foreign keys ===");
  if (!APPLY) {
    console.log("  (dry run - would re-derive id maps from legacy_firestore_id columns and update FK columns on machines/service_records/job_cards/job_card_lines)");
    return;
  }

  // Re-derive maps from the DB in case phase A ran in a prior invocation.
  const clientMap = idMaps.clients.size ? idMaps.clients : await loadIdMapFromDb("clients");
  const machineMap = idMaps.machines.size ? idMaps.machines : await loadIdMapFromDb("machines");
  const jobCardMap = idMaps.job_cards.size ? idMaps.job_cards : await loadIdMapFromDb("job_cards");
  const knowledgeMachineMap = idMaps.knowledge_machines.size ? idMaps.knowledge_machines : await loadIdMapFromDb("knowledge_machines");

  async function relinkTable(table, fkColumn, legacyCollection, legacyField, idMap) {
    const snapshot = await firestore.collection(legacyCollection).get();
    let updated = 0, skipped = 0;
    for (const doc of snapshot.docs) {
      const legacyRef = doc.data()[legacyField];
      if (legacyRef == null) continue;
      const newId = idMap.get(String(legacyRef));
      if (!newId) { skipped++; continue; }
      const { error } = await supabase.from(table).update({ [fkColumn]: newId }).eq("legacy_firestore_id", doc.id);
      if (error) { console.error(`  ERROR relinking ${table}.${fkColumn} for legacy ${doc.id}:`, error.message); continue; }
      updated++;
    }
    console.log(`  ${table}.${fkColumn}: ${updated} updated, ${skipped} skipped (legacy ref not found in map)`);
  }

  await relinkTable("machines", "client_id", "machines", "client_id", clientMap);
  await relinkTable("service_records", "machine_id", "service_records", "machine_id", machineMap);
  await relinkTable("job_cards", "client_id", "job_cards", "client_id", clientMap);
  await relinkTable("job_cards", "machine_id", "job_cards", "machine_id", machineMap);
  await relinkTable("job_card_lines", "job_card_id", "job_card_lines", "job_card_id", jobCardMap);
  // Added 2026-08-03 (Phase 2 prep): these four tables were previously not imported by
  // phase A at all -- see entityMappings.mjs and 0006_knowledge_legacy_ids.sql.
  await relinkTable("knowledge_notes", "knowledge_machine_id", "knowledge_notes", "knowledge_machine_id", knowledgeMachineMap);
  await relinkTable("knowledge_service_codes", "knowledge_machine_id", "knowledge_service_codes", "knowledge_machine_id", knowledgeMachineMap);
  await relinkTable("knowledge_media", "knowledge_machine_id", "knowledge_media", "knowledge_machine_id", knowledgeMachineMap);
  await relinkTable("knowledge_documents", "knowledge_machine_id", "knowledge_documents", "knowledge_machine_id", knowledgeMachineMap);
}

// ---------------------------------------------------------------------------
// Phase C: users (Firebase Auth -> Supabase Auth + public.users profile)
// ---------------------------------------------------------------------------
async function runUsersPhase() {
  console.log("\n=== Phase C: users ===");
  const snapshot = await firestore.collection("users").get();
  console.log(`users: ${snapshot.size} docs`);

  const userIdMap = new Map(); // legacy firebase uid -> new supabase auth uuid

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const firebaseUid = doc.id;
    console.log(`  ${firebaseUid} (${data.email ?? "no email"}) role=${data.role ?? "?"}`);

    if (!APPLY) continue;

    // Firebase Auth password hashes cannot be imported through the standard
    // auth.admin.createUser API -- users will need a password reset email after
    // migration (or a Supabase Auth bulk-import-with-password-hash flow, not implemented
    // here). This creates the account without a usable password.
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      user_metadata: { migrated_from_firebase_uid: firebaseUid },
    });
    if (createError) {
      console.error(`  ERROR creating auth user for ${data.email}:`, createError.message);
      continue;
    }
    const newUserId = created.user.id;
    userIdMap.set(firebaseUid, newUserId);

    const rawPermissions = data.effective_permissions ?? data.permissions ?? [];
    const permissions = Array.isArray(rawPermissions)
      ? rawPermissions
      : Object.entries(rawPermissions).filter(([, allowed]) => allowed).map(([key]) => key);

    const { error: updateError } = await supabase.from("users").update({
      full_name: data.full_name ?? data.name ?? null,
      role: data.role ?? "staff",
      is_active: data.is_active ?? data.active ?? false,
      effective_permissions: permissions,
      preferences: data.preferences ?? {},
      legacy_firebase_uid: firebaseUid,
    }).eq("id", newUserId);
    if (updateError) console.error(`  ERROR updating profile for ${data.email}:`, updateError.message);
  }

  if (!APPLY) { console.log("  (dry run - no auth users created)"); return; }

  // Re-link knowledge_notes.created_by using the uid map just built.
  const notesSnapshot = await firestore.collection("knowledge_notes").get();
  let relinked = 0;
  for (const doc of notesSnapshot.docs) {
    const legacyCreatedBy = doc.data().created_by;
    if (!legacyCreatedBy) continue;
    const newUserId = userIdMap.get(String(legacyCreatedBy));
    if (!newUserId) continue;
    const { error } = await supabase.from("knowledge_notes")
      .update({ created_by: newUserId })
      .eq("legacy_firestore_id", doc.id);
    if (!error) relinked++;
  }
  console.log(`  knowledge_notes.created_by: ${relinked} relinked`);
  console.log("  REMINDER: migrated users have no usable password. Trigger a password-reset email for each before announcing the cutover.");
}

// ---------------------------------------------------------------------------
// Phase D: storage (best-effort file copy)
// ---------------------------------------------------------------------------
async function copyStorageFile(firebasePath, bucket, supabasePath) {
  const file = admin.storage().bucket().file(firebasePath);
  const [exists] = await file.exists();
  if (!exists) { console.log(`  SKIP (not found in Firebase Storage): ${firebasePath}`); return false; }
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const { error } = await supabase.storage.from(bucket).upload(supabasePath, buffer, {
    contentType: metadata.contentType,
    upsert: true,
  });
  if (error) { console.error(`  ERROR uploading ${supabasePath} to ${bucket}:`, error.message); return false; }
  return true;
}

async function runStoragePhase() {
  console.log("\n=== Phase D: storage ===");
  const sources = [
    { collection: "knowledge_media", bucket: "photos" },
    { collection: "knowledge_documents", bucket: "documents" },
  ];

  for (const { collection, bucket } of sources) {
    const snapshot = await firestore.collection(collection).get();
    console.log(`\n${collection} -> bucket "${bucket}": ${snapshot.size} docs`);
    let copied = 0, skipped = 0;
    for (const doc of snapshot.docs) {
      const path = doc.data().storage_path;
      if (!path) { skipped++; continue; }
      if (!APPLY) { console.log(`  (dry run) would copy ${path} -> ${bucket}/${path}`); continue; }
      const ok = await copyStorageFile(path, bucket, path);
      if (ok) copied++; else skipped++;
    }
    if (APPLY) console.log(`  copied ${copied}, skipped ${skipped}`);
  }
  console.log("\n  NOT covered by this phase: profile-images, invoices, attachments buckets --");
  console.log("  no current Firestore field/collection was identified that references files");
  console.log("  for those buckets (see docs/ai-memory/KNOWN_ISSUES.md). Add a source mapping");
  console.log("  here once a real feature using them is confirmed.");
}

// ---------------------------------------------------------------------------
// Phase E: verify (read-only Firestore-count vs Postgres-count check)
// ---------------------------------------------------------------------------
async function runVerifyPhase() {
  console.log("\n=== Phase E: verify (read-only) ===");
  const targets = ONLY.length ? ENTITY_COLLECTIONS.filter((c) => ONLY.includes(c.collection)) : ENTITY_COLLECTIONS;
  let anyMismatch = false;

  for (const { collection, table } of targets) {
    const snapshot = await firestore.collection(collection).get();
    const firestoreCount = snapshot.size;
    const { count: postgresCount, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.error(`  ${collection} -> ${table}: ERROR reading Postgres count:`, error.message);
      anyMismatch = true;
      continue;
    }
    const match = firestoreCount === postgresCount;
    if (!match) anyMismatch = true;
    console.log(`  ${collection} -> ${table}: Firestore=${firestoreCount} Postgres=${postgresCount} ${match ? "OK" : "MISMATCH"}`);
  }

  console.log(anyMismatch
    ? "  Result: at least one mismatch found -- do not treat the migration as complete until resolved."
    : "  Result: all counts match.");
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writes to Supabase, creates auth users, copies files)" : "DRY RUN (no writes)"}`);
  console.log(`Firestore: project ${FIREBASE_PROJECT_ID}, database ${FIRESTORE_DATABASE_ID}`);
  console.log(`Firebase Storage bucket: ${FIREBASE_STORAGE_BUCKET}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Phases: ${PHASES.join(", ")}`);

  if (PHASES.includes("entities")) await runEntityPhase();
  if (PHASES.includes("relink")) await runRelinkPhase();
  if (PHASES.includes("users")) await runUsersPhase();
  if (PHASES.includes("storage")) await runStoragePhase();
  if (PHASES.includes("verify")) await runVerifyPhase();

  console.log("\nRemaining known gaps after all phases (see docs/ai-memory/KNOWN_ISSUES.md):");
  console.log("  - sites collection: not migrated (nested under clients in current Firestore");
  console.log("    model, no dedicated collection found to read from).");
  console.log("  - calendar_records / invoice_queue: confirmed unused, intentionally skipped.");
  console.log("  - Migrated users have no usable password (see Phase C reminder above).");
  console.log("  - This script has still never been executed end-to-end against real data;");
  console.log("    treat every phase as unverified until a real dry run is reviewed.");

  await admin.app().delete();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
