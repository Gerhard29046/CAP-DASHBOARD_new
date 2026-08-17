#!/usr/bin/env node
// Read-only report of every auth user whose email matches this project's own throwaway-QA
// pattern (@invalid.local, or containing "qa-"), cross-referenced with public.users. Deletes
// nothing. For Priority-1 item 4 of the 2026-08-17 work order.
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
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let allUsers = [];
let page = 1;
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  allUsers = allUsers.concat(data.users);
  if (data.users.length < 200) break;
  page++;
}

console.log(`Total Supabase Auth users: ${allUsers.length}\n`);

const { data: publicUsers, error: puErr } = await admin.from("users").select("id, email, full_name, role, is_active");
if (puErr) throw puErr;
const publicById = new Map(publicUsers.map(u => [u.id, u]));

console.log("=== Full account list (Auth ID | email | public.users match | role | active) ===");
for (const u of allUsers) {
  const pu = publicById.get(u.id);
  const suspect = /invalid\.local|qa-|test/i.test(u.email || "");
  console.log(`${suspect ? "[SUSPECT QA]" : "           "} ${u.id}  ${(u.email||"").padEnd(55)} public.users:${pu ? `${pu.role}/${pu.is_active}` : "NONE"}`);
}

console.log("\n=== Suspected throwaway QA accounts only ===");
const suspects = allUsers.filter(u => /invalid\.local|qa-|test/i.test(u.email || ""));
for (const u of suspects) {
  const pu = publicById.get(u.id);
  console.log(JSON.stringify({
    email: u.email,
    auth_id: u.id,
    public_users_id: pu?.id ?? null,
    full_name: pu?.full_name ?? null,
    role: pu?.role ?? null,
    is_active: pu?.is_active ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }, null, 2));
}
console.log(`\n${suspects.length} suspected throwaway account(s). NONE deleted — deletion requires explicit user approval.`);
