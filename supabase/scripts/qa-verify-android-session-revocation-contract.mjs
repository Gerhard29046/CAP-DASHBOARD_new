#!/usr/bin/env node
// Live QA for the session-termination half of the E1 reliability remediation in
// mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/SupabaseAuth.kt.
//
// Why this exists separately from qa-verify-android-token-refresh-contract.mjs: that script
// proves the HAPPY path (a valid refresh token mints a new access token) and the obviously-bad
// path (a garbage refresh token is rejected). Neither proves the thing SupabaseAuthRepository's
// terminal "session expired" branch actually depends on -- that a refresh token which was VALID
// a moment ago stops working once the session is really over. Without that, "logout revokes the
// session server-side" and "an expired session produces a clean terminal signal rather than an
// infinite retry" are assumptions, not findings.
//
// Scope: the HTTP contract only. This does not compile or run the Kotlin code.
//
// Usage (from supabase/): node scripts/qa-verify-android-session-revocation-contract.mjs

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
  } catch { /* fall through */ }
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
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? " -- " + detail : ""}`);
}
function note(text) {
  console.log(`  NOTE  ${text}`);
}

// Header sets below mirror SupabaseAuth.kt's postJson()/httpGet() and SupabaseData.kt's request().
async function authPost(path, body, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

async function restGet(path, token) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "GET",
    headers: {
      apikey: ANON_KEY,
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

async function login(email, password) {
  return authPost("/auth/v1/token?grant_type=password", { email, password }, null);
}

async function createTechnician(tag, permissions) {
  const email = `qa-android-revoke+${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}) failed: ${error.message}`);
  await new Promise((r) => setTimeout(r, 600)); // let the on_auth_user_created trigger insert the profile row
  const { error: activateErr } = await admin
    .from("users")
    .update({ is_active: true, role: "technician", effective_permissions: permissions })
    .eq("id", data.user.id);
  if (activateErr) throw new Error(`activate(${tag}) failed: ${activateErr.message}`);
  return { email, password, uid: data.user.id };
}

async function main() {
  const created = [];

  try {
    // ---- Subject A: the user whose session gets explicitly logged out -----------------------
    const userA = await createTechnician("logout", ["clients.view", "machines.view"]);
    created.push(userA);

    // ---- 1. Baseline: a live session works --------------------------------------------------
    const sessionA = await login(userA.email, userA.password);
    record("Valid login returns 200 with a usable session", sessionA.status === 200 && !!sessionA.json?.access_token, `status ${sessionA.status}`);
    const accessA = sessionA.json?.access_token;
    const refreshA = sessionA.json?.refresh_token;

    const preLogoutRead = await restGet(`/rest/v1/clients?select=id&limit=1`, accessA);
    record("Live access token authorizes an RLS-gated PostgREST read before logout", preLogoutRead.status === 200, `status ${preLogoutRead.status}`);

    const preLogoutRefresh = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshA }, null);
    record("Refresh token is valid before logout (baseline for the revocation test below)", preLogoutRefresh.status === 200, `status ${preLogoutRefresh.status}`);
    const refreshA2 = preLogoutRefresh.json?.refresh_token;
    const accessA2 = preLogoutRefresh.json?.access_token;

    // ---- 2. Logout must actually revoke server-side, not just return 204 --------------------
    // SupabaseAuth.logout() posts to /auth/v1/logout with the access token, then clears local
    // state unconditionally. If the server did NOT revoke, a leaked refresh token would remain
    // usable after the user "signed out" -- so 204 alone is not evidence of anything.
    const logout = await authPost("/auth/v1/logout", {}, accessA2);
    record("POST /auth/v1/logout (Bearer access token) is accepted", logout.status === 204 || logout.status === 200, `status ${logout.status}`);

    await new Promise((r) => setTimeout(r, 750)); // allow revocation to settle before probing

    const postLogoutRefresh = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshA2 }, null);
    record(
      "SERVER-SIDE REVOCATION: the refresh token that was valid seconds ago is rejected (4xx) after logout",
      postLogoutRefresh.status >= 400 && postLogoutRefresh.status < 500,
      `status ${postLogoutRefresh.status}, body: ${postLogoutRefresh.text.slice(0, 140)}`
    );
    record(
      "Post-logout refresh failure is a clean JSON error body, not an empty/HTML/5xx response (Kotlin parses this path)",
      postLogoutRefresh.json !== null && postLogoutRefresh.status < 500,
      `parsed=${postLogoutRefresh.json !== null}`
    );
    record(
      "Post-logout refresh is NOT a 200 (a 200 here would mean 'sign out' left a usable session behind)",
      postLogoutRefresh.status !== 200,
      `status ${postLogoutRefresh.status}`
    );

    // The ORIGINAL (pre-rotation) refresh token must also be dead after logout -- otherwise the
    // reuse grace window would outlive the sign-out.
    const postLogoutOldRefresh = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshA }, null);
    record(
      "The earlier (already-rotated) refresh token is ALSO dead after logout -- the reuse grace window does not survive sign-out",
      postLogoutOldRefresh.status >= 400 && postLogoutOldRefresh.status < 500,
      `status ${postLogoutOldRefresh.status}`
    );

    // The access token itself is a stateless JWT: whether PostgREST rejects it after logout
    // depends on the project's session/JWT settings, so record the OBSERVED behavior rather
    // than asserting one outcome. What matters for the Kotlin fix is only that the refresh
    // token is dead (asserted above) -- the access token expires on its own within the TTL.
    const postLogoutRead = await restGet(`/rest/v1/clients?select=id&limit=1`, accessA2);
    note(
      `PostgREST read with the post-logout ACCESS token: status ${postLogoutRead.status}. ` +
      `Supabase access tokens are stateless JWTs, so this may still be 200 until 'exp'. Not a defect, ` +
      `and not something SupabaseAuth.kt relies on -- logout() clears the in-memory token immediately.`
    );

    // ---- 3. A deleted account's session is terminally unusable ------------------------------
    // This is the closest available real analogue to "the refresh token is definitively gone"
    // (a genuinely time-expired token cannot be produced here: the TTL is 3600s and the project
    // JWT secret needed to forge one is not, and must not be, available to this script).
    const userB = await createTechnician("deleted", ["clients.view"]);
    created.push(userB);
    const sessionB = await login(userB.email, userB.password);
    record("Second throwaway user can log in (baseline before deletion)", sessionB.status === 200, `status ${sessionB.status}`);
    const refreshB = sessionB.json?.refresh_token;

    const { error: delBErr } = await admin.auth.admin.deleteUser(userB.uid);
    record("Second throwaway user deleted (simulates a revoked/destroyed account)", !delBErr, delBErr ? delBErr.message : "ok");
    // userB stays in `created` even though it was just deleted: the finally block re-deleting an
    // already-gone user is harmless, whereas removing it from the list is not. An earlier version
    // did `created.splice(created.indexOf(userB), 1)` here -- indexOf returns -1 for a user that
    // was never pushed, and splice(-1, 1) removes the LAST element, silently dropping a DIFFERENT
    // user from cleanup and leaking a real account. Never index-splice a cleanup registry.
    await new Promise((r) => setTimeout(r, 750));

    const deletedUserRefresh = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshB }, null);
    record(
      "TERMINAL SIGNAL: a deleted account's refresh token is rejected with a 4xx, not a 5xx and not a hang",
      deletedUserRefresh.status >= 400 && deletedUserRefresh.status < 500,
      `status ${deletedUserRefresh.status}, body: ${deletedUserRefresh.text.slice(0, 140)}`
    );
    record(
      "Terminal-failure body is parseable JSON with an error message (SupabaseAuth.readResponse() maps this to 'sign in again')",
      deletedUserRefresh.json !== null && !!(deletedUserRefresh.json?.error_description || deletedUserRefresh.json?.msg || deletedUserRefresh.json?.error),
      `msg: ${JSON.stringify(deletedUserRefresh.json?.error_description || deletedUserRefresh.json?.msg || deletedUserRefresh.json?.error)}`
    );

    // ---- 4. Retry-forever safety: a dead refresh token is deterministically dead ------------
    // SupabaseData.withAuth() only ever retries ONCE, and only after a refresh SUCCEEDS. If a
    // rejected refresh token were flaky (sometimes 200), a client could livelock re-trying.
    // Confirm the rejection is stable across repeated attempts.
    const repeated = [];
    for (let i = 0; i < 4; i += 1) {
      const attempt = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshB }, null);
      repeated.push(attempt.status);
    }
    record(
      "A dead refresh token is rejected DETERMINISTICALLY on every repeat (no flapping that could livelock a retry loop)",
      repeated.every((s) => s >= 400 && s < 500),
      `statuses [${repeated.join(", ")}]`
    );

    // ---- 5. Cross-user isolation on public.users (the profile read SupabaseAuth does) -------
    const userC = await createTechnician("peer", ["clients.view"]);
    created.push(userC);
    const sessionC = await login(userC.email, userC.password);
    const accessC = sessionC.json?.access_token;

    const ownProfile = await restGet(`/rest/v1/users?id=eq.${userC.uid}&select=id,email,role,effective_permissions`, accessC);
    record(
      "Non-admin user CAN read their own public.users row (what SupabaseAuth.loadProfile does)",
      ownProfile.status === 200 && Array.isArray(ownProfile.json) && ownProfile.json[0]?.id === userC.uid,
      `status ${ownProfile.status}, rows=${Array.isArray(ownProfile.json) ? ownProfile.json.length : "n/a"}`
    );

    const peerProfile = await restGet(`/rest/v1/users?id=eq.${userA.uid}&select=id,email,role,effective_permissions`, accessC);
    record(
      "RLS ISOLATION: a non-admin technician reading ANOTHER user's public.users row gets 0 rows (not that user's data)",
      peerProfile.status === 200 && Array.isArray(peerProfile.json) && peerProfile.json.length === 0,
      `status ${peerProfile.status}, rows=${Array.isArray(peerProfile.json) ? peerProfile.json.length : "n/a"}, body: ${peerProfile.text.slice(0, 100)}`
    );

    const allProfiles = await restGet(`/rest/v1/users?select=id,email`, accessC);
    const visible = Array.isArray(allProfiles.json) ? allProfiles.json.length : -1;
    record(
      "RLS ISOLATION: an unfiltered public.users listing returns only the caller's own row for a non-admin",
      allProfiles.status === 200 && visible === 1 && allProfiles.json[0]?.id === userC.uid,
      `status ${allProfiles.status}, visible rows=${visible}`
    );
  } finally {
    console.log("\nCleaning up...");
    const attempted = [];
    for (const user of created) {
      const { error } = await admin.auth.admin.deleteUser(user.uid);
      attempted.push({ uid: user.uid, email: user.email, error: error ? error.message : null });
    }
    for (const a of attempted) {
      // "not found" is an acceptable outcome: one subject is deliberately deleted mid-test, and
      // it is still registered for cleanup on purpose (see the note above). The authoritative
      // answer is the independent re-verification below, not this per-call result.
      const alreadyGone = !!a.error && /not.?found/i.test(a.error);
      record(
        `deleteUser() left no account behind for ${a.email.split("@")[0]}`,
        !a.error || alreadyGone,
        a.error ? (alreadyGone ? `already deleted earlier in the run (${a.error})` : a.error) : "ok"
      );
    }

    // Independent re-verification: fail CLOSED. Any inability to verify counts as NOT clean.
    const { data: usersAfter, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const leftoverAuth = listErr
      ? ["<listUsers failed - cannot confirm>"]
      : usersAfter.users.filter((u) => (u.email || "").startsWith("qa-android-revoke+")).map((u) => u.email);
    const { data: leftoverRows, error: rowErr } = await admin.from("users").select("id,email").like("email", "qa-android-revoke+%");
    record(
      "Full cleanup: every qa-android-revoke+ auth user and profile row is gone (re-verified independently of deleteUser's own return value)",
      !listErr && !rowErr && leftoverAuth.length === 0 && (leftoverRows || []).length === 0,
      `listUsersError=${listErr ? listErr.message : "none"}, leftoverAuthUsers=${leftoverAuth.length}, leftoverProfileRows=${(leftoverRows || []).length}`
    );
    note("This script creates no business-table rows (clients/machines/knowledge_*), so there is no fixture data to clean up beyond the throwaway accounts.");
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Script failed:", e.message);
  process.exit(1);
});
