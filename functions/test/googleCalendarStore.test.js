const test = require("node:test");
const assert = require("node:assert/strict");
const { isOAuthStateValid, isDisplayEnabled, computeStatusCode } = require("../lib/googleCalendarStore");

// --- computeStatusCode ------------------------------------------------------

test("computeStatusCode: null connection is disconnected", () => {
  assert.equal(computeStatusCode(null), "disconnected");
});

test("computeStatusCode: isActive false is disconnected even with other fields set", () => {
  assert.equal(computeStatusCode({ isActive: false, selectedCalendarIds: ["cal-1"] }), "disconnected");
});

test("computeStatusCode: active with no calendars selected is calendar_selection_required", () => {
  assert.equal(computeStatusCode({ isActive: true, selectedCalendarIds: [] }), "calendar_selection_required");
});

test("computeStatusCode: active with calendars selected and no error is connected", () => {
  assert.equal(computeStatusCode({ isActive: true, selectedCalendarIds: ["cal-1"] }), "connected");
});

test("computeStatusCode: reauth_required lastErrorCode wins even with calendars selected", () => {
  assert.equal(
    computeStatusCode({ isActive: true, selectedCalendarIds: ["cal-1"], lastErrorCode: "reauth_required" }),
    "reauth_required",
  );
});

test("computeStatusCode: api_error lastErrorCode maps to connection_error, not reauth", () => {
  assert.equal(
    computeStatusCode({ isActive: true, selectedCalendarIds: ["cal-1"], lastErrorCode: "api_error" }),
    "connection_error",
  );
});

// --- isDisplayEnabled ------------------------------------------------------

test("isDisplayEnabled: defaults true for a connection with no displayEnabled field", () => {
  assert.equal(isDisplayEnabled({ isActive: true }), true);
});

test("isDisplayEnabled: true when explicitly set true", () => {
  assert.equal(isDisplayEnabled({ isActive: true, displayEnabled: true }), true);
});

test("isDisplayEnabled: false when explicitly set false", () => {
  assert.equal(isDisplayEnabled({ isActive: true, displayEnabled: false }), false);
});

test("isDisplayEnabled: defaults true for a null connection", () => {
  assert.equal(isDisplayEnabled(null), true);
});

function timestamp(millis) {
  return { toMillis: () => millis };
}

test("isOAuthStateValid: unknown state (null stateData) is invalid", () => {
  const result = isOAuthStateValid(null, Date.now());
  assert.deepEqual(result, { valid: false, uid: null });
});

test("isOAuthStateValid: already-consumed state is invalid", () => {
  const now = Date.now();
  const result = isOAuthStateValid(
    { uid: "user-1", expiresAt: timestamp(now + 60000), consumedAt: timestamp(now - 1000) },
    now,
  );
  assert.deepEqual(result, { valid: false, uid: null });
});

test("isOAuthStateValid: expired state (expiresAt in the past) is invalid", () => {
  const now = Date.now();
  const result = isOAuthStateValid(
    { uid: "user-1", expiresAt: timestamp(now - 1000), consumedAt: null },
    now,
  );
  assert.deepEqual(result, { valid: false, uid: null });
});

test("isOAuthStateValid: missing expiresAt is invalid", () => {
  const result = isOAuthStateValid({ uid: "user-1", expiresAt: null, consumedAt: null }, Date.now());
  assert.deepEqual(result, { valid: false, uid: null });
});

test("isOAuthStateValid: future expiresAt and null consumedAt is valid", () => {
  const now = Date.now();
  const result = isOAuthStateValid(
    { uid: "user-1", expiresAt: timestamp(now + 60000), consumedAt: null },
    now,
  );
  assert.deepEqual(result, { valid: true, uid: "user-1" });
});
