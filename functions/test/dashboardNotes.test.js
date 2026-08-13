const test = require("node:test");
const assert = require("node:assert/strict");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, getServiceRoleClient } = require("../lib/supabaseAuth");
const { listNotes, createNote, updateNote, deleteNote } = require("../lib/dashboardNotes");

// Same pattern as test/supabaseAuth.test.js -- getServiceRoleClient() is a module-level
// singleton, so mocking methods on the instance it returns here affects the exact same
// instance dashboardNotes.js uses internally (both require the same module in-process).
function withMockedConfig(t) {
  t.mock.method(SUPABASE_URL, "value", () => "https://cjvrquipmnoihksijful.supabase.co");
  t.mock.method(SUPABASE_SERVICE_ROLE_KEY, "value", () => "test-service-role-key");
}

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

const ADMIN = { uid: "admin-uid", role: "admin", effectivePermissions: [] };
const CREATOR = { uid: "creator-uid", role: "technician", effectivePermissions: [] };
const OTHER_USER = { uid: "other-uid", role: "technician", effectivePermissions: [] };

test("listNotes: returns all notes on success", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  const notes = [{ id: "1", content: "a" }, { id: "2", content: "b" }];
  t.mock.method(client, "from", () => ({
    select: () => ({ order: async () => ({ data: notes, error: null }) }),
  }));

  const res = fakeRes();
  await listNotes({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.notes, notes);
});

test("listNotes: 500 on database error, never leaks the raw error", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client, "from", () => ({
    select: () => ({ order: async () => ({ data: null, error: new Error("db down") }) }),
  }));

  const res = fakeRes();
  await listNotes({}, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Unable to load notes.");
});

test("createNote: rejects empty content with 400, never reaches the database", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client, "from", () => { throw new Error("should not be called"); });

  const res = fakeRes();
  await createNote({ body: JSON.stringify({ content: "   " }) }, res, CREATOR);
  assert.equal(res.statusCode, 400);
});

test("createNote: sets created_by/created_by_name from the authenticated caller, defaults color, allows an optional client_id", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  let insertedRow = null;
  t.mock.method(client, "from", (table) => {
    assert.equal(table, "dashboard_notes");
    return {
      insert: (row) => {
        insertedRow = row;
        return {
          select: () => ({
            single: async () => ({ data: { id: "new-1", ...row }, error: null }),
          }),
        };
      },
    };
  });

  const req = { body: JSON.stringify({ content: "Call back client re: parts", client_id: "firestore-client-1" }) };
  const res = fakeRes();
  await createNote(req, res, CREATOR);

  assert.equal(res.statusCode, 201);
  assert.equal(insertedRow.created_by, CREATOR.uid);
  assert.equal(insertedRow.content, "Call back client re: parts");
  assert.equal(insertedRow.color, "yellow");
  assert.equal(insertedRow.client_id, "firestore-client-1");
});

test("createNote: rejects an unrecognized color by falling back to the default rather than storing arbitrary input", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  let insertedRow = null;
  t.mock.method(client, "from", () => ({
    insert: (row) => { insertedRow = row; return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
  }));

  await createNote({ body: JSON.stringify({ content: "hi", color: "<script>" }) }, fakeRes(), CREATOR);
  assert.equal(insertedRow.color, "yellow");
});

function mockLookupThenAction(t, existing, actionMock) {
  const client = getServiceRoleClient();
  t.mock.method(client, "from", () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
    ...actionMock,
  }));
  return client;
}

test("deleteNote: 404-shaped success (idempotent) when the note is already gone", async (t) => {
  withMockedConfig(t);
  mockLookupThenAction(t, null, {});
  const res = fakeRes();
  await deleteNote({ query: { id: "gone" } }, res, CREATOR);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deleted, true);
});

test("deleteNote: 403s a user who is neither the creator nor an admin -- the actual security boundary", async (t) => {
  withMockedConfig(t);
  mockLookupThenAction(t, { id: "note-1", created_by: CREATOR.uid }, {});
  const res = fakeRes();
  await deleteNote({ query: { id: "note-1" } }, res, OTHER_USER);
  assert.equal(res.statusCode, 403);
});

test("deleteNote: allows the creator to delete their own note", async (t) => {
  withMockedConfig(t);
  let deleteCalled = false;
  const client = getServiceRoleClient();
  t.mock.method(client, "from", () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "note-1", created_by: CREATOR.uid }, error: null }) }) }),
    delete: () => ({ eq: async () => { deleteCalled = true; return { error: null }; } }),
  }));
  const res = fakeRes();
  await deleteNote({ query: { id: "note-1" } }, res, CREATOR);
  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalled, true);
});

test("deleteNote: allows an admin to delete someone else's note", async (t) => {
  withMockedConfig(t);
  let deleteCalled = false;
  const client = getServiceRoleClient();
  t.mock.method(client, "from", () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "note-1", created_by: CREATOR.uid }, error: null }) }) }),
    delete: () => ({ eq: async () => { deleteCalled = true; return { error: null }; } }),
  }));
  const res = fakeRes();
  await deleteNote({ query: { id: "note-1" } }, res, ADMIN);
  assert.equal(res.statusCode, 200);
  assert.equal(deleteCalled, true);
});

test("updateNote: 403s a non-creator, non-admin caller", async (t) => {
  withMockedConfig(t);
  mockLookupThenAction(t, { id: "note-1", created_by: CREATOR.uid }, {});
  const res = fakeRes();
  await updateNote({ query: { id: "note-1" }, body: JSON.stringify({ content: "hacked" }) }, res, OTHER_USER);
  assert.equal(res.statusCode, 403);
});

test("updateNote: allows the creator to edit their own note", async (t) => {
  withMockedConfig(t);
  const client = getServiceRoleClient();
  t.mock.method(client, "from", () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "note-1", created_by: CREATOR.uid }, error: null }) }) }),
    update: (patch) => ({
      eq: () => ({
        select: () => ({ single: async () => ({ data: { id: "note-1", ...patch }, error: null }) }),
      }),
    }),
  }));
  const res = fakeRes();
  await updateNote({ query: { id: "note-1" }, body: JSON.stringify({ content: "edited" }) }, res, CREATOR);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.content, "edited");
});

test("updateNote: rejects empty content with 400", async (t) => {
  withMockedConfig(t);
  const res = fakeRes();
  await updateNote({ query: { id: "note-1" }, body: JSON.stringify({ content: "  " }) }, res, CREATOR);
  assert.equal(res.statusCode, 400);
});
