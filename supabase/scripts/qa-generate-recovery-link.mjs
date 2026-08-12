#!/usr/bin/env node
// One-off QA helper (2026-08-11): generates a real Supabase Auth recovery link for the
// real migrated admin account WITHOUT sending an email, using the admin generateLink() API
// (service-role only). Solves the "user can't check admin@connoisseurauto.co.za's inbox on
// this machine" problem -- the link is handed back directly instead of delivered by email.
// Same underlying recovery mechanism as resetPasswordForEmail()/ForgotPassword.jsx, just
// without the email-delivery step.
//
// Usage: node scripts/qa-generate-recovery-link.mjs <email> [redirect-to]

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
    // fall through
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

const email = process.argv[2];
const redirectTo = process.argv[3] || "http://localhost:5173/reset-password";
if (!email) {
  console.error("Usage: node scripts/qa-generate-recovery-link.mjs <email> [redirect-to]");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
  options: { redirectTo },
});

if (error) {
  console.error("generateLink failed:", error.message);
  process.exit(1);
}

console.log("Recovery link generated (no email sent). Open this URL in a browser:\n");
console.log(data.properties.action_link);
console.log("\nThis link is single-use and time-limited (Supabase default ~1 hour).");
process.exit(0);
