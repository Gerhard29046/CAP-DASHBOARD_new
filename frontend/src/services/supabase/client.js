import { createClient } from "@supabase/supabase-js";

// Supabase client for browser use only. Uses the publishable/anon key, which is safe to
// expose client-side and is constrained by Row Level Security policies (see
// supabase/migrations/*.sql). Never import the service_role/secret key here.
//
// Full Supabase cutover, 2026-08-13 -- this is now the app's only data/auth client.
// frontend/src/lib/firebase.js was deleted entirely.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let realClient = null;
function getRealClient() {
  if (realClient) return realClient;
  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL",
    !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing Supabase configuration: ${missing.join(", ")}`);
  }
  realClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return realClient;
}

// Lazy proxy (2026-08-06, Phase 3 prep): the real Supabase client -- and this file's
// fail-fast env-var check above -- is only actually constructed on first real property
// access (e.g. `supabase.auth`), not at module-import time. This lets `apiClient.js`'s
// VITE_AUTH_BACKEND routing statically import supabaseApiClient.js (and everything it
// pulls in, including this file) unconditionally, without risking a crash in the default
// "firebase" backend just because Supabase env vars happen to be missing in some
// environment -- the error is deferred to the moment Supabase is actually used, exactly
// like before, just later. Every existing consumer (`auth.js`/`database.js`/`storage.js`/
// `entities.js`/`supabaseApiClient.js`/`SupabaseAuthContext.jsx`) already does
// `supabase.<method>(...)` inline and needs zero changes.
export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getRealClient()[prop];
  },
});
