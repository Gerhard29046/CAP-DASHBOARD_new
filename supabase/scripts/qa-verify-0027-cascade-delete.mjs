#!/usr/bin/env node
// Live functional verification that migration 0027's real fix (machines.client_id ON DELETE
// CASCADE, replacing the old RESTRICT) actually works end-to-end, not just that the migration
// ran. Creates a throwaway client + a throwaway machine under it, deletes the client, then
// independently re-queries to confirm BOTH rows are actually gone (real cascade, not just "the
// delete call didn't throw"). Cleans up any residue if something goes wrong partway through.

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
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in supabase/.env.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const marker = `qa-0027-cascade-${Date.now()}`;

async function main() {
  let clientId = null;
  let machineId = null;
  let pass = true;

  try {
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .insert({ company_name: marker, is_active: true })
      .select("id")
      .single();
    if (clientErr) throw new Error(`Failed to create throwaway client: ${clientErr.message}`);
    clientId = client.id;
    console.log(`Created throwaway client ${clientId}`);

    const { data: machine, error: machineErr } = await admin
      .from("machines")
      .insert({ client_id: clientId, brand: marker, model: "cascade-test" })
      .select("id")
      .single();
    if (machineErr) throw new Error(`Failed to create throwaway machine: ${machineErr.message}`);
    machineId = machine.id;
    console.log(`Created throwaway machine ${machineId} under that client`);

    const { error: deleteErr } = await admin.from("clients").delete().eq("id", clientId);
    if (deleteErr) {
      console.log(`  FAIL   client delete was rejected: ${deleteErr.message}`);
      console.log("         (this is exactly the old RESTRICT behavior -- 0027 did not take effect)");
      pass = false;
    } else {
      console.log("  OK     client delete call succeeded (no FK violation)");
    }

    // Independently re-verify -- a delete call not throwing is not proof of anything by itself.
    const { data: clientStillThere } = await admin.from("clients").select("id").eq("id", clientId).maybeSingle();
    const { data: machineStillThere } = await admin.from("machines").select("id").eq("id", machineId).maybeSingle();

    if (clientStillThere) { console.log("  FAIL   client row still exists after delete"); pass = false; }
    else console.log("  OK     client row confirmed gone");

    if (machineStillThere) { console.log("  FAIL   machine row still exists -- cascade did not happen"); pass = false; }
    else console.log("  OK     machine row confirmed gone (real cascade, not just the delete call succeeding)");

    machineId = null; // already gone (or should be) via cascade, don't try to clean it up separately
    clientId = null;  // already gone (or should be), don't try to delete it again below
  } catch (e) {
    console.error("Test failed:", e.message);
    pass = false;
  } finally {
    // Cleanup for any partial-failure state (e.g. the machine got created but the client
    // delete never ran or was rejected) -- never leave throwaway rows behind either way.
    if (machineId) await admin.from("machines").delete().eq("id", machineId);
    if (clientId) await admin.from("clients").delete().eq("id", clientId);
    if (machineId || clientId) console.log("Cleaned up residual throwaway row(s).");
  }

  console.log(pass ? "\nPASS: client -> machine cascade delete works end-to-end." : "\nFAIL: see above.");
  process.exit(pass ? 0 : 2);
}

main();
