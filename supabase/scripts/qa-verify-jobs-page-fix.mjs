#!/usr/bin/env node
// Scripted QA for the Jobs.jsx fix (2026-08-13): mirrors loadJobs()'s exact fetch+join
// logic against real Supabase to confirm client/machine resolve correctly instead of
// "Unknown Client"/"Unknown Machine". Creates + fully cleans up throwaway fixture data.

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
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const results = [];
const record = (name, pass, detail = "") => { results.push({ name, pass }); console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`); };

const { data: client } = await admin.from("clients").insert({ company_name: "QA Jobs Fixture Client (delete me)" }).select().single();
const { data: machine } = await admin.from("machines").insert({ client_id: client.id, brand: "QA Brand", model: "QA Model", serial_number: "SN-QA-1" }).select().single();
const { data: job } = await admin.from("job_cards").insert({ client_id: client.id, machine_id: machine.id, status: "Open", job_number: "JOB-QA-JOBSPAGE", technician_name: "QA Tech", date_received: "2026-08-13" }).select().single();

// Exact mirror of Jobs.jsx's fixed loadJobs()
const { data: jobs } = await admin.from("job_cards").select("*");
const { data: clients } = await admin.from("clients").select("*");
const { data: machines } = await admin.from("machines").select("*");
const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
const machineById = Object.fromEntries(machines.map((m) => [m.id, m]));
const joined = jobs.map((j) => ({ ...j, client: j.client_id ? clientById[j.client_id] : null, machine: j.machine_id ? machineById[j.machine_id] : null }));

const found = joined.find((j) => j.id === job.id);
record("Job resolves to a real client (not Unknown Client)", found?.client?.company_name === "QA Jobs Fixture Client (delete me)", found?.client?.company_name);
record("Job resolves to a real machine (not Unknown Machine)", found?.machine?.brand === "QA Brand" && found?.machine?.model === "QA Model", `${found?.machine?.brand} ${found?.machine?.model}`);
record("Serial number present via joined machine", found?.machine?.serial_number === "SN-QA-1");
record("Technician name present on job row directly", found?.technician_name === "QA Tech");
record("Status present on job row directly", found?.status === "Open");
record("Date received present on job row directly", found?.date_received === "2026-08-13");

// Confirm the route Jobs.jsx would navigate to actually resolves to this job in JobCardDetail's own fetch path
const { data: viaDetailRoute } = await admin.from("job_cards").select("*").eq("id", job.id).single();
record("JobCardDetail-style single fetch resolves the same job by id (route target is correct)", viaDetailRoute?.id === job.id);

await admin.from("job_cards").delete().eq("id", job.id);
await admin.from("machines").delete().eq("id", machine.id);
await admin.from("clients").delete().eq("id", client.id);
console.log("\nCleanup complete.");

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
