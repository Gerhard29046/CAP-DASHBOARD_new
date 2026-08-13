#!/usr/bin/env node
// Temporary QA helper (2026-08-07, Phase 3 manual verification). Logs in as the throwaway
// admin-equivalent QA test user (created by qa-test-user.mjs) using the ANON key (the same
// client-side auth path the real frontend uses), then exercises the exact same
// read/write/list/filter calls frontend/src/services/supabase/database.js + entities.js +
// supabaseApiClient.js make for every page in the app.
//
// The Google Calendar Cloud Function check (issuer-routed Supabase-session auth) was removed
// 2026-08-12 along with the rest of Google Calendar sync (see CLAUDE.md section 7 / DECISIONS.md
// — cost decision). That check is gone, not skipped, since the function it tested no longer
// exists.
//
// Does NOT touch any real business data -- all writes are to throwaway rows created and
// deleted by this script, tagged distinctively so they're easy to spot if cleanup ever
// fails partway.
//
// Usage: node scripts/qa-clickthrough.mjs <email> <password>

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
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in supabase/.env");
  process.exit(1);
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/qa-clickthrough.mjs <email> <password>");
  process.exit(1);
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"} - ${name}${detail ? `: ${detail}` : ""}`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listRows(table, filters = {}) {
  let query = supabase.from(table).select("*");
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function main() {
  console.log("=== Sign in as QA test user (mirrors AuthContext.jsx's Supabase branch) ===");
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    record("sign in with password", false, signInError.message);
    printSummary();
    process.exit(1);
  }
  record("sign in with password", true, `uid=${signInData.user.id}`);

  console.log("\n=== auth.me() equivalent: load own profile (used by AuthContext on every page) ===");
  try {
    const { data: profile, error } = await supabase.from("users").select("*").eq("id", signInData.user.id).single();
    if (error) throw error;
    record("load own profile", profile.role === "admin" && profile.is_active === true, `role=${profile.role}, is_active=${profile.is_active}`);
  } catch (e) {
    record("load own profile", false, e.message);
  }

  console.log("\n=== List reads: every page's primary data source ===");
  const tables = [
    ["clients", "Clients.jsx / Dashboard"],
    ["machines", "Machines.jsx / MachineDetail.jsx"],
    ["service_records", "ServiceRecords.jsx"],
    ["job_cards", "Jobs.jsx / BookIn.jsx / InvoiceQueue.jsx"],
    ["job_card_lines", "JobCardDetail.jsx"],
    ["sites", "Site-related views (no Firestore source, expected empty)"],
    ["users", "UserManagement.jsx (admin-only)"],
    ["knowledge_machines", "KnowledgeBase.jsx"],
    ["knowledge_notes", "KnowledgeMachineDetail.jsx"],
    ["knowledge_service_codes", "KnowledgeMachineDetail.jsx"],
    ["knowledge_media", "KnowledgeMachineDetail.jsx"],
    ["knowledge_documents", "KnowledgeMachineDetail.jsx"],
    ["permissions", "UserManagement.jsx permission editor"],
    ["role_permissions", "UserManagement.jsx permission editor"],
    ["notifications", "Notification bell/dropdown"],
  ];
  for (const [table, page] of tables) {
    try {
      const rows = await listRows(table);
      record(`list ${table} (${page})`, true, `${rows.length} rows`);
    } catch (e) {
      record(`list ${table} (${page})`, false, e.message);
    }
  }

  console.log("\n=== CRUD write test: create + read-back + update + delete a throwaway client ===");
  let testClientId = null;
  try {
    const { data, error } = await supabase
      .from("clients")
      .insert({ company_name: "PHASE3-QA-CLICKTHROUGH-TEST-DELETE-ME" })
      .select()
      .single();
    if (error) throw error;
    testClientId = data.id;
    record("create client", true, `id=${testClientId}`);
  } catch (e) {
    record("create client", false, e.message);
  }

  if (testClientId) {
    try {
      const { data, error } = await supabase.from("clients").select("*").eq("id", testClientId).single();
      if (error) throw error;
      record("read back created client", data.company_name === "PHASE3-QA-CLICKTHROUGH-TEST-DELETE-ME", data.company_name);
    } catch (e) {
      record("read back created client", false, e.message);
    }

    try {
      const { data, error } = await supabase
        .from("clients")
        .update({ contact_person: "QA Test Contact" })
        .eq("id", testClientId)
        .select()
        .single();
      if (error) throw error;
      record("update client", data.contact_person === "QA Test Contact", data.contact_person);
    } catch (e) {
      record("update client", false, e.message);
    }

    try {
      const { error } = await supabase.from("clients").delete().eq("id", testClientId);
      if (error) throw error;
      record("delete client", true);
    } catch (e) {
      record("delete client (MANUAL CLEANUP MAY BE NEEDED)", false, `id=${testClientId}: ${e.message}`);
    }
  }

  console.log("\n=== knowledge-service-codes/:id/reveal equivalent (only meaningful if rows exist) ===");
  try {
    const codes = await listRows("knowledge_service_codes");
    if (codes.length === 0) {
      record("knowledge_service_codes reveal", true, "skipped, 0 real rows to test against");
    } else {
      const { data, error } = await supabase.from("knowledge_service_codes").select("service_code").eq("id", codes[0].id).single();
      if (error) throw error;
      record("knowledge_service_codes reveal", typeof data.service_code !== "undefined", `service_code field present`);
    }
  } catch (e) {
    record("knowledge_service_codes reveal", false, e.message);
  }

  console.log("\n=== calendar/events equivalent (service-record-derived events, no Google) ===");
  try {
    const [services, machines, clients] = await Promise.all([
      listRows("service_records"),
      listRows("machines"),
      listRows("clients"),
    ]);
    record("calendar events data sources readable", true, `services=${services.length} machines=${machines.length} clients=${clients.length}`);
  } catch (e) {
    record("calendar events data sources readable", false, e.message);
  }

  console.log("\n=== Sign out ===");
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    record("sign out", true);
  } catch (e) {
    record("sign out", false, e.message);
  }

  printSummary();
}

function printSummary() {
  console.log("\n=== Summary ===");
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"} - ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
  if (failed.length > 0) {
    console.log(`\n${failed.length} check(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll checks passed.");
  }
}

main().catch((e) => {
  console.error("Unexpected script error:", e);
  process.exit(1);
});
