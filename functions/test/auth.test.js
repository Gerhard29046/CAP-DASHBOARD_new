const test = require("node:test");
const assert = require("node:assert/strict");
const { requireUser, hasPermission, hasAnyPermission, requirePermission } = require("../lib/auth");
const supabaseAuth = require("../lib/supabaseAuth");

function fakeReq(headers) {
  return {
    get(name) {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : undefined;
    },
  };
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

test("requireUser: delegates the bearer token straight to verifySupabaseUser() -- no other verification path exists post-cutover", async (t) => {
  const verifySupabaseUserMock = t.mock.method(supabaseAuth, "verifySupabaseUser", async (token) => {
    assert.equal(token, "a-real-token");
    return { uid: "uid-1", role: "technician", effectivePermissions: ["calendar.google.view"] };
  });

  const user = await requireUser(fakeReq({ Authorization: "Bearer a-real-token" }));
  assert.deepEqual(user, { uid: "uid-1", role: "technician", effectivePermissions: ["calendar.google.view"] });
  assert.equal(verifySupabaseUserMock.mock.callCount(), 1);
});

test("requireUser: propagates verifySupabaseUser()'s rejection (e.g. 401/403) unchanged", async (t) => {
  t.mock.method(supabaseAuth, "verifySupabaseUser", async () => {
    throw { status: 403, message: "Forbidden" };
  });

  await assert.rejects(() => requireUser(fakeReq({ Authorization: "Bearer bad-token" })), (error) => {
    assert.equal(error.status, 403);
    return true;
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
