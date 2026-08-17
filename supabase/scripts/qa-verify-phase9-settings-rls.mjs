#!/usr/bin/env node
// Live authorization-matrix + write-path QA for cross-platform-parity Phase 9 (Android Settings):
// public.products_services and the public.job_card_settings singleton (migrations 0018 + 0021).
//
// This closes the gap left by the Phase 9 build verification, which confirmed the READ paths only.
// It drives the EXACT PostgREST request shapes mobile-android's SupabaseData.kt sends --
//   create():  POST   /rest/v1/<table>          + Prefer: return=representation, payload + updated_at
//   update():  PATCH  /rest/v1/<table>?id=eq.<id>                                payload + updated_at
//   delete():  DELETE /rest/v1/<table>?id=eq.<id>
//   fetchAll():GET    /rest/v1/<table>?select=* (no order= for job_card_settings, it has no created_at)
// with the exact field sets MainActivity.kt's ProductsServicesScreen/CatalogueItemDialog and
// JobCardSettingsScreen build, against the real production project, using throwaway auth users.
//
// It validates the SERVER-SIDE contract the Kotlin code depends on. It does NOT compile or run the
// Kotlin code (no CLI Android build is possible in this environment -- see KNOWN_ISSUES.md).
//
// job_card_settings is a real, single, production row. This script snapshots every column of it
// BEFORE touching it, and restores the exact snapshot afterwards with a verified field-by-field
// read-back. Nothing else in the database is written to.
//
// Usage: node supabase/scripts/qa-verify-phase9-settings-rls.mjs

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
  } catch { /* fall through to process.env */ }
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
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

const SETTINGS_COLUMNS = [
  "id", "numbering_prefix", "default_status", "default_line_quantity",
  "allow_products", "allow_services", "available_statuses", "line_types",
  "updated_at", "updated_by",
];

const cleanup = { users: [], catalogueRowIds: [], settingsSnapshot: null };

/** Mirrors SupabaseData.kt's request() -- raw fetch, no supabase-js query builder. */
async function pgrest(path, { method = "GET", token, body, preferReturn = false } = {}) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (preferReturn) headers["Prefer"] = "return=representation";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  return { status: res.status, text, json };
}

const nowIso = () => new Date().toISOString();

async function createTestUser(label, { role, permissions }) {
  const email = `qa-phase9-${label}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${label}) failed: ${error.message}`);
  const uid = data.user.id;
  cleanup.users.push({ uid, email, label });
  // Wait for the on_auth_user_created trigger to insert the public.users row.
  await new Promise((r) => setTimeout(r, 600));
  const { error: updErr } = await admin.from("users")
    .update({ is_active: true, role, effective_permissions: permissions })
    .eq("id", uid);
  if (updErr) throw new Error(`profile setup(${label}) failed: ${updErr.message}`);

  // Exactly what SupabaseAuth.kt's login() does.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (res.status !== 200 || !json.access_token) throw new Error(`login(${label}) failed: ${res.status} ${JSON.stringify(json)}`);
  return { uid, email, label, token: json.access_token };
}

function sameSettings(a, b) {
  return SETTINGS_COLUMNS.every((c) => JSON.stringify(a?.[c]) === JSON.stringify(b?.[c]));
}

/** How many rows PostgREST handed back in the representation (-1 = not a JSON array at all). */
const rowsReturned = (res) => (Array.isArray(res.json) ? res.json.length : -1);

/**
 * Mirrors SupabaseData.kt's requireRowAffected() decision, so these checks measure exactly what
 * the Android client concludes rather than what the raw HTTP status says.
 *
 * The fix does NOT make the server reject a denied write -- PostgREST still answers a
 * USING-clause-filtered PATCH/DELETE with 2xx. What changed is that the client now asks for
 * `Prefer: return=representation` and treats a zero-row representation as a failure. So the
 * contract worth verifying is "the client can tell denial from success", not "the server
 * returns >= 400" (which it never did and still does not).
 */
const clientSeesDenial = (res) => res.status >= 400 || rowsReturned(res) === 0;

