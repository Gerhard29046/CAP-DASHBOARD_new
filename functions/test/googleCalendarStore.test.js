const test = require("node:test");
const assert = require("node:assert/strict");
const { isOAuthStateValid } = require("../lib/googleCalendarStore");

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
