// Dashboard sticky notes (2026-08-13, explicit user request + follow-up correction:
// "THE DATABASE MUST BE ON SUPABASE", notes must be GLOBAL not per-user, and only the
// creator or an admin may delete a note).
//
// Why this needs a Cloud Function at all, not a direct browser->Supabase call:
// the live app authenticates via Firebase (VITE_AUTH_BACKEND=firebase), so a logged-in
// user has no Supabase session/JWT -- Supabase RLS (auth.uid()) cannot see who they are.
// This function verifies the caller's Firebase ID token server-side (requireUser(), same
// as every other function in this file always has), then uses the Supabase SERVICE ROLE
// client (trusted server-side context, bypasses RLS by design) to perform the actual
// Postgres read/write -- enforcing "global read, creator-or-admin delete" itself in code,
// since Postgres RLS has no way to know the caller's identity here.
//
// `client_id` deliberately references a Firestore client document ID (a string), NOT a
// Supabase `public.clients.id` (a uuid) -- clients are still live data in Firestore today
// (Firebase is the active backend); Supabase's clients table is the dormant migrated copy.
// Resolving the linked client's name/color happens client-side via the normal
// apiClient.entities.Client.get(client_id) call against the real, live Firestore data --
// this function only stores and returns the plain client_id string.

const { db } = require("./firebaseAdmin");
const { getServiceRoleClient } = require("./supabaseAuth");

const TABLE = "dashboard_notes";
const MAX_CONTENT_LENGTH = 2000;
const VALID_COLORS = ["yellow", "blue", "green", "pink"];

async function resolveDisplayName(uid) {
  try {
    const snap = await db.collection("users").doc(uid).get();
    const data = snap.exists ? snap.data() : null;
    return data?.name || data?.full_name || data?.email || "Someone";
  } catch (error) {
    console.error("dashboardNotes: failed to resolve display name", error);
    return "Someone";
  }
}

async function listNotes(req, res) {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, created_by, created_by_name, content, color, client_id, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("dashboardNotes: list failed", error);
    res.status(500).json({ message: "Unable to load notes." });
    return;
  }
  res.status(200).json({ notes: data || [] });
}

async function createNote(req, res, user) {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    res.status(400).json({ message: "Note content is required." });
    return;
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ message: `Note content must be ${MAX_CONTENT_LENGTH} characters or fewer.` });
    return;
  }
  const color = VALID_COLORS.includes(body.color) ? body.color : "yellow";
  const clientId = typeof body.client_id === "string" && body.client_id.trim() ? body.client_id.trim() : null;

  const createdByName = await resolveDisplayName(user.uid);
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ created_by: user.uid, created_by_name: createdByName, content, color, client_id: clientId })
    .select("id, created_by, created_by_name, content, color, client_id, created_at, updated_at")
    .single();
  if (error) {
    console.error("dashboardNotes: create failed", error);
    res.status(500).json({ message: "Unable to save the note." });
    return;
  }
  res.status(201).json(data);
}

async function updateNote(req, res, user) {
  const noteId = req.params?.id || req.query?.id;
  if (!noteId) {
    res.status(400).json({ message: "Note id is required." });
    return;
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    res.status(400).json({ message: "Note content is required." });
    return;
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ message: `Note content must be ${MAX_CONTENT_LENGTH} characters or fewer.` });
    return;
  }

  const supabase = getServiceRoleClient();
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE)
    .select("id, created_by")
    .eq("id", noteId)
    .maybeSingle();
  if (fetchError) {
    console.error("dashboardNotes: update lookup failed", fetchError);
    res.status(500).json({ message: "Unable to update the note." });
    return;
  }
  if (!existing) {
    res.status(404).json({ message: "Note not found." });
    return;
  }
  // Only the creator or an admin may edit -- same authorization boundary as delete.
  if (existing.created_by !== user.uid && user.role !== "admin") {
    res.status(403).json({ message: "Only the note's creator or an admin may edit it." });
    return;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select("id, created_by, created_by_name, content, color, client_id, created_at, updated_at")
    .single();
  if (error) {
    console.error("dashboardNotes: update failed", error);
    res.status(500).json({ message: "Unable to update the note." });
    return;
  }
  res.status(200).json(data);
}

async function deleteNote(req, res, user) {
  const noteId = req.params?.id || req.query?.id;
  if (!noteId) {
    res.status(400).json({ message: "Note id is required." });
    return;
  }

  const supabase = getServiceRoleClient();
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE)
    .select("id, created_by")
    .eq("id", noteId)
    .maybeSingle();
  if (fetchError) {
    console.error("dashboardNotes: delete lookup failed", fetchError);
    res.status(500).json({ message: "Unable to delete the note." });
    return;
  }
  if (!existing) {
    // Already gone -- treat as success, matches idempotent-delete convention used
    // elsewhere in this app's REST-shaped endpoints.
    res.status(200).json({ deleted: true });
    return;
  }
  if (existing.created_by !== user.uid && user.role !== "admin") {
    res.status(403).json({ message: "Only the note's creator or an admin may delete it." });
    return;
  }

  const { error } = await supabase.from(TABLE).delete().eq("id", noteId);
  if (error) {
    console.error("dashboardNotes: delete failed", error);
    res.status(500).json({ message: "Unable to delete the note." });
    return;
  }
  res.status(200).json({ deleted: true });
}

module.exports = { listNotes, createNote, updateNote, deleteNote };
