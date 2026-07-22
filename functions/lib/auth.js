const { admin, db } = require("./firebaseAdmin");

/**
 * Verifies the bearer token on the request and loads the caller's CAP
 * Dashboard user profile (users/{uid} in the "capdashboard" database).
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
