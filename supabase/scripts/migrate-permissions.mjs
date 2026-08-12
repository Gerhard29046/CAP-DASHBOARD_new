#!/usr/bin/env node
// Migrates the two Firestore collections migrate-firestore-to-postgres.mjs's entity mappings
// never covered at all: `permissions` (flat catalog, 1:1 with public.permissions) and
// `role_permissions` (Firestore: one doc per role holding a permissions array; Postgres: a
// normalized (role, permission_key) table per 0001_initial_schema.sql -- so each Firestore
// doc fans out into N Postgres rows, one per permission key).
//
// Requires supabase/migrations/0014_permissions_name_and_group.sql applied first (adds the
// `name`/`group` columns these mappings write to).
//
// Dry-run by default (matches every other script in this repo). --apply writes for real.
//
// Usage:
//   node scripts/migrate-permissions.mjs           # dry run
//   node scripts/migrate-permissions.mjs --apply    # real write

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import admin from "firebase-admin";

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
    // fall through
  }
  return env;
}

const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (fileEnv.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = fileEnv.GOOGLE_APPLICATION_CREDENTIALS;
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
db.settings({ databaseId: "capdashboard" });

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writes real rows)" : "DRY RUN (no writes)"}`);

  const permsSnap = await db.collection("permissions").get();
  const rolePermsSnap = await db.collection("role_permissions").get();

  const permissionRows = permsSnap.docs.map((doc) => {
    const d = doc.data();
    return { key: d.key, name: d.name, description: d.description ?? null, group: d.group ?? null };
  });

  const rolePermissionRows = [];
  for (const doc of rolePermsSnap.docs) {
    const d = doc.data();
    const role = d.role ?? doc.id;
    for (const permission_key of d.permissions ?? []) {
      rolePermissionRows.push({ role, permission_key });
    }
  }

  console.log(`\nFirestore permissions: ${permissionRows.length}`);
  console.log(`Firestore role_permissions docs: ${rolePermsSnap.size} -> ${rolePermissionRows.length} flattened (role, permission_key) rows`);

  // Sanity check before writing anything: role_permissions.permission_key has a foreign key
  // to permissions.key, so every referenced key must exist in the set we're about to insert.
  const knownKeys = new Set(permissionRows.map((p) => p.key));
  const missing = rolePermissionRows.filter((r) => !knownKeys.has(r.permission_key));
  if (missing.length > 0) {
    console.error(`\nERROR: ${missing.length} role_permissions rows reference a permission_key not present in the permissions collection:`);
    for (const m of missing.slice(0, 10)) console.error(`  role=${m.role} permission_key=${m.permission_key}`);
    process.exit(1);
  }
  console.log("FK sanity check passed: every role_permissions.permission_key exists in permissions.");

  if (!APPLY) {
    console.log("\n(dry run - no writes) Sample permission row:", permissionRows[0]);
    console.log("Sample role_permission row:", rolePermissionRows[0]);
    return;
  }

  console.log("\nInserting permissions...");
  const { error: permErr, data: permData } = await supabase.from("permissions").insert(permissionRows).select("id");
  if (permErr) {
    console.error("permissions insert failed:", permErr.message);
    process.exit(1);
  }
  console.log(`  inserted ${permData.length} permissions rows`);

  console.log("Inserting role_permissions...");
  const { error: rpErr, data: rpData } = await supabase.from("role_permissions").insert(rolePermissionRows).select("id");
  if (rpErr) {
    console.error("role_permissions insert failed:", rpErr.message);
    process.exit(1);
  }
  console.log(`  inserted ${rpData.length} role_permissions rows`);

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
