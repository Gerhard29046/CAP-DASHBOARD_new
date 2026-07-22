const test = require("node:test");
const assert = require("node:assert/strict");
const { admin, db } = require("../lib/firebaseAdmin");
const { requireUser, hasPermission, hasAnyPermission, requirePermission } = require("../lib/auth");

function fakeReq(headers) {
  return {
    get(name) {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : undefined;
    },
  };
}

function fakeSnapshot(exists, data) {
  return { exists, data: () => data };
}

test("requireUser: missing Authorization header rejects with 401", async () => {
  await assert.rejects(() => requireUser(fakeReq({})), (error) => {
    assert.equal(error.status, 401);
    return true;
  });
});

test("requireUser: malformed Authorization header (no Bearer prefix) rejects with 401", async () => {
  await assert.rejects(() => requireUser(fakeReq({ Authorization: "Token abc123" })), (error) => {
    assert.equal(error.status, 401);
    return true;
  });
});

test("requireUser: verifyIdToken failure rejects with 401", async (t) => {
  const authInstance = admin.auth();
  t.mock.method(authInstance, "verifyIdToken", async () => {
    throw new Error("invalid token");
  });

  await assert.rejects(() => requireUser(fakeReq({ Authorization: "Bearer bad-token" })), (error) => {
    assert.equal(error.status, 401);
    return true;
  });
});

test("requireUser: inactive user (is_active: false) rejects with 403", async (t) => {
  const authInstance = admin.auth();
  t.mock.method(authInstance, "verifyIdToken", async () => ({ uid: "user-1" }));
  t.mock.method(db, "collection", () => ({
    doc: () => ({
      get: async () => fakeSnapshot(true, { is_active: false, role: null }),
    }),
  }));

  await assert.rejects(() => requireUser(fakeReq({ Authorization: "Bearer good-token" })), (error) => {
    assert.equal(error.status, 403);
    return true;
  });
});

test("requireUser: inactive user (legacy active: false) rejects with 403", async (t) => {
  const authInstance = admin.auth();
  t.mock.method(authInstance, "verifyIdToken", async () => ({ uid: "user-1" }));
  t.mock.method(db, "collection", () => ({
    doc: () => ({
      get: async () => fakeSnapshot(true, { active: false, role: null }),
    }),
  }));

  await assert.rejects(() => requireUser(fakeReq({ Authorization: "Bearer good-token" })), (error) => {
    assert.equal(error.status, 403);
    return true;
  });
});

test("requireUser: missing user profile rejects with 403", async (t) => {
  const authInstance = admin.auth();
  t.mock.method(authInstance, "verifyIdToken", async () => ({ uid: "ghost-user" }));
  t.mock.method(db, "collection", () => ({
    doc: () => ({
      get: async () => fakeSnapshot(false, undefined),
    }),
  }));

  await assert.rejects(() => requireUser(fakeReq({ Authorization: "Bearer good-token" })), (error) => {
    assert.equal(error.status, 403);
    return true;
  });
});

test("requireUser: active user resolves with uid, role, and effectivePermissions", async (t) => {
  const authInstance = admin.auth();
  t.mock.method(authInstance, "verifyIdToken", async () => ({ uid: "user-2" }));
  t.mock.method(db, "collection", () => ({
    doc: () => ({
      get: async () =>
        fakeSnapshot(true, {
          is_active: true,
          role: "technician",
          effective_permissions: ["calendar.google.view"],
        }),
    }),
  }));

  const user = await requireUser(fakeReq({ Authorization: "Bearer good-token" }));
  assert.deepEqual(user, {
    uid: "user-2",
    role: "technician",
    effectivePermissions: ["calendar.google.view"],
  });
});

// --- hasPermission / hasAnyPermission / requirePermission (already pure) ---

test("hasPermission: non-admin missing the permission is denied", () => {
  const user = { role: "technician", effectivePermissions: [] };
  assert.equal(hasPermission(user, "calendar.google.view"), false);
});

test("hasPermission: non-admin WITH the permission in effectivePermissions passes", () => {
  const user = { role: "technician", effectivePermissions: ["calendar.google.view"] };
  assert.equal(hasPermission(user, "calendar.google.view"), true);
});

test("hasPermission: admin passes regardless of effectivePermissions", () => {
  const user = { role: "admin", effectivePermissions: [] };
  assert.equal(hasPermission(user, "calendar.google.view"), true);
});

test("hasAnyPermission: true if any key matches", () => {
  const user = { role: "technician", effectivePermissions: ["calendar.google.connect"] };
  assert.equal(hasAnyPermission(user, ["calendar.google.view", "calendar.google.connect"]), true);
});

test("hasAnyPermission: false if no key matches", () => {
  const user = { role: "technician", effectivePermissions: [] };
  assert.equal(hasAnyPermission(user, ["calendar.google.view", "calendar.google.connect"]), false);
});

function fakeRes() {
  const calls = { status: null, body: null };
  return {
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.body = body;
      return this;
    },
    calls,
  };
}

test("requirePermission: denies non-admin missing the permission with exact 403 shape", () => {
  const user = { role: "technician", effectivePermissions: [] };
  const res = fakeRes();
  const allowed = requirePermission(user, "calendar.google.connect", res);
  assert.equal(allowed, false);
  assert.equal(res.calls.status, 403);
  assert.deepEqual(res.calls.body, { message: "Forbidden", required_permission: "calendar.google.connect" });
});

test("requirePermission: allows admin regardless of effectivePermissions", () => {
  const user = { role: "admin", effectivePermissions: [] };
  const res = fakeRes();
  const allowed = requirePermission(user, "calendar.google.connect", res);
  assert.equal(allowed, true);
  assert.equal(res.calls.status, null);
});

test("requirePermission: allows non-admin with the permission present", () => {
  const user = { role: "technician", effectivePermissions: ["calendar.google.connect"] };
  const res = fakeRes();
  const allowed = requirePermission(user, "calendar.google.connect", res);
  assert.equal(allowed, true);
  assert.equal(res.calls.status, null);
});
