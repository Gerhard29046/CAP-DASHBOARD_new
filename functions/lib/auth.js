// Full Supabase cutover, 2026-08-13 (explicit user instruction: "get every single thing
// off firebase... user auth, records. everything"). This file used to route between two
// verification branches based on a bearer token's issuer claim -- Firebase ID tokens
// (original implementation, Firebase Admin + Firestore users/{uid}) or Supabase JWTs
// (lib/supabaseAuth.js's verifySupabaseUser(), added 2026-08-06 for the now-removed Google
// Calendar functions). The Firebase branch and its issuer-detection logic are removed --
// every caller now authenticates via Supabase exclusively, so requireUser() just delegates
// directly. See git history before this change if the Firebase branch is ever needed again.
const supabaseAuth = require("./supabaseAuth");

/**
 * Verifies the bearer token on the request and loads the caller's CAP Dashboard user
 * profile via Supabase Auth + Postgres public.users.
 *
 * Throws an object with { status, message } (safe, generic message - never the raw
 * verification error) that callers should turn into an HTTP response.
 */
async function requireUser(req) {
  const header = req.get("Authorization") || req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw { status: 401, message: "Unauthorized" };
  }
  return supabaseAuth.verifySupabaseUser(match[1]);
}

function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return (user.effectivePermissions || []).includes(key);
}

function hasAnyPermission(user, keys) {
  return keys.some((key) => hasPermission(user, key));
}

/**
 * Sends the Laravel-equivalent 403 Forbidden response shape when the user
 * lacks `key`. Returns true if the caller may proceed, false if a response
 * was already sent (caller must stop processing immediately).
 */
function requirePermission(user, key, res) {
  if (hasPermission(user, key)) return true;
  res.status(403).json({ message: "Forbidden", required_permission: key });
  return false;
}

module.exports = { requireUser, hasPermission, hasAnyPermission, requirePermission };
