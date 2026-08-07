const { admin, db } = require("./firebaseAdmin");
// Referenced via the module object (not destructured) below, deliberately -- matches how
// `admin`/`db` are already used elsewhere in this file, and lets tests mock
// supabaseAuth.isSupabaseIssuer/verifySupabaseUser in place (see test/auth.test.js).
// Destructuring these into local consts here would capture the original functions
// permanently at require-time, before any test-time mock could take effect.
const supabaseAuth = require("./supabaseAuth");

/**
 * Decodes (WITHOUT verifying the signature) a JWT's payload to read its `iss` claim, used
 * only to route to the correct verification branch below -- the token is still fully
 * verified afterwards, either by admin.auth().verifyIdToken() (Firebase branch) or
 * supabase.auth.getUser() (Supabase branch), both of which check the signature server-side.
 * Returns null for any malformed input rather than throwing -- an unrecognized issuer (or
 * a malformed token) simply falls through to the Firebase branch, which will then itself
 * reject it with the same 401 it always has.
 */
function decodeJwtIssuer(token) {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, "base64").toString("utf8");
    return JSON.parse(json).iss || null;
  } catch {
    return null;
  }
}

/**
 * Verifies the bearer token on the request and loads the caller's CAP
 * Dashboard user profile.
 *
 * Added 2026-08-06 (see docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md): routes to one of
 * two verification branches based on the token's issuer -- Firebase ID tokens use the
 * original, unchanged path below (Firebase Admin + Firestore users/{uid}); Supabase JWTs
 * use lib/supabaseAuth.js's verifySupabaseUser() (Supabase Auth + Postgres public.users).
 * Both branches return the identical { uid, role, effectivePermissions } shape, so nothing
 * downstream of requireUser() (hasPermission/requirePermission/every call site in
 * index.js) needs to know or care which backend authenticated the caller. This lets both
 * auth backends work simultaneously against the same deployed functions for as long as
 * both exist -- the frontend's VITE_AUTH_BACKEND flag can flip independently of a Cloud
 * Functions redeploy, in either order.
 *
 * Throws an object with { status, message } (safe, generic message - never
 * the raw verification error) that callers should turn into an HTTP
 * response. Never resolves for an inactive/missing profile.
 */
async function requireUser(req) {
  const header = req.get("Authorization") || req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw { status: 401, message: "Unauthorized" };
  }
  const token = match[1];

  const issuer = decodeJwtIssuer(token);
  if (supabaseAuth.isSupabaseIssuer(issuer)) {
    return supabaseAuth.verifySupabaseUser(token);
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("verifyIdToken failed", error);
    throw { status: 401, message: "Unauthorized" };
  }

  const uid = decoded.uid;
  let snapshot;
  try {
    snapshot = await db.collection("users").doc(uid).get();
  } catch (error) {
    console.error("Failed to load user profile", error);
    throw { status: 500, message: "Unable to load user profile." };
  }

  if (!snapshot.exists) {
    throw { status: 403, message: "Forbidden" };
  }

  const data = snapshot.data() || {};
  const isActive = data.is_active ?? data.active ?? false;
  if (!isActive) {
    throw { status: 403, message: "Forbidden" };
  }

  const rawPermissions = data.effective_permissions ?? data.permissions ?? [];
  const effectivePermissions = Array.isArray(rawPermissions)
    ? rawPermissions
    : Object.entries(rawPermissions).filter(([, allowed]) => allowed).map(([key]) => key);

  return { uid, role: data.role || null, effectivePermissions };
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
