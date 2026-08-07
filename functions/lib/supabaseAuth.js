const { defineSecret, defineString } = require("firebase-functions/params");
const { createClient } = require("@supabase/supabase-js");

// @supabase/supabase-js's createClient() unconditionally constructs a Realtime client
// internally (even though this module never uses realtime -- only .auth.getUser() and
// .from().select()), which requires a global `WebSocket` constructor. Node 22+ has this
// natively; this project's Cloud Functions runtime is pinned to Node 20 (see
// functions/package.json's "engines"), which does not -- confirmed live 2026-08-06 via a
// real deployed-function 500 ("Node.js detected but native WebSocket not found"), not
// caught by local testing because the local dev machine runs a newer Node version with a
// native WebSocket global. Polyfilling with the `ws` package (already a transitive
// dependency of several packages in this tree, now a direct one) is the standard fix.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = require("ws");
}

// Supabase branch of requireUser() (functions/lib/auth.js), added 2026-08-06 per
// docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md. Verifies a Supabase-issued JWT
// server-side via supabase.auth.getUser(token), then loads role/effective_permissions/
// is_active from Postgres with a service-role client (RLS-bypassing by design -- this is
// trusted server-side code, the same trust level Firebase Admin already had for the
// Firestore branch). Returns the exact same { uid, role, effectivePermissions } shape
// requireUser() already returns for the Firebase branch, so no call site in
// functions/index.js needs to change.

// Not secret (the project URL is not sensitive), but defined as a param for consistency
// with the existing GOOGLE_CALENDAR_CLIENT_ID/_SECRET pattern (functions/lib/
// googleOAuthClient.js) and so it can be overridden per-environment without a code change.
const SUPABASE_URL = defineString("SUPABASE_URL", {
  default: "https://cjvrquipmnoihksijful.supabase.co",
});
const SUPABASE_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SERVICE_ROLE_KEY");

const SUPABASE_ISSUER_SUFFIX = "/auth/v1";

let cachedClient = null;
function getServiceRoleClient() {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(SUPABASE_URL.value(), SUPABASE_SERVICE_ROLE_KEY.value(), {
    auth: { persistSession: false },
  });
  return cachedClient;
}

/**
 * True if `iss` (a JWT's decoded, NOT signature-verified, issuer claim) matches this
 * project's Supabase Auth issuer. Confirmed live 2026-08-06 against a real Supabase
 * session JWT: "https://<project-ref>.supabase.co/auth/v1".
 */
function isSupabaseIssuer(iss) {
  if (!iss) return false;
  return iss === `${SUPABASE_URL.value()}${SUPABASE_ISSUER_SUFFIX}`;
}

/**
 * Verifies a Supabase bearer token and loads the caller's CAP Dashboard profile from
 * Postgres. Throws the same { status, message } shape requireUser()'s Firebase branch
 * throws, for identical error handling at every call site.
 */
async function verifySupabaseUser(token) {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    console.error("Supabase getUser failed", error);
    throw { status: 401, message: "Unauthorized" };
  }
  const uid = data.user.id;

  let profile;
  try {
    const { data: row, error: profileError } = await supabase
      .from("users")
      .select("role, effective_permissions, is_active")
      .eq("id", uid)
      .maybeSingle();
    if (profileError) throw profileError;
    profile = row;
  } catch (profileError) {
    console.error("Failed to load Supabase user profile", profileError);
    throw { status: 500, message: "Unable to load user profile." };
  }

  if (!profile) {
    throw { status: 403, message: "Forbidden" };
  }
  if (!profile.is_active) {
    throw { status: 403, message: "Forbidden" };
  }

  const rawPermissions = profile.effective_permissions ?? [];
  const effectivePermissions = Array.isArray(rawPermissions) ? rawPermissions : [];

  return { uid, role: profile.role || null, effectivePermissions };
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  isSupabaseIssuer,
  verifySupabaseUser,
  // Exported for testability only (mocking .auth.getUser/.from in supabaseAuth.test.js) --
  // not intended for use outside this module otherwise.
  getServiceRoleClient,
};
