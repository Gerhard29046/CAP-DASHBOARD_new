#!/usr/bin/env node
// Temporary diagnostic (2026-08-07 cutover prep): checks whether the real migrated admin
// user has ever actually signed in / set a password, since this is critical before flipping
// production to Supabase auth (a still-passwordless account would lock everyone out).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}
const env = loadEnv(".env");
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.admin.listUsers();
if (error) { console.error(error); process.exit(1); }
const u = data.users.find((x) => x.email === "admin@connoisseurauto.co.za");
console.log(JSON.stringify({
  id: u.id,
  email: u.email,
  created_at: u.created_at,
  updated_at: u.updated_at,
  last_sign_in_at: u.last_sign_in_at,
  email_confirmed_at: u.email_confirmed_at,
  recovery_sent_at: u.recovery_sent_at,
}, null, 2));
