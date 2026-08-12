#!/usr/bin/env node
// Temporary diagnostic (2026-08-07 cutover prep): compares Firestore users vs
// Postgres public.users + auth.users, since migrate-firestore-to-postgres.mjs's `verify`
// phase doesn't cover the users collection. Read-only.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import admin from "firebase-admin";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}
const env = loadEnv(".env");
if (env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = env.GOOGLE_APPLICATION_CREDENTIALS;
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
db.settings({ databaseId: "capdashboard" });

const snap = await db.collection("users").get();
console.log(`Firestore users: ${snap.size}`);
for (const doc of snap.docs) {
  console.log(" -", doc.id, doc.data().email, doc.data().role);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pgUsers, error } = await supabase.from("users").select("id, email, role, legacy_firebase_uid, is_active");
if (error) { console.error(error); process.exit(1); }
console.log(`\nPostgres public.users: ${pgUsers.length}`);
for (const u of pgUsers) console.log(" -", u.id, u.email, u.role, "legacy_firebase_uid=" + u.legacy_firebase_uid, "is_active=" + u.is_active);

const { data: authUsers } = await supabase.auth.admin.listUsers();
console.log(`\nSupabase auth.users: ${authUsers.users.length}`);
for (const u of authUsers.users) console.log(" -", u.id, u.email);

process.exit(0);
