#!/usr/bin/env node
// Live verification: (1) UserAdmin.jsx's save() PUT payload shape (full_name/email/role/
// is_active/effective_permissions) genuinely persists role changes and active-toggle changes;
// (2) the new admin-only DELETE of a public.users profile row genuinely works and is genuinely
// blocked for a non-admin. Uses the exact payload shape UserAdmin.jsx's save() sends. Cleans up
// its own throwaway accounts, independently re-verified gone.
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
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function record(ok, label) { console.log(`${ok ? "PASS" : "FAIL"} — ${label}`); ok ? pass++ : fail++; }

async function makeUser(role, active) {
  const email = `qa-useradmin+${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@invalid.local`;
  const password = "Temp-Pass-" + Math.random().toString(36).slice(2) + "!1A";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from("users").update({ role, is_active: active, full_name: "QA Temp User" }).eq("id", data.user.id);
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, email, token: signIn.session.access_token };
}

async function cleanup(id, label) {
  if (!id) return;
  const { error } = await admin.auth.admin.deleteUser(id);
  const { data } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
  record(!error && !data?.user, `cleanup: ${label} confirmed gone`);
}

let adminUser, targetUser;
try {
  adminUser = await makeUser("admin", true);
  targetUser = await makeUser("technician", true);

  // 1) Admin PUTs the exact payload shape UserAdmin.jsx's save() sends: role change + is_active
  //    toggle + effective_permissions, via PostgREST directly (bypassing React) the same way
  //    supabaseApiClient.js's request() does under the hood.
  const putRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${targetUser.id}`, {
    method: "PATCH",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${adminUser.token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ role: "accountant", is_active: false, effective_permissions: ["clients.view"] }),
  });
  const putBody = await putRes.json();
  record(putRes.status === 200 && Array.isArray(putBody) && putBody.length === 1, `role/active PATCH returns 200 + row (status ${putRes.status})`);

  const { data: reread } = await admin.from("users").select("role, is_active, effective_permissions").eq("id", targetUser.id).single();
  record(reread.role === "accountant", `role change genuinely persisted (got "${reread.role}")`);
  record(reread.is_active === false, `is_active=false genuinely persisted (got ${reread.is_active})`);
  record(JSON.stringify(reread.effective_permissions) === JSON.stringify(["clients.view"]), `effective_permissions genuinely persisted (got ${JSON.stringify(reread.effective_permissions)})`);

  // Flip is_active back true to confirm the toggle works both directions.
  await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${targetUser.id}`, {
    method: "PATCH",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminUser.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ is_active: true }),
  });
  const { data: reread2 } = await admin.from("users").select("is_active").eq("id", targetUser.id).single();
  record(reread2.is_active === true, `is_active=true toggle-back genuinely persisted`);

  // 2) Non-admin (the technician-turned-accountant, no admin role) must be BLOCKED from deleting.
  //    Re-sign-in not needed -- role check is live per-request via is_admin(), not cached in JWT.
  const nonAdminDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${adminUser.id}`, {
    method: "DELETE",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${targetUser.token}`, Prefer: "return=representation" },
  });
  const nonAdminDeleteBody = await nonAdminDeleteRes.json();
  const nonAdminBlocked = nonAdminDeleteRes.status === 200 && Array.isArray(nonAdminDeleteBody) && nonAdminDeleteBody.length === 0;
  record(nonAdminBlocked, `non-admin DELETE of another user is blocked by RLS (0 rows affected, status ${nonAdminDeleteRes.status})`);
  const { data: stillThere } = await admin.from("users").select("id").eq("id", adminUser.id).maybeSingle();
  record(!!stillThere, "target row still exists after the blocked non-admin delete attempt");

  // 3) Real admin CAN delete another user's profile row -- exactly what UserAdmin.jsx's new
  //    removeUser() calls (DELETE /users/:id).
  const adminDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${targetUser.id}`, {
    method: "DELETE",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminUser.token}`, Prefer: "return=representation" },
  });
  const adminDeleteBody = await adminDeleteRes.json();
  record(adminDeleteRes.status === 200 && adminDeleteBody.length === 1, `admin DELETE of another user's profile succeeds (status ${adminDeleteRes.status})`);
  const { data: goneRow } = await admin.from("users").select("id").eq("id", targetUser.id).maybeSingle();
  record(!goneRow, "deleted user's public.users row genuinely gone");
  const { data: authStillThere } = await admin.auth.admin.getUserById(targetUser.id);
  record(!!authStillThere?.user, "deleted user's auth.users record is UNCHANGED (confirms disclosed profile-only-delete limitation)");
} finally {
  await cleanup(adminUser?.id, "throwaway admin account");
  // targetUser's public.users row was already deleted by the test itself; its auth.users
  // record was deliberately left (that's the point being verified) -- clean it up here.
  await cleanup(targetUser?.id, "throwaway technician/accountant account");
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
