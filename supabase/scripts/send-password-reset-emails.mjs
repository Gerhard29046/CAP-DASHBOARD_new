#!/usr/bin/env node
// Password-reset/login-migration delivery script for the Firebase -> Supabase migration.
// Closes the gap tracked in docs/ai-memory/KNOWN_ISSUES.md: migrate-firestore-to-postgres.mjs's
// "users" phase (Phase C) creates real Supabase Auth accounts, but Firebase password hashes
// cannot be imported through the standard admin.createUser API -- migrated users get an
// account with no usable password. This script gives them a supported way in: it triggers
// Supabase's real "forgot password" email flow (the exact same mechanism
// frontend/src/services/supabase/auth.js's requestPasswordReset() / ForgotPassword.jsx will
// use for self-service resets once the app is cut over) for every already-migrated user.
//
// SAFETY: defaults to a DRY RUN (reads which users would receive an email, sends NOTHING)
// unless run with --apply. Sends a REAL email to a REAL inbox when --apply is used -- treat
// this the same as any other real, user-facing production action (CLAUDE.md section 12).
//
// Deliberately uses the SAME public method the frontend already calls
// (supabase.auth.resetPasswordForEmail via the anon-key client, NOT
// auth.admin.generateLink()) so the resulting email/link matches exactly what a real
// self-service "forgot password" request would produce post-cutover -- no separate code
// path to keep in sync.
//
// Usage:
//   node scripts/send-password-reset-emails.mjs                          # dry run, all migrated users
//   node scripts/send-password-reset-emails.mjs --apply                  # sends real emails to all migrated users
//   node scripts/send-password-reset-emails.mjs --apply --email=a@b.com  # scope to one user
//   node scripts/send-password-reset-emails.mjs --redirect-to=https://example.com/reset-password

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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

// Default production frontend origin (see docs/ai-memory/PROJECT_STATE.md's 2026-07-23
// deploy entry). Override with --redirect-to for local/staging testing -- the redirect
// target does not need to be "live" on Supabase's data layer yet, only reachable, since
// this page (frontend/src/pages/ResetPassword.jsx, fixed 2026-08-06 to recognize Supabase's
// session-based recovery flow) is a public route regardless of VITE_AUTH_BACKEND.
const DEFAULT_REDIRECT_TO = "https://capdashboard.gerhardvanwijk.workers.dev/reset-password";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY_EMAIL = args.find((a) => a.startsWith("--email="))?.split("=")[1] ?? null;
const REDIRECT_TO = args.find((a) => a.startsWith("--redirect-to="))?.split("=")[1] ?? DEFAULT_REDIRECT_TO;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Check supabase/.env.");
  process.exit(1);
}

// Two separate Supabase clients, deliberately:
//  - service-role client: read-only here, used ONLY to list which users need an email
//    (public.users where legacy_firebase_uid is not null -- i.e. every user the "users"
//    migration phase created). Never used to send the email itself.
//  - anon-key client: used to actually call resetPasswordForEmail(), matching exactly how
//    an unauthenticated browser calls it via ForgotPassword.jsx -- this is a public,
//    rate-limited, non-privileged operation by design, not something that needs (or should
//    use) the service-role key.
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function requireAnonClient() {
  const anonKey = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.error(
      "Missing SUPABASE_ANON_KEY in supabase/.env -- needed to call resetPasswordForEmail() " +
      "the same way the public ForgotPassword.jsx page does. Add it (the publishable/anon " +
      "key from frontend/.env is safe to reuse here) before running --apply.",
    );
    process.exit(1);
  }
  return createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } });
}

async function findMigratedUsers() {
  let query = adminClient
    .from("users")
    .select("id, email, full_name, role, legacy_firebase_uid")
    .not("legacy_firebase_uid", "is", null);
  if (ONLY_EMAIL) query = query.eq("email", ONLY_EMAIL);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (sends real emails)" : "DRY RUN (no emails sent)"}`);
  console.log(`Redirect target: ${REDIRECT_TO}`);
  if (ONLY_EMAIL) console.log(`Scoped to: ${ONLY_EMAIL}`);

  const users = await findMigratedUsers();
  console.log(`\nMigrated users found: ${users.length}`);
  if (users.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  for (const u of users) console.log(`  - ${u.email} (role=${u.role}, legacy_firebase_uid=${u.legacy_firebase_uid})`);

  if (!APPLY) {
    console.log("\n(dry run - no emails sent)");
    return;
  }

  const anonClient = requireAnonClient();
  let sent = 0, failed = 0;
  for (const u of users) {
    if (!u.email) { console.log(`  SKIP (no email on record): ${u.id}`); failed++; continue; }
    const { error } = await anonClient.auth.resetPasswordForEmail(u.email, { redirectTo: REDIRECT_TO });
    if (error) {
      console.error(`  ERROR sending to ${u.email}:`, error.message);
      failed++;
      continue;
    }
    console.log(`  sent: ${u.email}`);
    sent++;
  }
  console.log(`\nDone. Sent ${sent}, failed ${failed}.`);
  console.log(
    "Note: Supabase's resetPasswordForEmail() always resolves success-shaped even for an\n" +
    "unknown email (anti-enumeration behavior, same reason ForgotPassword.jsx always shows\n" +
    "a generic success message) -- a 'sent' count here means the request was accepted, not\n" +
    "necessarily that the address exists or the email was delivered. Confirm actual receipt\n" +
    "manually for any address this matters for.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
