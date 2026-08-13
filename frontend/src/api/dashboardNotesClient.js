import { supabase } from "@/services/supabase/client";

// Dashboard sticky notes: direct Supabase Auth + RLS access, matching every other table in
// this app. Migrated 2026-08-13 off a Firebase Cloud Function, then briefly a Cloudflare
// Worker (both retired same day -- see docs/ai-memory/DECISIONS.md's 2026-08-13 entries for
// the full history) once it was confirmed RLS could express "creator or admin" for this
// table too, via the same `public.is_admin()` security-definer function already used
// everywhere else (supabase/migrations/0023_dashboard_notes_direct_rls.sql). There is no
// server-side layer in front of this table anymore -- Postgres itself enforces "global
// read, creator-or-admin write/delete" via RLS policies, a CHECK constraint on `content`
// length and `color`, and a BEFORE INSERT/UPDATE trigger that resolves/pins
// `created_by_name` so a client can never spoof it.
//
// Known, accepted trade-off of moving to RLS (documented, not a bug): the retired Worker
// checked ownership *before* deleting and returned a clean 403 if unauthorized. Postgres
// DELETE has no equivalent concept -- a DELETE whose WHERE clause (as filtered by RLS)
// matches 0 rows is not an error, it just deletes nothing. So `remove()` below cannot
// distinguish "already gone" from "blocked by RLS" -- both look identical: no error, no
// rows deleted. This collapses into the same "idempotent success" bucket the Worker already
// used for the "already gone" case, so it's a small generalization of an existing design
// choice, not a new regression. The row's continued existence is the real, authoritative
// signal either way. `update()` does NOT have this ambiguity (see below).

const NOTE_COLUMNS = "id, created_by, created_by_name, content, color, client_id, created_at, updated_at";
const VALID_COLORS = ["yellow", "blue", "green", "pink"];

async function requireUserId() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
  return userId;
}

export const dashboardNotesClient = {
  list: async () => {
    const { data, error } = await supabase
      .from("dashboard_notes")
      .select(NOTE_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  create: async ({ content, color, client_id }) => {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("dashboard_notes")
      .insert({
        // The INSERT policy's `with check (created_by = auth.uid())` is the real gate --
        // this client always sends the caller's own id, but even a hand-crafted request
        // claiming a different created_by is rejected by Postgres itself, admin included
        // (no admin bypass on insert-spoofing, matching the approved authorization matrix).
        created_by: userId,
        content,
        color: VALID_COLORS.includes(color) ? color : "yellow",
        client_id: typeof client_id === "string" && client_id.trim() ? client_id.trim() : null,
      })
      .select(NOTE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  update: async (id, { content }) => {
    const { data, error } = await supabase
      .from("dashboard_notes")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(NOTE_COLUMNS)
      .single();
    if (error) {
      // PGRST116: "the result contains 0 rows" -- happens when the UPDATE's WHERE clause
      // (as filtered by the update policy's USING clause) matches nothing, i.e. the note
      // doesn't exist OR the caller is neither its creator nor an admin. RLS deliberately
      // doesn't distinguish those two cases to the caller (same principle as a 404-vs-403
      // trade-off many APIs make on purpose) -- surfaced here as one clear message instead
      // of leaking the raw Postgrest error string.
      if (error.code === "PGRST116") {
        throw Object.assign(new Error("Note not found, or you don't have permission to edit it."), { status: 403 });
      }
      throw error;
    }
    return data;
  },

  remove: async (id) => {
    const { error } = await supabase.from("dashboard_notes").delete().eq("id", id);
    if (error) throw error;
    return { deleted: true };
  },
};
