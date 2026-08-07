const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SUPABASE_URL,
  isSupabaseIssuer,
  verifySupabaseUser,
  getServiceRoleClient,
} = require("../lib/supabaseAuth");

// getServiceRoleClient() calls createClient() with real (empty, in this bare test
// environment) SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY .value()s the first time it's
// invoked, and createClient() throws synchronously on an empty URL -- so every test that
// needs a real client object must mock both .value()s BEFORE the first call, matching this
// module's real runtime behavior where defineString/defineSecret .value() only resolve to
// something real inside an actual deployed/emulated function.
function withMockedConfig(t, url = "https://cjvrquipmnoihksijful.supabase.co", key = "test-service-role-key") {
  t.mock.method(SUPABASE_URL, "value", () => url);
  t.mock.method(require("../lib/supabaseAuth").SUPABASE_SERVICE_ROLE_KEY, "value", () => key);
}

test("isSupabaseIssuer: matches this project's real Supabase Auth issuer (confirmed live 2026-08-06)", (t) => {
  t.mock.method(SUPABASE_URL, "value", () => "https://cjvrquipmnoihksijful.supabase.co");
  assert.equal(isSupabaseIssuer("https://cjvrquipmnoihksijful.supabase.co/auth/v1"), true);
});

test("isSupabaseIssuer: rejects a Firebase issuer", (t) => {
  t.mock.method(SUPABASE_URL, "value", () => "https://cjvrquipmnoihksijful.supabase.co");
  assert.equal(isSupabaseIssuer("https://securetoken.google.com/capdatabasefb2"), false);
});

test("isSupabaseIssuer: rejects a different Supabase project's issuer", (t) => {
  t.mock.method(SUPABASE_URL, "value", () => "https://cjvrquipmnoihksijful.supabase.co");
  assert.equal(isSupabaseIssuer("https://some-other-project.supabase.co/auth/v1"), false);
});

test("isSupabaseIssuer: null/undefined/empty are all false, never throw", (t) => {
  t.mock.method(SUPABASE_URL, "value", () => "https://cjvrquipmnoihksijful.supabase.co");
  assert.equal(isSupabaseIssuer(null), false);
  assert.equal(isSupabaseIssuer(undefined), false);
  assert.equal(isSupabaseIssuer(""), false);
});

test("verifySupabaseUser: getUser() failure rejects with 401", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client.auth, "getUser", async () => ({ data: null, error: new Error("invalid token") }));

  await assert.rejects(() => verifySupabaseUser("bad-token"), (error) => {
    assert.equal(error.status, 401);
    return true;
  });
});

test("verifySupabaseUser: profile query error rejects with 500", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client.auth, "getUser", async () => ({ data: { user: { id: "uid-1" } }, error: null }));
  t.mock.method(client, "from", () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: new Error("db unreachable") }),
      }),
    }),
  }));

  await assert.rejects(() => verifySupabaseUser("good-token"), (error) => {
    assert.equal(error.status, 500);
    return true;
  });
});

test("verifySupabaseUser: no matching profile row rejects with 403", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client.auth, "getUser", async () => ({ data: { user: { id: "ghost-uid" } }, error: null }));
  t.mock.method(client, "from", () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  }));

  await assert.rejects(() => verifySupabaseUser("good-token"), (error) => {
    assert.equal(error.status, 403);
    return true;
  });
});

test("verifySupabaseUser: inactive profile (is_active: false) rejects with 403", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client.auth, "getUser", async () => ({ data: { user: { id: "uid-2" } }, error: null }));
  t.mock.method(client, "from", () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { role: "technician", effective_permissions: [], is_active: false }, error: null }),
      }),
    }),
  }));

  await assert.rejects(() => verifySupabaseUser("good-token"), (error) => {
    assert.equal(error.status, 403);
    return true;
  });
});

test("verifySupabaseUser: active profile resolves with uid, role, and effectivePermissions", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client.auth, "getUser", async () => ({ data: { user: { id: "uid-3" } }, error: null }));
  t.mock.method(client, "from", () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { role: "admin", effective_permissions: ["calendar.google.view"], is_active: true },
          error: null,
        }),
      }),
    }),
  }));

  const user = await verifySupabaseUser("good-token");
  assert.deepEqual(user, { uid: "uid-3", role: "admin", effectivePermissions: ["calendar.google.view"] });
});

test("verifySupabaseUser: non-array effective_permissions defaults to empty array rather than throwing", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client.auth, "getUser", async () => ({ data: { user: { id: "uid-4" } }, error: null }));
  t.mock.method(client, "from", () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { role: "technician", effective_permissions: null, is_active: true },
          error: null,
        }),
      }),
    }),
  }));

  const user = await verifySupabaseUser("good-token");
  assert.deepEqual(user.effectivePermissions, []);
});
