const crypto = require("crypto");
const { db, admin } = require("./firebaseAdmin");

const CONNECTION_DOC_PATH = ["system_integrations", "google_calendar"];
const OAUTH_STATES_COLLECTION = "google_calendar_oauth_states";
const STATE_TTL_MINUTES = 10;

function connectionRef() {
  return db.collection(CONNECTION_DOC_PATH[0]).doc(CONNECTION_DOC_PATH[1]);
}

function hashState(rawState) {
  return crypto.createHash("sha256").update(rawState).digest("hex");
}

/** Returns the raw connection doc regardless of active flag, or null if none exists. */
async function getConnectionRaw() {
  const snapshot = await connectionRef().get();
  if (!snapshot.exists) return null;
  return snapshot.data() || {};
}

async function getConnection() {
  const data = await getConnectionRaw();
  if (!data || data.isActive !== true) return null;
  return data;
}

/** Creates/replaces the single connection document. */
async function upsertConnection(fields) {
  await connectionRef().set(
    {
      ...fields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return getConnectionRaw();
}

async function updateConnection(fields) {
  await connectionRef().set(
    {
      ...fields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function clearConnection() {
  await connectionRef().set(
    {
      isActive: false,
      accessToken: null,
      refreshToken: null,
      googleAccountId: null,
      googleAccountName: null,
      googleAccountEmail: null,
      tokenExpiresAtMillis: null,
      scopes: [],
      selectedCalendarIds: [],
      lastError: null,
      lastErrorCode: null,
      displayEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Pure: whether Google events should be displayed dashboard-wide. Defaults true when unset. */
function isDisplayEnabled(connection) {
  return connection?.displayEnabled !== false;
}

async function setDisplayEnabled(enabled) {
  await updateConnection({ displayEnabled: Boolean(enabled) });
  return getConnectionRaw();
}

/**
 * Records a Google API/token failure against the connection. `code` must be
 * `"reauth_required"` (the refresh token is missing or Google rejected it -
 * only Reconnect can fix this) or `"api_error"` (a transient/unrelated
 * failure - e.g. a disabled API, quota, or network error - that must NOT be
 * presented to the admin as "reconnect required").
 */
async function recordError(code, message) {
  await updateConnection({ lastErrorCode: code, lastError: message });
}

async function clearError() {
  await updateConnection({ lastErrorCode: null, lastError: null });
}

/**
 * Single source of truth for the connection's user-facing status. Pure
 * function of the stored connection doc - every caller (the status
 * endpoint, the events endpoint, tests) derives its messaging from this one
 * value instead of separately inspecting `isActive`/`lastError`/
 * `selectedCalendarIds`, which is what previously let "Connected" and
 * "must be reconnected" render at the same time.
 */
function computeStatusCode(connection) {
  if (!connection || connection.isActive !== true) return "disconnected";
  if (connection.lastErrorCode === "reauth_required") return "reauth_required";
  if (connection.lastErrorCode === "api_error") return "connection_error";
  if (!(connection.selectedCalendarIds || []).length) return "calendar_selection_required";
  return "connected";
}

/** Creates a new OAuth state, storing only its sha256 hash - never the raw value. */
async function createOAuthState(rawState, uid) {
  const stateHash = hashState(rawState);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + STATE_TTL_MINUTES * 60 * 1000);
  await db.collection(OAUTH_STATES_COLLECTION).doc(stateHash).set({
    uid,
    expiresAt,
    consumedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return stateHash;
}

/** Opportunistically deletes expired oauth state docs (best-effort, non-blocking). */
async function pruneExpiredOAuthStates() {
  try {
    const now = admin.firestore.Timestamp.now();
    const expired = await db.collection(OAUTH_STATES_COLLECTION).where("expiresAt", "<", now).limit(50).get();
    if (expired.empty) return;
    const batch = db.batch();
    expired.docs.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
    await batch.commit();
  } catch (error) {
    console.error("Failed to prune expired Google OAuth states", error);
  }
}

/**
 * Pure decision logic for whether a fetched OAuth state document is still
 * usable: unknown (`stateData` null), already consumed, or expired states
 * are all invalid. `stateData` holds already-fetched Firestore field values
 * (`expiresAt`/`consumedAt` are Firestore Timestamps exposing `.toMillis()`,
 * or null). `nowMillis` is injected so this stays pure/testable.
 */
function isOAuthStateValid(stateData, nowMillis) {
  if (!stateData) return { valid: false, uid: null };
  if (stateData.consumedAt) return { valid: false, uid: null };
  const expiresAt = stateData.expiresAt;
  if (!expiresAt || expiresAt.toMillis() < nowMillis) return { valid: false, uid: null };
  return { valid: true, uid: stateData.uid || null };
}

/**
 * Atomically validates and consumes an OAuth state. Returns the stored uid on
 * success, or null if the state is unknown, already consumed, or expired.
 */
async function consumeOAuthState(rawState) {
  const stateHash = hashState(rawState);
  const ref = db.collection(OAUTH_STATES_COLLECTION).doc(stateHash);
  try {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() || {} : null;
      const { valid, uid } = isOAuthStateValid(data, Date.now());
      if (!valid) return null;
      transaction.update(ref, { consumedAt: admin.firestore.FieldValue.serverTimestamp() });
      return uid;
    });
  } catch (error) {
    console.error("Failed to consume Google OAuth state", error);
    return null;
  }
}

module.exports = {
  getConnection,
  getConnectionRaw,
  upsertConnection,
  updateConnection,
  clearConnection,
  isDisplayEnabled,
  setDisplayEnabled,
  recordError,
  clearError,
  computeStatusCode,
  createOAuthState,
  pruneExpiredOAuthStates,
  consumeOAuthState,
  isOAuthStateValid,
};
