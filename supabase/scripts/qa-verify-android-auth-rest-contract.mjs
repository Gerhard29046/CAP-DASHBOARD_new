#!/usr/bin/env node
// Live QA for Phase C (Android->Supabase auth migration) -- exercises the EXACT REST
// endpoints/request shapes mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/
// SupabaseAuth.kt's SupabaseAuthRepository calls (password grant, refresh grant, logout,
// PostgREST profile read), against the real production Supabase project, using a throwaway
// test user. This validates the server-side contract the Kotlin code depends on -- it does
// NOT compile or run the Kotlin code itself (no Android build is possible in this
// environment, see docs/ai-memory/KNOWN_ISSUES.md).
//
// Usage: node scripts/qa-verify-android-auth-rest-contract.mjs

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

// --- Raw fetch helpers mirroring SupabaseAuthRepository.kt's postJson/httpGet exactly ------
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

async function main() {
  const email = `qa-android-auth+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  let uid = null;

  try {
    console.log("Creating throwaway technician test user...");
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
    uid = created.user.id;
    await new Promise((r) => setTimeout(r, 500)); // let the on_auth_user_created trigger insert the profile row
    const { error: activateErr } = await admin.from("users").update({ is_active: true, role: "technician", effective_permissions: ["clients.view", "machines.view"] }).eq("id", uid);
    if (activateErr) throw new Error(`activate failed: ${activateErr.message}`);

    // --- 1. Valid login (POST /auth/v1/token?grant_type=password) -------------------------
    const login = await authPost("/auth/v1/token?grant_type=password", { email, password }, null);
    record("Valid login returns 200 with access_token/refresh_token/user", login.status === 200 && !!login.json?.access_token && !!login.json?.refresh_token && login.json?.user?.id === uid, `status ${login.status}`);
    const accessToken = login.json?.access_token;
    const refreshToken = login.json?.refresh_token;

    // --- 2. Invalid password ----------------------------------------------------------------
    const badPassword = await authPost("/auth/v1/token?grant_type=password", { email, password: "definitely-wrong-password" }, null);
    const badPasswordMsg = badPassword.json?.error_description || badPassword.json?.msg || "";
    record(
      "Invalid password rejected with a message matching SupabaseAuth.kt's 'Incorrect email address or password.' mapping",
      badPassword.status === 400 && /invalid login credentials/i.test(badPasswordMsg),
      `status ${badPassword.status}, message: "${badPasswordMsg}"`
    );

    // --- 3. Nonexistent account --------------------------------------------------------------
    const nonexistent = await authPost("/auth/v1/token?grant_type=password", { email: `qa-does-not-exist+${Date.now()}@invalid.local`, password: "whatever123" }, null);
    const nonexistentMsg = nonexistent.json?.error_description || nonexistent.json?.msg || "";
    record(
      "Nonexistent account gets the SAME generic error as wrong password (Supabase deliberately doesn't distinguish, for security) -- confirmed, not assumed",
      nonexistent.status === 400 && /invalid login credentials/i.test(nonexistentMsg),
      `status ${nonexistent.status}, message: "${nonexistentMsg}"`
    );

    // --- 4. Session restoration (POST /auth/v1/token?grant_type=refresh_token) -------------
    const restored = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshToken }, null);
    record("Session restore via refresh_token returns a fresh access_token", restored.status === 200 && !!restored.json?.access_token, `status ${restored.status}`);
    const restoredAccessToken = restored.json?.access_token;
    const restoredRefreshToken = restored.json?.refresh_token;

    // --- 5. Authenticated profile load (GET /rest/v1/users, RLS-gated by the access token) --
    const profile = await restGet(`/rest/v1/users?id=eq.${uid}&select=id,email,full_name,role,is_active,effective_permissions`, restoredAccessToken);
    const profileRow = Array.isArray(profile.json) ? profile.json[0] : null;
    record("Authenticated profile load returns exactly this user's own row", profile.status === 200 && profileRow?.id === uid, `status ${profile.status}, rows: ${Array.isArray(profile.json) ? profile.json.length : "n/a"}`);
    record("Role/permission fields present and correctly shaped (role='technician', effective_permissions is an array)", profileRow?.role === "technician" && Array.isArray(profileRow?.effective_permissions) && profileRow.effective_permissions.includes("clients.view"), JSON.stringify({ role: profileRow?.role, effective_permissions: profileRow?.effective_permissions }));

    // --- 6. Unauthenticated access blocked ---------------------------------------------------
    const noAuth = await restGet(`/rest/v1/users?id=eq.${uid}&select=id,email`, null);
    const noAuthRows = Array.isArray(noAuth.json) ? noAuth.json.length : null;
    // Either outcome is a correct "blocked": PostgREST rejects outright with 401 when no
    // Authorization header is present at all (observed live behavior -- stricter than RLS
    // alone), or RLS filters to 0 rows if a request somehow reaches that stage. Either way,
    // the real profile is never returned. Moot for SupabaseAuthRepository.kt's actual code
    // path anyway: loadProfile() throws SupabaseAuthException("Not authenticated.") client-
    // side before ever attempting this call without a token.
    record("Unauthenticated request (no bearer token) never returns the real profile (401 rejected outright, or 0 rows)", noAuth.status === 401 || noAuthRows === 0, `status ${noAuth.status}, rows: ${noAuthRows}`);

    const garbageToken = await restGet(`/rest/v1/users?id=eq.${uid}&select=id,email`, "garbage.not.a.real.token");
    record("Request with a garbage/invalid bearer token is rejected (401), not silently treated as anon", garbageToken.status === 401, `status ${garbageToken.status}`);

    // --- 7. Logout (POST /auth/v1/logout) revokes the refresh token ------------------------
    const logout = await authPost("/auth/v1/logout", {}, restoredAccessToken);
    record("Logout call succeeds (204/200)", logout.status === 204 || logout.status === 200, `status ${logout.status}`);

    const refreshAfterLogout = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: restoredRefreshToken }, null);
    record("Refresh token is revoked after logout -- cannot mint a new session with it", refreshAfterLogout.status !== 200, `status ${refreshAfterLogout.status}`);

    // --- 8. Malformed/error-path request (network/error-handling contract, not a real
    //        network-loss simulation -- that part is only inspectable via Kotlin code review,
    //        since this Node.js harness can't simulate an Android device losing connectivity) -
    const malformed = await authPost("/auth/v1/token?grant_type=password", { email: "not-even-an-email" }, null); // missing password field entirely
    record("Malformed request (missing password) returns a clean 4xx JSON error, not a crash/empty body", malformed.status >= 400 && malformed.status < 500 && malformed.json !== null, `status ${malformed.status}, body: ${malformed.text.slice(0, 100)}`);
  } finally {
    console.log("\nCleaning up...");
    if (uid) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      const { data: stillThere } = await admin.auth.admin.getUserById(uid).catch(() => ({ data: null }));
      const { data: profileRow } = await admin.from("users").select("id").eq("id", uid).maybeSingle();
      record("Full cleanup: throwaway test user and profile row both gone", !stillThere?.user && !profileRow, `authUserExists=${!!stillThere?.user}, profileRowExists=${!!profileRow}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Script failed:", e.message);
  process.exit(1);
});
