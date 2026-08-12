#!/usr/bin/env node
// Temporary QA helper (2026-08-07 Phase 3 manual click-through, NOT a permanent tool).
// Creates ONE throwaway Supabase Auth user with admin-equivalent access (role='admin' on
// its public.users row, same bypass path proven by smoke-test.mjs), for use logging into
// the local dev frontend (VITE_AUTH_BACKEND=supabase, http://localhost:5173) to manually
// click through every page as an admin, without needing the real migrated user's
// (still-unset) password. Never touches any real business data or the real migrated user.
//
// Usage:
//   node scripts/qa-test-user.mjs create   -> creates the user, prints email/password
//   node scripts/qa-test-user.mjs delete <uid>  -> deletes the auth user (row cascades)
//   node scripts/qa-test-user.mjs verify-gone <uid> -> confirms the user no longer exists

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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in supabase/.env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cmd = process.argv[2];

if (cmd === "create") {
  const email = `phase3-qa-test+${Date.now()}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    console.error("createUser failed:", createErr.message);
    process.exit(1);
  }
  const uid = created.user.id;

  // Wait briefly for the on_auth_user_created trigger to insert the public.users row.
  await new Promise((r) => setTimeout(r, 500));

  const { error: updateErr } = await admin
    .from("users")
    .update({ role: "admin", is_active: true })
    .eq("id", uid);
  if (updateErr) {
    console.error("profile update failed:", updateErr.message);
    process.exit(1);
  }

  const { data: profile, error: readErr } = await admin
    .from("users")
    .select("id, email, role, is_active, effective_permissions")
    .eq("id", uid)
    .single();
  if (readErr) {
    console.error("profile verify-read failed:", readErr.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ uid, email, password, profile }, null, 2));
} else if (cmd === "delete") {
  const uid = process.argv[3];
  if (!uid) {
    console.error("Usage: node scripts/qa-test-user.mjs delete <uid>");
    process.exit(1);
  }
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.error("deleteUser failed:", error.message);
    process.exit(1);
  }
  console.log(JSON.stringify({ deleted: uid }));
} else if (cmd === "verify-gone") {
  const uid = process.argv[3];
  if (!uid) {
    console.error("Usage: node scripts/qa-test-user.mjs verify-gone <uid>");
    process.exit(1);
  }
  const { data: authUser } = await admin.auth.admin.getUserById(uid);
  const { data: profileRow } = await admin.from("users").select("id").eq("id", uid).maybeSingle();
  console.log(
    JSON.stringify(
      {
        authUserStillExists: !!authUser?.user,
        profileRowStillExists: !!profileRow,
      },
      null,
      2
    )
  );
} else {
  console.error("Usage: node scripts/qa-test-user.mjs <create|delete|verify-gone> [uid]");
  process.exit(1);
}
