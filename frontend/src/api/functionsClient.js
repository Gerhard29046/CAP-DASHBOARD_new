import { auth } from "@/lib/firebase";

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL;
const REQUEST_TIMEOUT_MS = 20000;
const AUTH_BACKEND = import.meta.env.VITE_AUTH_BACKEND === "supabase" ? "supabase" : "firebase";

// Google Calendar's Cloud Functions stay on Firebase regardless of which backend serves
// the rest of the app (see docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md) -- what changes
// here is only WHICH bearer token gets attached, matching whichever session is actually
// live. `functions/lib/auth.js`'s issuer-routed dual verification (2026-08-06) accepts
// either token shape server-side, so this and the Functions deploy can move independently.
// Dynamic import so the default (firebase) branch never evaluates
// services/supabase/client.js -- same reasoning as apiClient.js/AuthContext.jsx.
async function getBearerToken() {
  if (AUTH_BACKEND === "supabase") {
    const { supabase } = await import("@/services/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw Object.assign(new Error("Unauthenticated"), { status: 401 });
    return token;
  }
  if (!auth.currentUser) {
    throw Object.assign(new Error("Unauthenticated"), { status: 401 });
  }
  return auth.currentUser.getIdToken();
}

/**
 * Calls a deployed Firebase Cloud Function (2nd gen, `onRequest`) by name,
 * attaching whichever backend's bearer token is currently active (Firebase ID token, or a
 * Supabase access token if VITE_AUTH_BACKEND=supabase -- see getBearerToken() above).
 *
 * Throws a plain Error with a safe, human-readable message on any failure -
 * never surfaces a raw stack trace or parse failure to callers.
 */
export async function callFunction(name, { method = "GET", searchParams, body } = {}) {
  if (!FUNCTIONS_BASE_URL) {
    throw new Error(
      "VITE_FUNCTIONS_BASE_URL is not configured. Set it in the frontend environment to reach Cloud Functions.",
    );
  }

  const idToken = await getBearerToken();
  const query = searchParams ? `?${searchParams.toString()}` : "";
  const url = `${FUNCTIONS_BASE_URL}/${name}${query}`;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      signal: timeoutController.signal,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    // Dev-only diagnostic: method/name/error-name only, never headers, body, or the token.
    console.error(`Google Calendar function call failed: ${method} ${name}`, error?.name, error?.message);
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("The server took too long to respond. Please try again."), { status: 504 });
    }
    throw new Error("Unable to reach the server. Please check your connection and try again.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && typeof payload.message === "string"
      ? payload.message
      : "The server returned an unexpected error.";
    throw Object.assign(new Error(message), { status: response.status });
  }

  return payload;
}
