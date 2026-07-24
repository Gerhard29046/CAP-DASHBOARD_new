const test = require("node:test");
const assert = require("node:assert/strict");
const { isOAuthStateValid, isDisplayEnabled } = require("../lib/googleCalendarStore");

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
