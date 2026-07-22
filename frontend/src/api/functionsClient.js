import { auth } from "@/lib/firebase";

const FUNCTIONS_BASE_URL = import.meta.env.VITE_FUNCTIONS_BASE_URL;

/**
 * Calls a deployed Firebase Cloud Function (2nd gen, `onRequest`) by name,
 * attaching the current user's Firebase ID token as a bearer token.
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
  if (!auth.currentUser) {
    throw Object.assign(new Error("Unauthenticated"), { status: 401 });
  }

  const idToken = await auth.currentUser.getIdToken();
  const query = searchParams ? `?${searchParams.toString()}` : "";
  const url = `${FUNCTIONS_BASE_URL}/${name}${query}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Unable to reach the server. Please check your connection and try again.");
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
