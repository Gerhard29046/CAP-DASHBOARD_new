import { auth } from "@/lib/firebase";

// Thin client for the `dashboardNotes` Cloud Function (functions/index.js +
// functions/lib/dashboardNotes.js). Notes live in Supabase per explicit user instruction
// (2026-08-13), but the function itself is authenticated with the caller's Firebase ID
// token -- the live app has no Supabase session to call Supabase directly with RLS.
//
// Deliberately its own small client rather than reviving the deleted
// frontend/src/api/functionsClient.js wholesale -- that file was Google-Calendar-specific
// (8 endpoints) and was removed entirely with that feature; this is the only Cloud
// Function that exists again now, so a focused client is simpler than resurrecting the
// old generic one.

const BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL;

async function authorizedFetch(path, options = {}) {
  if (!BASE_URL) {
    throw new Error("VITE_FUNCTIONS_BASE_URL is not configured.");
  }
  const user = auth.currentUser;
  if (!user) throw new Error("Unauthenticated");
  const token = await user.getIdToken();

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
