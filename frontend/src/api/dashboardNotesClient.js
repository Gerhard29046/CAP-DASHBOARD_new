import { supabase } from "@/services/supabase/client";

// Thin client for the `dashboardNotes` Cloud Function (functions/index.js +
// functions/lib/dashboardNotes.js). Notes live in Supabase; this function is reached via a
// Cloud Function (not a direct Supabase call) because Postgres RLS alone can't enforce
// "creator or admin only" for edit/delete without a trusted server-side check -- see
// dashboardNotes.js's file header for the full reasoning. `functions/lib/auth.js`'s
// requireUser() already auto-routes a bearer token to the correct verification branch by
// its issuer claim, so attaching a Supabase session token here (post-cutover, 2026-08-13)
// needed zero changes on the function side -- only this client needed to stop attaching a
// Firebase ID token and start attaching the Supabase session's access_token instead.

const BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL;

async function authorizedFetch(path, options = {}) {
  if (!BASE_URL) {
    throw new Error("VITE_FUNCTIONS_BASE_URL is not configured.");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Unauthenticated");

  const res = await fetch(`${BASE_URL}/dashboardNotes${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw Object.assign(new Error(body?.message || `Request failed (${res.status})`), { status: res.status });
  }
  return body;
}

export const dashboardNotesClient = {
  list: async () => {
    const body = await authorizedFetch("", { method: "GET" });
    return body?.notes || [];
  },
  create: async ({ content, color, client_id }) =>
    authorizedFetch("", { method: "POST", body: JSON.stringify({ content, color, client_id }) }),
  update: async (id, { content }) =>
    authorizedFetch(`?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ content }) }),
  remove: async (id) =>
    authorizedFetch(`?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
};
