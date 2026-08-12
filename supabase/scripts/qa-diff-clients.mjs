#!/usr/bin/env node
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
const { data, error } = await supabase.from("clients").select("id, company_name, legacy_firestore_id, created_at").order("created_at");
if (error) { console.error(error); process.exit(1); }
console.log(JSON.stringify(data, null, 2));
