#!/usr/bin/env node
// One-off, explicit-user-approved action (2026-08-11): sets a real password for the real
// migrated admin account (admin@connoisseurauto.co.za), which was created via
// auth.admin.createUser with no password (Firebase hashes aren't importable) and has never
// had a confirmed working password since. Uses supabase.auth.admin.updateUserById, then
// verifies the new password actually works via a real signInWithPassword call (not just
// trusting the update call succeeded), and signs the verification session back out.
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
    // fall through to process.env
  }
  return env;
}

const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY in supabase/.env");
  process.exit(1);
}

const TARGET_EMAIL = "admin@connoisseurauto.co.za";
const NEW_PASSWORD = process.argv[2];
if (!NEW_PASSWORD) {
  console.error("Usage: node scripts/qa-set-admin-password.mjs <new-password>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}
const user = listData.users.find((u) => u.email === TARGET_EMAIL);
if (!user) {
  console.error(`No auth.users row found for ${TARGET_EMAIL}`);
  process.exit(1);
}

console.log(`Found ${TARGET_EMAIL} (id=${user.id}). Setting new password...`);

const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
  password: NEW_PASSWORD,
  email_confirm: true,
});
if (updateErr) {
  console.error("updateUserById failed:", updateErr.message);
  process.exit(1);
}
console.log("Password update call succeeded. Verifying with a real sign-in...");

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
  email: TARGET_EMAIL,
  password: NEW_PASSWORD,
});
if (signInErr) {
  console.error("VERIFICATION FAILED - sign-in with new password did not work:", signInErr.message);
  process.exit(1);
}

console.log("VERIFIED: sign-in with new password succeeded.", {
  uid: signInData.user.id,
  email: signInData.user.email,
  session_present: !!signInData.session,
});

// Sign back out of the verification session so we don't leave a lingering session token.
await anon.auth.signOut();
console.log("Verification session signed out. Done.");
process.exit(0);
