// Dashboard sticky notes. Global (every signed-in user sees every note), only the creator
// or an admin may edit/delete a note, optionally linked to a client.
//
// Why this needs a Cloud Function at all, not a direct browser->Supabase call: Postgres RLS
// (auth.uid()) can enforce "you can only touch your own row" but has no concept of "the
// creator OR an admin" without either a security-definer function or trusting the client to
// send its own role honestly -- easiest and most auditable to enforce it here, in one place,
// the same way every other authorization decision in this app's Cloud Functions already
// works. requireUser() verifies the caller's Supabase session token server-side, then this
// module uses the Supabase SERVICE ROLE client (trusted server-side context, bypasses RLS
// by design) to perform the actual Postgres read/write.
//
// `client_id` references `public.clients.id` directly -- both tables are real, live
// Supabase data post-cutover. Resolving the linked client's name/color happens client-side
// via the normal apiClient.entities.Client.get(client_id) call -- this function only stores
// and returns the plain client_id, it never needs to know what a client "looks like".

const { getServiceRoleClient } = require("./supabaseAuth");

const TABLE = "dashboard_notes";
const MAX_CONTENT_LENGTH = 2000;
const VALID_COLORS = ["yellow", "blue", "green", "pink"];

async function resolveDisplayName(uid) {
  try {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return "Someone";
    return data.full_name || data.email || "Someone";
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
