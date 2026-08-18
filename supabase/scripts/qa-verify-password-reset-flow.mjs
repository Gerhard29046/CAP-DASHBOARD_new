#!/usr/bin/env node
// Live, end-to-end verification of the web forgot-password/reset-password mechanism, WITHOUT
// depending on real email delivery (no browser tool / real inbox is available in this
// environment -- matches this project's established scripted-QA-in-lieu-of-browser pattern,
// see docs/ai-memory/agent-memory queen-bee/feedback_qa_scripted_verification.md).
//
// What this proves that a pure code-read cannot: the exact mechanism ForgotPassword.jsx /
// AuthCallback.jsx / ResetPassword.jsx rely on -- admin.auth.admin.generateLink({type:
// "recovery"}) is the SAME underlying primitive supabase.auth.resetPasswordForEmail() triggers
// server-side, just without sending the email -- actually redirects to a real recovery
// session, and that a real password change through that session actually takes effect
// (confirmed by signing in again with the NEW password afterward).
//
// What this does NOT prove: that Supabase's SMTP delivery actually lands a real email in a
// real inbox, or that this project's "Confirm email" setting is configured as expected. Those
// remain genuinely untested -- see docs/ai-memory/KNOWN_ISSUES.md.
//
// Usage: node scripts/qa-verify-password-reset-flow.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq)] = t.slice(eq + 1);
    }
  } catch {}
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

let pass = 0, fail = 0;
function record(ok, label) { console.log((ok ? "PASS" : "FAIL") + " - " + label); ok ? pass++ : fail++; }

const REDIRECT_TO = "https://capdashboard.gerhardvanwijk.workers.dev/reset-password";
const email = "qa-pwreset+" + Date.now() + "-" + Math.random().toString(36).slice(2, 6) + "@invalid.local";
const oldPassword = "Old-Pass-" + Math.random().toString(36).slice(2) + "!1A";
const newPassword = "New-Pass-" + Math.random().toString(36).slice(2) + "!2B";
let userId = null;

try {
  // 1. Create a real throwaway account with a known starting password.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password: oldPassword, email_confirm: true,
  });
  if (createErr) throw createErr;
  userId = created.user.id;
  record(true, "throwaway account created");

  // 2. Generate a real recovery link -- the exact server-side primitive
  //    resetPasswordForEmail() triggers, minus the email-send step (which cannot be observed
  //    in this environment).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: REDIRECT_TO },
  });
  record(!linkErr, "recovery link generated" + (linkErr ? `: ${linkErr.message}` : ""));
  if (linkErr) throw linkErr;

  // 3. Follow the verify link exactly as a real browser would (GET, do not auto-follow the
  //    redirect) -- this is what turns the one-time token into a real recovery session, the
  //    same step the emailed link performs when a real user clicks it.
  const verifyUrl = linkData.properties.action_link;
  const verifyResp = await fetch(verifyUrl, { redirect: "manual" });
  const location = verifyResp.headers.get("location");
  record(
    verifyResp.status >= 300 && verifyResp.status < 400 && !!location,
    `verify link redirects (status ${verifyResp.status})`
  );
  if (!location) throw new Error("No redirect Location header from the verify link.");
  record(location.startsWith(REDIRECT_TO), "redirect target matches ResetPassword.jsx's real URL (not localhost, not a different page)");

  // 4. Extract the recovery session's access_token from the redirect's hash fragment -- this
  //    is exactly what ResetPassword.jsx's supabase-js client does automatically via
  //    detectSessionInUrl; done manually here since there is no browser to run that JS.
  const hash = location.includes("#") ? location.split("#")[1] : "";
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");
  record(!!accessToken, "recovery access_token present in redirect fragment");
  record(type === "recovery", `redirect fragment type=recovery (got "${type}")`);
  if (!accessToken || !refreshToken) throw new Error("Recovery tokens missing from redirect fragment.");

  // 5. Establish that exact recovery session client-side (anon key, matching what a real
  //    browser tab does) and call updateUser({password}) -- the exact call
  //    ResetPassword.jsx's handleSubmit() makes via apiClient.auth.resetPassword().
  const recoveryClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: setSessionErr } = await recoveryClient.auth.setSession({
    access_token: accessToken, refresh_token: refreshToken,
  });
  record(!setSessionErr, "recovery session established client-side" + (setSessionErr ? `: ${setSessionErr.message}` : ""));

  const { error: updateErr } = await recoveryClient.auth.updateUser({ password: newPassword });
  record(!updateErr, "password updated via the recovery session" + (updateErr ? `: ${updateErr.message}` : ""));

  // 6. Prove the change actually took effect: old password must now be rejected, new password
  //    must now work -- signing in for real, not just trusting the updateUser() 2xx.
  const freshClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: oldPwErr } = await freshClient.auth.signInWithPassword({ email, password: oldPassword });
  record(!!oldPwErr, "old password is now REJECTED (confirms the change is real, not a no-op)");

  const { data: newPwData, error: newPwErr } = await freshClient.auth.signInWithPassword({ email, password: newPassword });
  record(!newPwErr && !!newPwData.session, "new password now signs in successfully");
} catch (error) {
  console.error("Unexpected failure:", error.message || error);
  fail++;
} finally {
  // Cleanup, independently re-verified rather than trusted.
  if (userId) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    const { data: listData } = await admin.auth.admin.listUsers();
    const stillExists = (listData?.users || []).some((u) => u.id === userId);
    record(!stillExists, "cleanup: throwaway account confirmed gone");
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
