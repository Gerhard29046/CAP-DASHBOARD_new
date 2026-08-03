import { createClient } from "@supabase/supabase-js";

// Supabase client for browser use only. Uses the publishable/anon key, which is safe to
// expose client-side and is constrained by Row Level Security policies (see
// supabase/migrations/*.sql). Never import the service_role/secret key here.
//
// This module is additive during the Firebase -> Supabase migration: it does not replace
// frontend/src/lib/firebase.js yet. See docs/ai-memory/DECISIONS.md for migration phase status.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missing = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean);

if (missing.length) {
  throw new Error(`Missing Supabase configuration: ${missing.join(", ")}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
