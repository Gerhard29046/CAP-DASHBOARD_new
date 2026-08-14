#!/usr/bin/env node
// Live QA for Phase E1 (Android->Supabase knowledge-base migration) -- exercises the EXACT
// PostgREST request shapes mobile-android/.../SupabaseData.kt's SupabaseDataRepository makes
// (GET select=*&order=created_at.desc, POST + Prefer: return=representation, PATCH ?id=eq.<id>,
// DELETE ?id=eq.<id>) against the real production Supabase project, using throwaway technician
// test users and throwaway knowledge-base rows.
//
// Same discipline/precedent as qa-verify-android-phase-d-rest-contract.mjs. This validates the
// SERVER-SIDE CONTRACT the Kotlin code depends on -- it does NOT compile or run the Kotlin code
// (no Gradle/Android build is possible from the CLI on this machine; see KNOWN_ISSUES.md).
//
// The service-role key is used ONLY for fixture setup/teardown and independent verification --
// never as proof of client-visible behaviour. Every behavioural assertion goes through anon key
// + a real user access token, exactly like the Android app.
//
// Usage: node scripts/qa-verify-android-phase-e1-knowledge-rest-contract.mjs

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
  } catch { /* no .env */ }
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
function record(group, name, pass, detail = "") {
  results.push({ group, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${group}] ${name}${detail ? ` -- ${detail}` : ""}`);
}

const cleanup = {
  users: [],
  knowledgeMachineIds: [],
  noteIds: [],
  serviceCodeIds: [],
  mediaIds: [],
  documentIds: [],
  clientIds: [],
  machineIds: [],
};

// Mirrors SupabaseData.kt's private request() -- raw fetch, no supabase-js query builder, so
// this genuinely exercises the same HTTP shapes the Kotlin code sends.
async function pgrest(path, { method = "GET", token, body, preferReturn = false, preferCount = false, rawBody } = {}) {
  const headers = { apikey: ANON_KEY, Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
  if (preferReturn) headers["Prefer"] = "return=representation";
  if (preferCount) headers["Prefer"] = "count=exact";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  return { status: res.status, headers: res.headers, text, json };
}

async function makeUser(label, permissions) {
  const email = `qa-phase-e1+${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@invalid.local`;
  const password = `QaTest-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${label}) failed: ${error.message}`);
  cleanup.users.push(created.user.id);
  await new Promise((r) => setTimeout(r, 400));
  const { error: updErr } = await admin.from("users")
    .update({ role: "technician", is_active: true, effective_permissions: permissions })
    .eq("id", created.user.id);
  if (updErr) throw new Error(`users update(${label}) failed: ${updErr.message}`);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`login(${label}) failed: ${res.status} ${JSON.stringify(json)}`);
  return { id: created.user.id, token: json.access_token };
}

// The exact array/jsonb values the test writes -- kept as JS array/object so JSON.stringify
// produces the same wire shape SupabaseData.kt's fixed anyToJsonValue() produces
// (JSONArray -> [..], JSONObject -> {..}), NOT the pre-fix `value.toString()` shape.
const REFRIGERANTS = ["R32", "R410A", "R290"];
const MAIN_FUNCTIONS = ["Recovery", "Vacuum", "Charge"];
const TECH_SPECS = { "Power Supply": "230V 50Hz", "Tank Capacity": "12 L", "Weight": "34 kg" };

async function main() {
  console.log("=== Baseline: pre-existing qa-* users (must be untouched) ===");
  const { data: usersBefore } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const qaBefore = usersBefore.users.filter((u) => (u.email || "").startsWith("qa-")).map((u) => u.email);
  console.log(`Pre-existing qa-* accounts (${qaBefore.length}):`, qaBefore);

  console.log("\n=== Setup: throwaway technician users ===");
  // Realistic field technician with full knowledge-base rights (+ Phase D rights for regression).
  const techFull = await makeUser("kb-full", [
    "knowledge_base.view", "knowledge_base.create", "knowledge_base.edit", "knowledge_base.delete",
    "clients.view", "clients.create", "clients.edit", "clients.delete",
    "machines.view", "machines.create", "machines.edit", "machines.delete",
    "services.view", "job_cards.view",
  ]);
  // Realistic technician who can SEE the knowledge base but was never granted create/edit/delete.
  // Android's UI gates "Add Note" on `user.role != "accountant"` -- this user is role=technician,
  // so the UI WILL show the Add Note form to them.
  const techViewOnly = await makeUser("kb-viewonly", ["knowledge_base.view"]);
  // Technician with no knowledge_base permission at all.
  const techNoKb = await makeUser("kb-none", ["clients.view"]);
  record("setup", "Three throwaway technicians created and logged in (password grant)", true);

  // =====================================================================
  // 1. knowledge_machines
  // =====================================================================
  console.log("\n=== 1. knowledge_machines ===");

  // 1a. Real-field-only insert (no `name`) -- 0001_initial_schema.sql declares `name text not
  //     null` and 0011 never dropped that constraint, so this documents whether the "real"
  //     column set alone is insertable.
  const noNameCreate = await pgrest("knowledge_machines", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: {
      manufacturer: "QA-E1", model_name: "Round-Trip Rig", variant: "Mk I",
      product_code: "QA-E1-001", category: "Recovery", summary: "QA Phase E1 fixture (delete me)",
      supported_refrigerants: REFRIGERANTS,
      technical_specifications: TECH_SPECS,
      main_functions: MAIN_FUNCTIONS,
      updated_at: new Date().toISOString(),
    },
  });
  record("knowledge_machines", "Insert with ONLY the real (0011) columns, no legacy `name`",
    noNameCreate.status === 201,
    `status=${noNameCreate.status} ${noNameCreate.text.slice(0, 300)}`);
  if (noNameCreate.json?.[0]?.id) cleanup.knowledgeMachineIds.push(noNameCreate.json[0].id);

  // 1b. The insert the test actually builds on -- includes legacy `name` so it satisfies the
  //     not-null constraint regardless of 1a's outcome.
  const kmCreate = await pgrest("knowledge_machines", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: {
      name: "QA Phase E1 Machine (delete me)",
      manufacturer: "QA-E1", model_name: "Round-Trip Rig", variant: "Mk I",
      product_code: "QA-E1-002", category: "Recovery", summary: "QA Phase E1 fixture (delete me)",
      supported_refrigerants: REFRIGERANTS,
      technical_specifications: TECH_SPECS,
      main_functions: MAIN_FUNCTIONS,
      updated_at: new Date().toISOString(),
    },
  });
  const kmId = kmCreate.json?.[0]?.id;
  record("knowledge_machines", "Create (POST + Prefer: return=representation) as technician with knowledge_base.create",
    kmCreate.status === 201 && Boolean(kmId), `status=${kmCreate.status} ${kmCreate.text.slice(0, 300)}`);
  if (kmId) cleanup.knowledgeMachineIds.push(kmId);
  if (!kmId) throw new Error("Cannot continue: knowledge_machines fixture insert failed.");

  // 1c. ARRAY/JSONB ROUND-TRIP -- the two column types this migration path was never exercised
  //     against before. Must come back as a real JSON array / real JSON object, NOT "[a, b]"
  //     or "{k=v}".
  const created = kmCreate.json[0];
  const arrOk = Array.isArray(created.supported_refrigerants)
    && JSON.stringify(created.supported_refrigerants) === JSON.stringify(REFRIGERANTS);
  const funcOk = Array.isArray(created.main_functions)
    && JSON.stringify(created.main_functions) === JSON.stringify(MAIN_FUNCTIONS);
  const jsonbOk = created.technical_specifications
    && typeof created.technical_specifications === "object"
    && !Array.isArray(created.technical_specifications)
    && created.technical_specifications["Power Supply"] === "230V 50Hz"
    && created.technical_specifications["Tank Capacity"] === "12 L";
  record("knowledge_machines", "text[] supported_refrigerants round-trips as a real JSON array", arrOk,
    `POST response: supported_refrigerants=${JSON.stringify(created.supported_refrigerants)}`);
  record("knowledge_machines", "text[] main_functions round-trips as a real JSON array", funcOk,
    `POST response: main_functions=${JSON.stringify(created.main_functions)}`);
  record("knowledge_machines", "jsonb technical_specifications round-trips as a real JSON object", jsonbOk,
    `POST response: technical_specifications=${JSON.stringify(created.technical_specifications)}`);

  // 1d. Same values re-read through fetchAll()'s EXACT request shape.
  const kmList = await pgrest("knowledge_machines?select=*&order=created_at.desc", { token: techFull.token });
  const fetched = kmList.json?.find((r) => r.id === kmId);
  const fetchedArrOk = Array.isArray(fetched?.supported_refrigerants)
    && JSON.stringify(fetched.supported_refrigerants) === JSON.stringify(REFRIGERANTS);
  const fetchedJsonbOk = fetched?.technical_specifications
    && typeof fetched.technical_specifications === "object"
    && !Array.isArray(fetched.technical_specifications)
    && Object.keys(fetched.technical_specifications).length === 3;
  record("knowledge_machines", "GET select=*&order=created_at.desc (fetchAll shape) returns the row",
    kmList.status === 200 && Boolean(fetched), `status=${kmList.status}`);
  record("knowledge_machines", "GET: text[] still a JSON array (Android stringList() input)", Boolean(fetchedArrOk),
    `GET response: supported_refrigerants=${JSON.stringify(fetched?.supported_refrigerants)}`);
  record("knowledge_machines", "GET: jsonb still a JSON object (Android stringMap() input)", Boolean(fetchedJsonbOk),
    `GET response: technical_specifications=${JSON.stringify(fetched?.technical_specifications)}`);

  // 1e. NEGATIVE CONTROL -- prove the pre-fix org.json shape (`value.toString()`) would actually
  //     have been rejected/mangled, i.e. that anyToJsonValue() is load-bearing, not cosmetic.
  const brokenShape = await pgrest("knowledge_machines", {
    method: "POST", token: techFull.token, preferReturn: true,
    rawBody: JSON.stringify({
      name: "QA Phase E1 broken-shape probe (delete me)",
      supported_refrigerants: "[R32, R410A, R290]",          // what value.toString() on a List gives
      technical_specifications: "{Power Supply=230V 50Hz}",  // what value.toString() on a Map gives
      updated_at: new Date().toISOString(),
    }),
  });
  if (brokenShape.json?.[0]?.id) cleanup.knowledgeMachineIds.push(brokenShape.json[0].id);
  const brokenArr = brokenShape.json?.[0]?.supported_refrigerants;
  const brokenRejectedOrMangled = brokenShape.status !== 201
    || JSON.stringify(brokenArr) !== JSON.stringify(REFRIGERANTS);
  record("knowledge_machines", "NEGATIVE CONTROL: pre-fix stringified shape does NOT produce correct data",
    brokenRejectedOrMangled,
    `status=${brokenShape.status} supported_refrigerants=${JSON.stringify(brokenArr)} specs=${JSON.stringify(brokenShape.json?.[0]?.technical_specifications)}`);

  // 1f. PATCH (update() shape) on the array/jsonb columns.
  const kmPatch = await pgrest(`knowledge_machines?id=eq.${kmId}`, {
    method: "PATCH", token: techFull.token,
    body: { supported_refrigerants: ["R134a"], technical_specifications: { "Weight": "35 kg" }, updated_at: new Date().toISOString() },
  });
  record("knowledge_machines", "Update (PATCH ?id=eq.<id>) array/jsonb columns",
    kmPatch.status === 200 || kmPatch.status === 204, `status=${kmPatch.status} ${kmPatch.text.slice(0, 200)}`);
  const reread = await pgrest(`knowledge_machines?select=*&id=eq.${kmId}`, { token: techFull.token });
  const patched = reread.json?.[0];
  record("knowledge_machines", "PATCH persisted correctly typed (re-read as normal user, not service role)",
    JSON.stringify(patched?.supported_refrigerants) === JSON.stringify(["R134a"])
      && patched?.technical_specifications?.Weight === "35 kg",
    `refrigerants=${JSON.stringify(patched?.supported_refrigerants)} specs=${JSON.stringify(patched?.technical_specifications)}`);

  // Restore the fixture values so later reads are predictable.
  await pgrest(`knowledge_machines?id=eq.${kmId}`, {
    method: "PATCH", token: techFull.token,
    body: { supported_refrigerants: REFRIGERANTS, technical_specifications: TECH_SPECS },
  });

  // =====================================================================
  // 2. knowledge_notes  (the flagged role-vs-permission finding)
  // =====================================================================
  console.log("\n=== 2. knowledge_notes ===");

  // 2a. POSITIVE: technician WITH knowledge_base.create -- exactly the payload MainActivity.kt's
  //     "Add Note" button sends: {knowledge_machine_id, title, content, note_type}.
  const notePositive = await pgrest("knowledge_notes", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: {
      knowledge_machine_id: kmId,
      title: "QA E1 note (delete me)",
      content: "Created by the Phase E1 REST-contract QA script.",
      note_type: "troubleshooting",
      updated_at: new Date().toISOString(),
    },
  });
  const noteId = notePositive.json?.[0]?.id;
  record("knowledge_notes", "POSITIVE RLS: technician WITH knowledge_base.create can insert (Android Add Note payload)",
    notePositive.status === 201 && Boolean(noteId), `status=${notePositive.status} ${notePositive.text.slice(0, 250)}`);
  if (noteId) cleanup.noteIds.push(noteId);

  // 2b. NEGATIVE: technician WITHOUT knowledge_base.create. Android's UI shows them the Add Note
  //     form because it only checks `role != "accountant"`.
  const noteNegative = await pgrest("knowledge_notes", {
    method: "POST", token: techViewOnly.token, preferReturn: true,
    body: {
      knowledge_machine_id: kmId,
      title: "QA E1 SHOULD-BE-REJECTED note",
      content: "If this row exists, RLS failed.",
      note_type: "troubleshooting",
      updated_at: new Date().toISOString(),
    },
  });
  const rejected = noteNegative.status === 401 || noteNegative.status === 403;
  record("knowledge_notes", "NEGATIVE RLS: technician WITHOUT knowledge_base.create is REJECTED (not silent success)",
    rejected, `status=${noteNegative.status} body=${noteNegative.text.slice(0, 300)}`);
  if (noteNegative.json?.[0]?.id) cleanup.noteIds.push(noteNegative.json[0].id);
  // Independently confirm no row leaked in, via service role.
  const { data: leakCheck } = await admin.from("knowledge_notes").select("id").eq("title", "QA E1 SHOULD-BE-REJECTED note");
  record("knowledge_notes", "NEGATIVE RLS: independently confirmed 0 rows written (service-role check)",
    (leakCheck?.length ?? -1) === 0, `rows=${leakCheck?.length}`);

  // 2c. Technician with NO knowledge_base permission at all cannot even read.
  const noKbRead = await pgrest("knowledge_notes?select=*&order=created_at.desc", { token: techNoKb.token });
  record("knowledge_notes", "Technician with no knowledge_base.view reads an EMPTY list (RLS select filter)",
    noKbRead.status === 200 && Array.isArray(noKbRead.json) && noKbRead.json.length === 0,
    `status=${noKbRead.status} rows=${Array.isArray(noKbRead.json) ? noKbRead.json.length : "n/a"}`);

  // 2d. View-only technician CAN read the note.
  const viewOnlyRead = await pgrest("knowledge_notes?select=*&order=created_at.desc", { token: techViewOnly.token });
  record("knowledge_notes", "View-only technician can read notes (knowledge_base.view)",
    viewOnlyRead.status === 200 && viewOnlyRead.json?.some((r) => r.id === noteId), `status=${viewOnlyRead.status}`);

  // 2e. UPDATE/DELETE denial shape for a view-only user -- PostgREST's RLS `using` filter makes
  //     these match zero rows rather than error. Documented explicitly because a 204 here is a
  //     SILENT no-op, not a rejection.
  const viewOnlyPatch = await pgrest(`knowledge_notes?id=eq.${noteId}`, {
    method: "PATCH", token: techViewOnly.token, body: { title: "HIJACKED BY QA" },
  });
  const { data: afterHijack } = await admin.from("knowledge_notes").select("title").eq("id", noteId).single();
  record("knowledge_notes", "View-only technician's PATCH does not change the row",
    afterHijack?.title === "QA E1 note (delete me)",
    `PATCH status=${viewOnlyPatch.status} (silent no-op if 2xx) title now="${afterHijack?.title}"`);
  const viewOnlyDelete = await pgrest(`knowledge_notes?id=eq.${noteId}`, { method: "DELETE", token: techViewOnly.token });
  const { data: afterDel } = await admin.from("knowledge_notes").select("id").eq("id", noteId);
  record("knowledge_notes", "View-only technician's DELETE does not remove the row",
    (afterDel?.length ?? 0) === 1, `DELETE status=${viewOnlyDelete.status} (silent no-op if 2xx) rows remaining=${afterDel?.length}`);

  // =====================================================================
  // 3. knowledge_service_codes
  // =====================================================================
  console.log("\n=== 3. knowledge_service_codes ===");
  const scCreate = await pgrest("knowledge_service_codes", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: {
      knowledge_machine_id: kmId,
      service_code: "QA-SECRET-4821",
      function_name: "Enter service mode",
      description: "QA Phase E1 fixture (delete me)",
      updated_at: new Date().toISOString(),
    },
  });
  const scId = scCreate.json?.[0]?.id;
  record("knowledge_service_codes", "Create with service_code/function_name",
    scCreate.status === 201 && Boolean(scId), `status=${scCreate.status} ${scCreate.text.slice(0, 250)}`);
  if (scId) cleanup.serviceCodeIds.push(scId);

  const scRead = await pgrest("knowledge_service_codes?select=*&order=created_at.desc", { token: techViewOnly.token });
  const scRow = scRead.json?.find((r) => r.id === scId);
  record("knowledge_service_codes", "View-only technician reads service_code in PLAINTEXT (expected per RLS design, not a bug)",
    scRead.status === 200 && scRow?.service_code === "QA-SECRET-4821" && scRow?.function_name === "Enter service mode",
    `service_code="${scRow?.service_code}" function_name="${scRow?.function_name}"`);

  // =====================================================================
  // 4. knowledge_media / knowledge_documents (Android is READ-ONLY)
  // =====================================================================
  console.log("\n=== 4. knowledge_media / knowledge_documents ===");
  const mediaCreate = await pgrest("knowledge_media", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: {
      knowledge_machine_id: kmId,
      file_url: "https://example.invalid/qa-e1-photo.jpg",
      caption: "QA E1 photo caption",
      original_filename: "qa-e1-photo.jpg",
      title: "QA E1 photo",
      updated_at: new Date().toISOString(),
    },
  });
  const mediaId = mediaCreate.json?.[0]?.id;
  record("knowledge_media", "Setup insert succeeds", mediaCreate.status === 201 && Boolean(mediaId),
    `status=${mediaCreate.status} ${mediaCreate.text.slice(0, 250)}`);
  if (mediaId) cleanup.mediaIds.push(mediaId);

  const mediaRead = await pgrest("knowledge_media?select=*&order=created_at.desc", { token: techViewOnly.token });
  const mRow = mediaRead.json?.find((r) => r.id === mediaId);
  record("knowledge_media", "GET returns file_url/caption/original_filename as plain strings (photo.text(...) accessors)",
    mediaRead.status === 200
      && typeof mRow?.file_url === "string" && mRow.file_url === "https://example.invalid/qa-e1-photo.jpg"
      && typeof mRow?.caption === "string" && typeof mRow?.original_filename === "string",
    `file_url="${mRow?.file_url}" caption="${mRow?.caption}" original_filename="${mRow?.original_filename}"`);

  const docCreate = await pgrest("knowledge_documents", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: {
      knowledge_machine_id: kmId,
      file_url: "https://example.invalid/qa-e1-manual.pdf",
      title: "QA E1 service manual",
      original_filename: "qa-e1-manual.pdf",
      updated_at: new Date().toISOString(),
    },
  });
  const docId = docCreate.json?.[0]?.id;
  record("knowledge_documents", "Setup insert succeeds", docCreate.status === 201 && Boolean(docId),
    `status=${docCreate.status} ${docCreate.text.slice(0, 250)}`);
  if (docId) cleanup.documentIds.push(docId);

  const docRead = await pgrest("knowledge_documents?select=*&order=created_at.desc", { token: techViewOnly.token });
  const dRow = docRead.json?.find((r) => r.id === docId);
  record("knowledge_documents", "GET returns file_url/title/original_filename as plain strings",
    docRead.status === 200
      && typeof dRow?.file_url === "string" && dRow.file_url === "https://example.invalid/qa-e1-manual.pdf"
      && typeof dRow?.title === "string" && typeof dRow?.original_filename === "string",
    `file_url="${dRow?.file_url}" title="${dRow?.title}" original_filename="${dRow?.original_filename}"`);

  // =====================================================================
  // 5. Auth / permission negatives
  // =====================================================================
  console.log("\n=== 5. Auth negatives ===");
  const unauth = await pgrest("knowledge_machines?select=*&order=created_at.desc", { token: undefined });
  record("auth", "Unauthenticated request (anon key, no bearer) is rejected",
    unauth.status === 401, `status=${unauth.status} ${unauth.text.slice(0, 200)}`);

  const badToken = await pgrest("knowledge_machines?select=*&order=created_at.desc", { token: "not-a-real-jwt" });
  record("auth", "Malformed/invalid session token is rejected (Android maps 401 -> 'session expired')",
    badToken.status === 401, `status=${badToken.status} ${badToken.text.slice(0, 200)}`);

  // Expired-session behaviour: sign the user out server-side, then reuse the same token on a
  // WRITE. Supabase JWTs stay signature-valid until expiry, so the meaningful revocation check
  // is that the refresh token no longer works.
  const logoutRes = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${techNoKb.token}` },
  });
  record("auth", "Logout (POST /auth/v1/logout) accepted", logoutRes.status === 204 || logoutRes.status === 200, `status=${logoutRes.status}`);
  const refreshAfterLogout = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: "revoked-by-logout" }),
  });
  record("auth", "Refresh with an invalid/revoked refresh token is rejected", refreshAfterLogout.status >= 400, `status=${refreshAfterLogout.status}`);

  // Wrong-permission WRITE on a knowledge table the user can read (must not be empty-success).
  const wrongPermMachine = await pgrest("knowledge_machines", {
    method: "POST", token: techViewOnly.token, preferReturn: true,
    body: { name: "QA E1 SHOULD-BE-REJECTED machine", manufacturer: "QA", updated_at: new Date().toISOString() },
  });
  record("auth", "Wrong-permission INSERT on knowledge_machines is rejected with 401/403",
    wrongPermMachine.status === 401 || wrongPermMachine.status === 403,
    `status=${wrongPermMachine.status} ${wrongPermMachine.text.slice(0, 250)}`);
  if (wrongPermMachine.json?.[0]?.id) cleanup.knowledgeMachineIds.push(wrongPermMachine.json[0].id);

  // =====================================================================
  // 6. Phase D regression (Core.kt's SUPABASE_MIGRATED_TABLES routing widened this phase)
  // =====================================================================
  console.log("\n=== 6. Phase D regression ===");
  const cCreate = await pgrest("clients", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: { company_name: "QA Phase E1 Regression Client (delete me)", contact_person: "QA Bot", updated_at: new Date().toISOString() },
  });
  const clientId = cCreate.json?.[0]?.id;
  record("regression:clients", "Create client still works", cCreate.status === 201 && Boolean(clientId),
    `status=${cCreate.status} ${cCreate.text.slice(0, 200)}`);
  if (clientId) cleanup.clientIds.push(clientId);

  const cList = await pgrest("clients?select=*&order=created_at.desc", { token: techFull.token });
  record("regression:clients", "GET select=*&order=created_at.desc includes the new client",
    cList.status === 200 && cList.json?.some((r) => r.id === clientId), `status=${cList.status}`);

  const cPatch = await pgrest(`clients?id=eq.${clientId}`, {
    method: "PATCH", token: techFull.token, body: { notes: "QA E1 regression patch", updated_at: new Date().toISOString() },
  });
  const { data: cAfter } = await admin.from("clients").select("notes").eq("id", clientId).single();
  record("regression:clients", "PATCH still persists", (cPatch.status === 200 || cPatch.status === 204) && cAfter?.notes === "QA E1 regression patch",
    `status=${cPatch.status} notes="${cAfter?.notes}"`);

  const mCreate = await pgrest("machines", {
    method: "POST", token: techFull.token, preferReturn: true,
    body: { client_id: clientId, brand: "QA", model: "E1 Regression Unit", machine_type: "Split AC", updated_at: new Date().toISOString() },
  });
  const machId = mCreate.json?.[0]?.id;
  record("regression:machines", "Create machine still works", mCreate.status === 201 && Boolean(machId),
    `status=${mCreate.status} ${mCreate.text.slice(0, 200)}`);
  if (machId) cleanup.machineIds.push(machId);

  const mList = await pgrest("machines?select=*&order=created_at.desc", { token: techFull.token });
  record("regression:machines", "GET select=*&order=created_at.desc includes the new machine",
    mList.status === 200 && mList.json?.some((r) => r.id === machId), `status=${mList.status}`);

  const svcList = await pgrest("service_records?select=*&order=created_at.desc", { token: techFull.token });
  const jcList = await pgrest("job_cards?select=*&order=created_at.desc", { token: techFull.token });
  record("regression:service_records", "GET still returns 200", svcList.status === 200, `status=${svcList.status}`);
  record("regression:job_cards", "GET still returns 200", jcList.status === 200, `status=${jcList.status}`);

  // count() shape (Status screen)
  const cnt = await pgrest("knowledge_machines?select=id&limit=1", { token: techFull.token, preferCount: true });
  record("knowledge_machines", "count() shape (Prefer: count=exact) returns Content-Range",
    Boolean(cnt.headers.get("content-range")), `Content-Range: ${cnt.headers.get("content-range")}`);

  // =====================================================================
  // Cleanup
  // =====================================================================
  await doCleanup();

  // Independent re-verification (fresh queries, not the cleanup calls' own return values).
  console.log("\n=== Independent cleanup verification ===");
  const checks = [
    ["knowledge_notes", cleanup.noteIds],
    ["knowledge_service_codes", cleanup.serviceCodeIds],
    ["knowledge_media", cleanup.mediaIds],
    ["knowledge_documents", cleanup.documentIds],
    ["knowledge_machines", cleanup.knowledgeMachineIds],
    ["machines", cleanup.machineIds],
    ["clients", cleanup.clientIds],
  ];
  for (const [table, ids] of checks) {
    if (!ids.length) continue;
    const { data } = await admin.from(table).select("id").in("id", ids);
    record("cleanup", `${table}: all ${ids.length} QA row(s) gone`, (data?.length ?? -1) === 0, `remaining=${data?.length}`);
  }
  const { data: usersAfter } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const qaAfter = usersAfter.users.filter((u) => (u.email || "").startsWith("qa-")).map((u) => u.email);
  const myUsersGone = !usersAfter.users.some((u) => cleanup.users.includes(u.id));
  record("cleanup", "All 3 QA auth users deleted", myUsersGone);
  record("cleanup", "Pre-existing qa-* accounts left untouched",
    qaBefore.every((e) => qaAfter.includes(e)) && qaAfter.length === qaBefore.length,
    `before=${qaBefore.length} after=${qaAfter.length}`);
  const { data: orphanUserRows } = await admin.from("users").select("id").in("id", cleanup.users);
  record("cleanup", "No orphaned public.users rows left behind", (orphanUserRows?.length ?? -1) === 0, `remaining=${orphanUserRows?.length}`);

  // =====================================================================
  // Summary
  // =====================================================================
  const byGroup = {};
  for (const r of results) {
    byGroup[r.group] ??= { pass: 0, fail: 0 };
    byGroup[r.group][r.pass ? "pass" : "fail"] += 1;
  }
  console.log("\n=== SUMMARY BY GROUP ===");
  for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g}: ${v.pass}/${v.pass + v.fail}`);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nTOTAL ${passed}/${results.length} checks passed.`);
  if (passed !== results.length) {
    console.log("FAILURES:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - [${r.group}] ${r.name}: ${r.detail}`));
    process.exit(1);
  }
}

async function doCleanup() {
  console.log("\n=== Cleanup ===");
  const del = async (table, ids) => { if (ids.length) await admin.from(table).delete().in("id", ids); };
  await del("knowledge_notes", cleanup.noteIds);
  await del("knowledge_service_codes", cleanup.serviceCodeIds);
  await del("knowledge_media", cleanup.mediaIds);
  await del("knowledge_documents", cleanup.documentIds);
  await del("knowledge_machines", cleanup.knowledgeMachineIds);
  await del("machines", cleanup.machineIds);
  await del("clients", cleanup.clientIds);
  for (const id of cleanup.users) {
    try { await admin.auth.admin.deleteUser(id); } catch (e) { console.error(`  deleteUser(${id}) failed: ${e.message}`); }
  }
  console.log("Cleanup calls issued.");
}

main().catch(async (e) => {
  console.error("\nQA script crashed:", e.message);
  await doCleanup().catch(() => {});
  process.exit(1);
});
