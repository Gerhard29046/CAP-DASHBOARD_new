#!/usr/bin/env node
// Live proof for the 2026-08-18 ClientDetail.jsx "Edit Client" bug: apiClient.entities.
// Client.get() (see supabaseApiClient.js's clientEntity.get override) stamps a synthetic
// `machines` array onto every client record it returns (this client's joined machine list --
// not a real column on public.clients, confirmed against 0001_initial_schema.sql: id/
// company_name/contact_person/email/phone/address/notes/is_active/created_at/updated_at only).
// ClientDetail.jsx's EditClientForm used to seed its form state as `{ ...initial }`, so every
// "Save Changes" click sent `machines: [...]` straight through to the update payload --
// PostgREST rejects an update outright on any unknown column, so editing a client's own
// details (not adding a machine -- editing the client record itself) was failing on every
// single save in production.
//
// This script proves both halves against real PostgREST (service-role client, same schema-
// cache-rejection behavior applies regardless of which role sends the request -- this is a
// column-existence check, not an RLS check, so a service-role client is a faithful proxy for
// what any authenticated client would hit):
//   1. The OLD payload shape (spread client + machines array) genuinely fails.
//   2. The FIX -- supabaseApiClient.js's clientEntity.update() now strips `machines`, and
//      ClientDetail.jsx's EditClientForm now seeds only real columns -- genuinely succeeds and
//      persists.
//   3. A full related-record flow (client -> machine -> service record) still works after the
//      fix, proving the relationship/FK chain itself was never broken by this bug.
// Creates + fully cleans up throwaway data.

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
      const i = t.indexOf("=");
      if (i === -1) continue;
      env[t.slice(0, i)] = t.slice(i + 1);
    }
  } catch { /* no .env */ }
  return env;
}
const fileEnv = loadEnv(join(__dirname, "..", ".env"));
const admin = createClient(
  process.env.SUPABASE_URL || fileEnv.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY
);

const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
};

const { data: client, error: createErr } = await admin
  .from("clients")
  .insert({ company_name: "QA ClientDetail Save-Fix Client (delete me)", contact_person: "Original Contact" })
  .select()
  .single();
record("Setup: throwaway client created", !createErr && !!client, createErr?.message);

const { data: machine } = await admin
  .from("machines")
  .insert({ client_id: client.id, brand: "QA", model: "Save-Fix Unit" })
  .select()
  .single();
record("Setup: throwaway machine created (client->machine FK)", !!machine);

// 1. Reproduce the OLD bug: fetch the client the way clientEntity.get() used to hand it to
// the form (client fields + a synthetic `machines` array), then attempt the update the OLD
// EditClientForm would have sent -- the whole spread object, unfiltered.
const machinesJoined = [machine];
const oldBuggyPayload = {
  ...client,
  machines: machinesJoined,
  contact_person: "Updated Contact (old buggy path)",
};
const { error: buggyUpdateErr } = await admin
  .from("clients")
  .update(oldBuggyPayload)
  .eq("id", client.id)
  .select()
  .single();
record(
  "Reproduces the reported bug: update WITH the synthetic `machines` field genuinely fails",
  !!buggyUpdateErr,
  buggyUpdateErr?.message || "unexpectedly succeeded"
);

// 2. The fix: clientEntity.update() now strips `machines` before writing (defensive layer),
// and EditClientForm now only ever seeds real columns in the first place. Simulate the
// stripped payload exactly as supabaseApiClient.js's clientEntity.update() now produces it.
const { machines: _stripped, ...fixedPayload } = oldBuggyPayload;
const { data: fixedResult, error: fixedErr } = await admin
  .from("clients")
  .update(fixedPayload)
  .eq("id", client.id)
  .select()
  .single();
record("Fix: update WITHOUT the synthetic field succeeds", !fixedErr, fixedErr?.message);

const { data: refetched } = await admin.from("clients").select("*").eq("id", client.id).single();
record(
  "Fix: the edit genuinely persists (re-fetched, not just the write response)",
  refetched?.contact_person === "Updated Contact (old buggy path)",
  `got "${refetched?.contact_person}"`
);

// 3. Confirm the relationship chain itself (client -> machine -> service record) still works
// end-to-end after the fix -- this was never actually broken by the bug above, but worth
// proving explicitly since the user asked to confirm "database relationships work."
const { data: serviceRecord, error: serviceErr } = await admin
  .from("service_records")
  .insert({ machine_id: machine.id, service_date: "2026-08-18", technician_name: "QA Tech" })
  .select()
  .single();
record("Relationship chain: service_record created against the machine", !serviceErr && !!serviceRecord, serviceErr?.message);

const { data: machineWithClient } = await admin
  .from("machines")
  .select("*, service_records(*)")
  .eq("id", machine.id)
  .single();
record(
  "Relationship chain: machine correctly resolves back to its client_id and its service record",
  machineWithClient?.client_id === client.id && machineWithClient?.service_records?.length === 1
);

// Cleanup
await admin.from("service_records").delete().eq("machine_id", machine.id);
await admin.from("machines").delete().eq("id", machine.id);
await admin.from("clients").delete().eq("id", client.id);
const { data: residualClient } = await admin.from("clients").select("id").eq("id", client.id).maybeSingle();
record("Cleanup: throwaway client fully removed", !residualClient);
console.log("\nCleanup complete.");

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