async function main() {
  console.log("=== Setup ===");

  // Snapshot the production singleton BEFORE anything touches it (service role, bypasses RLS).
  const { data: snapshot, error: snapErr } = await admin
    .from("job_card_settings").select(SETTINGS_COLUMNS.join(",")).eq("id", true).single();
  if (snapErr) throw new Error(`Could not snapshot job_card_settings: ${snapErr.message}`);
  cleanup.settingsSnapshot = snapshot;
  console.log(`Snapshotted job_card_settings singleton: ${JSON.stringify(snapshot)}`);

  // User 1: ordinary technician, realistic permission set, deliberately WITHOUT settings.access.
  const noPerm = await createTestUser("noperm", {
    role: "technician",
    permissions: ["dashboard.view", "clients.view", "machines.view", "job_cards.view"],
  });
  record("Setup: technician WITHOUT settings.access created and logged in", Boolean(noPerm.token));

  // User 2: technician WITH an explicit settings.access grant. Deliberately a technician rather
  // than an admin, so this exercises has_permission()'s effective_permissions branch rather than
  // the is_admin() bypass (which User 3 covers separately).
  const granted = await createTestUser("granted", {
    role: "technician",
    permissions: ["dashboard.view", "clients.view", "job_cards.view", "settings.access"],
  });
  record("Setup: technician WITH explicit settings.access grant created and logged in", Boolean(granted.token));

  // User 3: administrator with NO explicit permissions -- migration 0018's stated design is that
  // is_admin() satisfies has_permission('settings.access') without a role_permissions row.
  const adminUser = await createTestUser("admin", { role: "admin", permissions: [] });
  record("Setup: administrator (no explicit permissions) created and logged in", Boolean(adminUser.token));

  try {
    // =====================================================================================
    console.log("\n=== 1. Reads: both tables readable by ALL THREE users (RLS *_select = has_active_profile) ===");

    for (const u of [noPerm, granted, adminUser]) {
      const ps = await pgrest("products_services?select=*&order=created_at.desc", { token: u.token });
      record(`Read products_services: ${u.label}`, ps.status === 200 && Array.isArray(ps.json), `HTTP ${ps.status}`);

      // No order= clause -- job_card_settings has no created_at (SupabaseData.kt TABLES_WITHOUT_CREATED_AT).
      const jcs = await pgrest("job_card_settings?select=*", { token: u.token });
      record(
        `Read job_card_settings singleton: ${u.label}`,
        jcs.status === 200 && Array.isArray(jcs.json) && jcs.json.length === 1 && jcs.json[0].id === true,
        `HTTP ${jcs.status}, ${Array.isArray(jcs.json) ? jcs.json.length : "?"} row(s)`
      );
    }

    // =====================================================================================
    console.log("\n=== 2. Writes as the GRANTED technician (the real Android Settings write paths) ===");

    // POST products_services -- exact CatalogueItemDialog payload + SupabaseData.create()'s updated_at.
    const createPayload = {
      type: "service",
      name: "QA Phase 9 Test Item (delete me)",
      description: "Throwaway catalogue row created by qa-verify-phase9-settings-rls.mjs",
      sku: "QA-P9-001",
      category: "QA",
      unit_price: 1234.56,
      vat_rate: 0.15,
      is_active: true,
      updated_at: nowIso(),
    };
    const created = await pgrest("products_services", {
      method: "POST", token: granted.token, preferReturn: true, body: createPayload,
    });
    const createdRow = created.json?.[0];
    if (createdRow?.id) cleanup.catalogueRowIds.push(createdRow.id);
    record(
      "products_services INSERT allowed for settings.access (POST, Prefer: return=representation)",
      created.status === 201 && Boolean(createdRow?.id),
      `HTTP ${created.status}${createdRow?.id ? "" : ` ${created.text}`}`
    );
    record(
      "Created row stored every field with the right types/values",
      createdRow?.type === "service" &&
        createdRow?.name === createPayload.name &&
        createdRow?.description === createPayload.description &&
        createdRow?.sku === "QA-P9-001" &&
        createdRow?.category === "QA" &&
        Number(createdRow?.unit_price) === 1234.56 &&
        Number(createdRow?.vat_rate) === 0.15 &&
        createdRow?.is_active === true,
      JSON.stringify({
        type: createdRow?.type, unit_price: createdRow?.unit_price,
        vat_rate: createdRow?.vat_rate, is_active: createdRow?.is_active,
      })
    );

    // PATCH products_services -- the "Archive" button's exact payload ({is_active: false}).
    const archive = await pgrest(`products_services?id=eq.${createdRow.id}`, {
      method: "PATCH", token: granted.token, preferReturn: true, body: { is_active: false, updated_at: nowIso() },
    });
    const { data: afterArchive } = await admin.from("products_services").select("is_active").eq("id", createdRow.id).single();
    record(
      "products_services UPDATE (archive toggle) allowed for settings.access, change verified server-side",
      archive.status >= 200 && archive.status < 300 && afterArchive?.is_active === false,
      `HTTP ${archive.status}, is_active now ${afterArchive?.is_active}`
    );
    // The converse of requireRowAffected(): an ALLOWED update must come back with a row, or the
    // client's new zero-row check would reject a write that genuinely succeeded.
    record(
      "products_services allowed UPDATE returns a non-empty representation (requireRowAffected passes)",
      rowsReturned(archive) === 1,
      `${rowsReturned(archive)} row(s) returned`
    );

    // The doc comment on requireRowAffected() claims an authorized no-op edit still returns a row
    // (Postgres returns every row an UPDATE touches, even when new values equal old ones). Verified
    // here rather than assumed, since the whole fix rests on it.
    const noopEdit = await pgrest(`products_services?id=eq.${createdRow.id}`, {
      method: "PATCH", token: granted.token, preferReturn: true, body: { is_active: false, updated_at: nowIso() },
    });
    record(
      "products_services allowed UPDATE that changes nothing still returns 1 row (no false denial)",
      rowsReturned(noopEdit) === 1,
      `HTTP ${noopEdit.status}, ${rowsReturned(noopEdit)} row(s) returned`
    );

    // PATCH products_services -- the full edit-dialog payload.
    const editPayload = {
      type: "product",
      name: "QA Phase 9 Test Item (edited, delete me)",
      description: "Edited by the QA script",
      sku: "QA-P9-002",
      category: "QA Edited",
      unit_price: 99.99,
      vat_rate: 0,
      is_active: true,
      updated_at: nowIso(),
    };
    const edited = await pgrest(`products_services?id=eq.${createdRow.id}`, {
      method: "PATCH", token: granted.token, preferReturn: true, body: editPayload,
    });
    const { data: afterEdit } = await admin.from("products_services")
      .select("type,name,sku,category,unit_price,vat_rate,is_active").eq("id", createdRow.id).single();
    record(
      "products_services UPDATE (full edit payload) allowed, all fields verified server-side",
      edited.status >= 200 && edited.status < 300 &&
        afterEdit?.type === "product" && afterEdit?.name === editPayload.name &&
        afterEdit?.sku === "QA-P9-002" && afterEdit?.category === "QA Edited" &&
        Number(afterEdit?.unit_price) === 99.99 && Number(afterEdit?.vat_rate) === 0 &&
        afterEdit?.is_active === true,
      `HTTP ${edited.status}, ${JSON.stringify(afterEdit)}`
    );
    record(
      "products_services allowed UPDATE (full edit payload) returns a non-empty representation",
      rowsReturned(edited) === 1,
      `${rowsReturned(edited)} row(s) returned`
    );

    // PATCH job_card_settings?id=eq.true -- JobCardSettingsScreen's exact save payload.
    const settingsPayload = {
      numbering_prefix: "QA9-",
      default_status: "Booked In",
      default_line_quantity: 2,
      allow_products: false,
      allow_services: false,
      available_statuses: ["QA Status A", "QA Status B"],
      line_types: ["QA Type A", "QA Type B"],
      updated_at: nowIso(),
    };
    const settingsPatch = await pgrest("job_card_settings?id=eq.true", {
      method: "PATCH", token: granted.token, preferReturn: true, body: settingsPayload,
    });
    // Re-read as the same user via the same GET the app uses, not via service role.
    const readBack = await pgrest("job_card_settings?select=*", { token: granted.token });
    const rb = readBack.json?.[0];
    record(
      "job_card_settings UPDATE (PATCH ?id=eq.true) allowed for settings.access",
      settingsPatch.status >= 200 && settingsPatch.status < 300,
      `HTTP ${settingsPatch.status}${settingsPatch.text ? ` ${settingsPatch.text}` : ""}`
    );
    record(
      "job_card_settings allowed UPDATE returns a non-empty representation (requireRowAffected passes)",
      rowsReturned(settingsPatch) === 1,
      `${rowsReturned(settingsPatch)} row(s) returned`
    );
    record(
      "job_card_settings change confirmed by re-reading all 7 saved fields",
      rb?.numbering_prefix === "QA9-" && rb?.default_status === "Booked In" &&
        Number(rb?.default_line_quantity) === 2 && rb?.allow_products === false &&
        rb?.allow_services === false &&
        JSON.stringify(rb?.available_statuses) === JSON.stringify(["QA Status A", "QA Status B"]) &&
        JSON.stringify(rb?.line_types) === JSON.stringify(["QA Type A", "QA Type B"]),
      JSON.stringify({
        numbering_prefix: rb?.numbering_prefix, default_status: rb?.default_status,
        default_line_quantity: rb?.default_line_quantity, allow_products: rb?.allow_products,
        allow_services: rb?.allow_services, available_statuses: rb?.available_statuses, line_types: rb?.line_types,
      })
    );

    // =====================================================================================
    console.log("\n=== 3. Writes as the ADMINISTRATOR (is_admin() bypass inside has_permission()) ===");

    const adminSettingsPatch = await pgrest("job_card_settings?id=eq.true", {
      method: "PATCH", token: adminUser.token, preferReturn: true, body: { numbering_prefix: "QA9A-", updated_at: nowIso() },
    });
    const { data: afterAdminPatch } = await admin.from("job_card_settings").select("numbering_prefix").eq("id", true).single();
    record(
      "job_card_settings UPDATE allowed for role=admin with NO explicit settings.access grant",
      adminSettingsPatch.status >= 200 && adminSettingsPatch.status < 300 && afterAdminPatch?.numbering_prefix === "QA9A-",
      `HTTP ${adminSettingsPatch.status}, prefix now ${afterAdminPatch?.numbering_prefix}`
    );
    record(
      "job_card_settings allowed UPDATE (admin) returns a non-empty representation",
      rowsReturned(adminSettingsPatch) === 1,
      `${rowsReturned(adminSettingsPatch)} row(s) returned`
    );

    const adminCatalogue = await pgrest("products_services", {
      method: "POST", token: adminUser.token, preferReturn: true,
      body: { type: "product", name: "QA Phase 9 Admin Item (delete me)", description: "", sku: "", category: "", unit_price: 0, vat_rate: 0.15, is_active: true, updated_at: nowIso() },
    });
    if (adminCatalogue.json?.[0]?.id) cleanup.catalogueRowIds.push(adminCatalogue.json[0].id);
    record(
      "products_services INSERT allowed for role=admin with NO explicit grant",
      adminCatalogue.status === 201 && Boolean(adminCatalogue.json?.[0]?.id),
      `HTTP ${adminCatalogue.status}`
    );

    const adminDelete = await pgrest(`products_services?id=eq.${adminCatalogue.json[0].id}`, {
      method: "DELETE", token: adminUser.token, preferReturn: true,
    });
    const { data: adminRowGone } = await admin.from("products_services").select("id").eq("id", adminCatalogue.json[0].id).maybeSingle();
    record(
      "products_services DELETE allowed for role=admin, row genuinely gone",
      adminDelete.status >= 200 && adminDelete.status < 300 && !adminRowGone,
      `HTTP ${adminDelete.status}`
    );
    record(
      "products_services allowed DELETE returns a non-empty representation (requireRowAffected passes)",
      rowsReturned(adminDelete) === 1,
      `${rowsReturned(adminDelete)} row(s) returned`
    );
    if (!adminRowGone) cleanup.catalogueRowIds = cleanup.catalogueRowIds.filter((id) => id !== adminCatalogue.json[0].id);

    // =====================================================================================
    console.log("\n=== 4. Denials for the technician WITHOUT settings.access ===");

    // INSERT -- WITH CHECK violation, must be a hard error, never a silent success.
    const deniedInsert = await pgrest("products_services", {
      method: "POST", token: noPerm.token, preferReturn: true,
      body: { type: "product", name: "QA Phase 9 SHOULD NOT EXIST", description: "", sku: "", category: "", unit_price: 0, vat_rate: 0.15, is_active: true, updated_at: nowIso() },
    });
    if (deniedInsert.json?.[0]?.id) cleanup.catalogueRowIds.push(deniedInsert.json[0].id);
    const { data: leakedInsert } = await admin.from("products_services").select("id").eq("name", "QA Phase 9 SHOULD NOT EXIST");
    record(
      "products_services INSERT DENIED for user without settings.access",
      deniedInsert.status === 403 && (leakedInsert || []).length === 0,
      `HTTP ${deniedInsert.status}, ${(leakedInsert || []).length} row(s) leaked`
    );

    // UPDATE -- USING-clause filter. Record BOTH the HTTP status and whether data actually changed.
    const { data: beforeDeniedUpdate } = await admin.from("products_services")
      .select("name,is_active").eq("id", createdRow.id).single();
    const deniedUpdate = await pgrest(`products_services?id=eq.${createdRow.id}`, {
      method: "PATCH", token: noPerm.token, preferReturn: true,
      body: { name: "HIJACKED BY QA", is_active: false, updated_at: nowIso() },
    });
    const { data: afterDeniedUpdate } = await admin.from("products_services")
      .select("name,is_active").eq("id", createdRow.id).single();
    record(
      "products_services UPDATE DENIED for user without settings.access (row genuinely unchanged)",
      afterDeniedUpdate?.name === beforeDeniedUpdate?.name && afterDeniedUpdate?.is_active === beforeDeniedUpdate?.is_active,
      `HTTP ${deniedUpdate.status}, name still "${afterDeniedUpdate?.name}"`
    );
    record(
      "products_services denied UPDATE is detectable by the Android client (zero-row representation or HTTP error)",
      clientSeesDenial(deniedUpdate),
      `HTTP ${deniedUpdate.status}, ${rowsReturned(deniedUpdate)} row(s) returned -- SupabaseData.requireRowAffected() throws on 0`
    );

    // DELETE -- same USING-clause semantics.
    const deniedDelete = await pgrest(`products_services?id=eq.${createdRow.id}`, {
      method: "DELETE", token: noPerm.token, preferReturn: true,
    });
    const { data: stillExists } = await admin.from("products_services").select("id").eq("id", createdRow.id).maybeSingle();
    record(
      "products_services DELETE DENIED for user without settings.access (row still exists)",
      Boolean(stillExists),
      `HTTP ${deniedDelete.status}`
    );
    record(
      "products_services denied DELETE is detectable by the Android client (zero-row representation or HTTP error)",
      clientSeesDenial(deniedDelete),
      `HTTP ${deniedDelete.status}, ${rowsReturned(deniedDelete)} row(s) returned`
    );

    // job_card_settings UPDATE -- the important one: a real production singleton.
    const { data: beforeDeniedSettings } = await admin.from("job_card_settings")
      .select(SETTINGS_COLUMNS.join(",")).eq("id", true).single();
    const deniedSettings = await pgrest("job_card_settings?id=eq.true", {
      method: "PATCH", token: noPerm.token, preferReturn: true,
      body: {
        numbering_prefix: "HIJACK-", default_status: "Hijacked", default_line_quantity: 99,
        allow_products: false, allow_services: false,
        available_statuses: ["Hijacked"], line_types: ["Hijacked"], updated_at: nowIso(),
      },
    });
    const { data: afterDeniedSettings } = await admin.from("job_card_settings")
      .select(SETTINGS_COLUMNS.join(",")).eq("id", true).single();
    record(
      "job_card_settings UPDATE DENIED for user without settings.access (singleton genuinely unchanged)",
      sameSettings(beforeDeniedSettings, afterDeniedSettings),
      `HTTP ${deniedSettings.status}, prefix still "${afterDeniedSettings?.numbering_prefix}"`
    );
    record(
      "job_card_settings denied UPDATE is detectable by the Android client (zero-row representation or HTTP error)",
      clientSeesDenial(deniedSettings),
      `HTTP ${deniedSettings.status}, ${rowsReturned(deniedSettings)} row(s) returned`
    );

    // job_card_settings has no INSERT/DELETE policy at all -- nobody, not even an admin, may.
    const settingsInsert = await pgrest("job_card_settings", {
      method: "POST", token: adminUser.token, preferReturn: true, body: { id: true, numbering_prefix: "DUP-" },
    });
    record(
      "job_card_settings INSERT denied even for an administrator (no insert policy exists)",
      settingsInsert.status >= 400,
      `HTTP ${settingsInsert.status}`
    );
    const settingsDelete = await pgrest("job_card_settings?id=eq.true", { method: "DELETE", token: adminUser.token });
    const { data: singletonStillThere } = await admin.from("job_card_settings").select("id").eq("id", true).maybeSingle();
    record(
      "job_card_settings DELETE cannot remove the singleton, even for an administrator",
      Boolean(singletonStillThere),
      `HTTP ${settingsDelete.status}`
    );
  } finally {
    // =====================================================================================
    console.log("\n=== 5. Restore + cleanup ===");

    // Restore the production singleton to its exact pre-run snapshot, every column.
    const snap = cleanup.settingsSnapshot;
    if (snap) {
      const restorePayload = {};
      for (const c of SETTINGS_COLUMNS) if (c !== "id") restorePayload[c] = snap[c];
      const { error: restoreErr } = await admin.from("job_card_settings").update(restorePayload).eq("id", true);
      record("job_card_settings restore write executed", !restoreErr, restoreErr?.message || "");
    }

    // Delete every catalogue row this run created.
    for (const id of cleanup.catalogueRowIds) {
      await admin.from("products_services").delete().eq("id", id);
    }
    // Belt-and-braces sweep by the QA name marker, in case an id was ever missed.
    await admin.from("products_services").delete().like("name", "QA Phase 9%");

    // Delete every throwaway auth user.
    for (const u of cleanup.users) {
      await admin.auth.admin.deleteUser(u.uid).catch(() => {});
    }

    // ---- INDEPENDENT re-verification (fresh queries, not trusting the deletes above) ----
    const { data: residualRows } = await admin.from("products_services").select("id,name").like("name", "QA Phase 9%");
    record("Cleanup verified: zero residual QA catalogue rows", (residualRows || []).length === 0, `${(residualRows || []).length} left`);

    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const leftoverEmails = (listed?.users || []).filter((u) => (u.email || "").startsWith("qa-phase9-")).map((u) => u.email);
    record("Cleanup verified: zero residual qa-phase9- auth users (fresh listUsers)", leftoverEmails.length === 0, leftoverEmails.join(", "));

    const leftoverProfiles = await admin.from("users").select("id,email").like("email", "qa-phase9-%");
    record("Cleanup verified: zero residual qa-phase9- public.users profile rows", (leftoverProfiles.data || []).length === 0, `${(leftoverProfiles.data || []).length} left`);

    const { data: finalSettings } = await admin.from("job_card_settings").select(SETTINGS_COLUMNS.join(",")).eq("id", true).single();
    record(
      "Restore verified: job_card_settings matches its pre-run snapshot field-by-field",
      sameSettings(cleanup.settingsSnapshot, finalSettings),
      SETTINGS_COLUMNS
        .filter((c) => JSON.stringify(cleanup.settingsSnapshot?.[c]) !== JSON.stringify(finalSettings?.[c]))
        .map((c) => `${c}: ${JSON.stringify(cleanup.settingsSnapshot?.[c])} -> ${JSON.stringify(finalSettings?.[c])}`)
        .join("; ") || "identical"
    );
    console.log(`Final job_card_settings: ${JSON.stringify(finalSettings)}`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => !x.pass)) console.log(`  FAIL - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Script failed:", e.message);
  process.exit(1);
});
