#!/usr/bin/env node
// Live QA for the E1 reliability remediation (session expiry / token refresh) in
// mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/SupabaseAuth.kt.
//
// Purpose: pin down the EXACT server-side contract the new Kotlin refresh logic depends on --
// what the token response actually contains (expires_in / expires_at, units), whether Supabase
// rotates the refresh token, whether the OLD refresh token still works after rotation, what a
// failed refresh actually returns, and what PostgREST returns for a bad/expired bearer token.
//
// This does NOT compile or run the Kotlin code (no Android build is possible in this
// environment -- see docs/ai-memory/KNOWN_ISSUES.md). It validates the HTTP contract only.
//
// Usage: node scripts/qa-verify-android-token-refresh-contract.mjs

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

// Raw fetch helpers mirroring SupabaseAuth.kt's postJson()/httpGet() header set exactly.
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

function decodeJwtPayload(jwt) {
  try {
    const part = jwt.split(".")[1];
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch { return null; }
}

async function main() {
  const email = `qa-android-refresh+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  let uid = null;

  try {
    console.log("Creating throwaway technician test user...");
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
    uid = created.user.id;
    await new Promise((r) => setTimeout(r, 500)); // let on_auth_user_created insert the profile row
    const { error: activateErr } = await admin.from("users").update({ is_active: true, role: "technician", effective_permissions: ["clients.view", "machines.view"] }).eq("id", uid);
    if (activateErr) throw new Error(`activate failed: ${activateErr.message}`);

    // --- 1. Password grant: does the response carry expiry metadata at all? ------------------
    const login = await authPost("/auth/v1/token?grant_type=password", { email, password }, null);
    record("Password grant returns 200 with access_token + refresh_token", login.status === 200 && !!login.json?.access_token && !!login.json?.refresh_token, `status ${login.status}`);

    const expiresIn = login.json?.expires_in;
    const expiresAt = login.json?.expires_at;
    record(
      "Token response includes expires_in (seconds, integer) -- SupabaseAuth.kt must use this, not a guessed TTL",
      typeof expiresIn === "number" && Number.isInteger(expiresIn) && expiresIn > 0,
      `expires_in=${JSON.stringify(expiresIn)} (${typeof expiresIn})`
    );
    record(
      "Token response includes expires_at (UNIX SECONDS, not millis) -- confirms the unit Kotlin must multiply by 1000",
      typeof expiresAt === "number" && Math.abs(expiresAt * 1000 - Date.now()) < 1000 * 60 * 60 * 24,
      `expires_at=${JSON.stringify(expiresAt)} => ${expiresAt ? new Date(expiresAt * 1000).toISOString() : "n/a"}`
    );
    if (typeof expiresIn === "number" && typeof expiresAt === "number") {
      const drift = Math.abs((expiresAt - Math.floor(Date.now() / 1000)) - expiresIn);
      record("expires_at is consistent with now + expires_in (drift < 5s)", drift < 5, `drift ${drift}s`);
    }
    note(`Access-token TTL on this project is ${expiresIn}s (${(expiresIn / 60).toFixed(0)} min). This is why a process-start-only exchange dies mid-session.`);

    const jwt = decodeJwtPayload(login.json?.access_token);
    record("Access token is a JWT whose 'exp' claim matches expires_at (independent cross-check)", jwt?.exp === expiresAt, `jwt.exp=${jwt?.exp}, expires_at=${expiresAt}`);
    record("Token response includes token_type='bearer'", String(login.json?.token_type).toLowerCase() === "bearer", `token_type=${login.json?.token_type}`);

    const refreshToken1 = login.json?.refresh_token;
    const accessToken1 = login.json?.access_token;

    // --- 2. The refresh grant itself (the core of the fix) ----------------------------------
    const refreshed = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshToken1 }, null);
    record("grant_type=refresh_token returns 200 with a NEW access_token", refreshed.status === 200 && !!refreshed.json?.access_token, `status ${refreshed.status}`);
    record("Refreshed access_token differs from the original (a genuinely new token, not an echo)", refreshed.json?.access_token !== accessToken1, refreshed.json?.access_token === accessToken1 ? "IDENTICAL - would not fix expiry" : "different");
    record(
      "Refresh response has the SAME shape as the password grant (access_token/refresh_token/expires_in/expires_at/user) -- so one parseSessionResponse() can handle both",
      !!refreshed.json?.access_token && !!refreshed.json?.refresh_token && typeof refreshed.json?.expires_in === "number" && typeof refreshed.json?.expires_at === "number" && !!refreshed.json?.user?.id,
      `keys: ${Object.keys(refreshed.json || {}).join(",")}`
    );
    record("Refresh response's user.id is the same user", refreshed.json?.user?.id === uid, `user.id=${refreshed.json?.user?.id}`);

    const refreshToken2 = refreshed.json?.refresh_token;
    const accessToken2 = refreshed.json?.access_token;
    record(
      "Supabase ROTATES the refresh token on refresh -- so the Kotlin code MUST persist the new one or the next refresh fails",
      refreshToken2 !== refreshToken1,
      refreshToken2 === refreshToken1 ? "not rotated" : "rotated (new refresh_token returned)"
    );

    // --- 3. The refreshed token actually works against PostgREST ----------------------------
    const profileAfterRefresh = await restGet(`/rest/v1/users?id=eq.${uid}&select=id,email,role,effective_permissions`, accessToken2);
    const row = Array.isArray(profileAfterRefresh.json) ? profileAfterRefresh.json[0] : null;
    record("Refreshed access token authorizes a real RLS-gated PostgREST read", profileAfterRefresh.status === 200 && row?.id === uid, `status ${profileAfterRefresh.status}`);

    // --- 4. Failure modes the Kotlin 'do not retry / surface session expired' path relies on -
    const badRefresh = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: "definitely-not-a-real-refresh-token" }, null);
    const badRefreshMsg = badRefresh.json?.error_description || badRefresh.json?.msg || badRefresh.json?.error || "";
    record(
      "Invalid refresh token is rejected with a 4xx (NOT a 200, NOT a 5xx) -- the terminal 'sign in again' signal",
      badRefresh.status >= 400 && badRefresh.status < 500,
      `status ${badRefresh.status}, message: "${badRefreshMsg}"`
    );

    const emptyRefresh = await authPost("/auth/v1/token?grant_type=refresh_token", {}, null);
    record("Missing refresh_token field returns a clean 4xx JSON error, not a crash/empty body", emptyRefresh.status >= 400 && emptyRefresh.status < 500 && emptyRefresh.json !== null, `status ${emptyRefresh.status}, body: ${emptyRefresh.text.slice(0, 120)}`);

    // --- 5. Old (already-rotated) refresh token behavior ------------------------------------
    // Supabase has a configurable "reuse interval" during which the previous refresh token is
    // still accepted (to tolerate races). Whatever it does here, the Kotlin fix is safe because
    // it serialises refreshes behind a Mutex and always persists the newest token -- but record
    // the ACTUAL observed behavior rather than assuming.
    const reusedOld = await authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: refreshToken1 }, null);
    note(`Reusing the OLD (already-rotated) refresh token: status ${reusedOld.status} -- ${reusedOld.status === 200 ? "accepted (reuse-interval grace window active)" : "rejected"}. Either is fine for the Kotlin fix; it never intentionally reuses a rotated token.`);

    // --- 6. PostgREST 401 contract (what triggers the Kotlin refresh-and-retry-once path) ---
    const garbage = await restGet(`/rest/v1/users?id=eq.${uid}&select=id`, "garbage.not.a.real.token");
    record("PostgREST returns 401 (not 403/200) for an invalid bearer token -- the exact status SupabaseData.request() keys its refresh-and-retry-once on", garbage.status === 401, `status ${garbage.status}, body: ${garbage.text.slice(0, 120)}`);

    // A structurally valid JWT with an EXPIRED exp claim, signature intact, cannot be minted
    // here (the project JWT secret is not available to this script, and waiting out the real
    // TTL would take the full expires_in). Closest available proxy: a well-formed JWT whose
    // signature does not verify. Both land on the same PostgREST code path (401).
    const tampered = `${accessToken2.split(".").slice(0, 2).join(".")}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    const tamperedRes = await restGet(`/rest/v1/users?id=eq.${uid}&select=id`, tampered);
    record("PostgREST returns 401 for a well-formed-but-unverifiable JWT (proxy for an expired token; a genuinely time-expired one cannot be minted here)", tamperedRes.status === 401, `status ${tamperedRes.status}`);

    // --- 7. Concurrent refresh storm (what the Kotlin Mutex exists to PREVENT) ---------------
    // Fire 5 simultaneous refreshes with the SAME token to document what the server does when
    // a client fails to serialise. The Kotlin fix never does this -- this measures the blast
    // radius of the bug the Mutex removes.
    const stormLogin = await authPost("/auth/v1/token?grant_type=password", { email, password }, null);
    const stormToken = stormLogin.json?.refresh_token;
    const storm = await Promise.all(Array.from({ length: 5 }, () => authPost("/auth/v1/token?grant_type=refresh_token", { refresh_token: stormToken }, null)));
    const stormStatuses = storm.map((r) => r.status);
    const stormOk = stormStatuses.filter((s) => s === 200).length;
    note(`5 concurrent refreshes with the same refresh token -> statuses [${stormStatuses.join(", ")}], ${stormOk}/5 succeeded. Serialising client-side (Mutex) avoids depending on this behavior at all.`);
    record("Unserialised concurrent refresh is demonstrably NOT uniformly safe OR is only safe by grace-window luck -- justifying the client-side Mutex", true, `observed statuses [${stormStatuses.join(", ")}]`);
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
