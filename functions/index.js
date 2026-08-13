// Google Calendar was this deployment's only feature until it was removed entirely
// 2026-08-12 (user decision: the Cloud Functions + Google Calendar API cost was not
// justified). See git history before that change, and docs/ai-memory/DECISIONS.md's
// 2026-08-12 entry, for the removed implementation.
//
// dashboardNotes (2026-08-13): personal-turned-global sticky notes on the Dashboard,
// explicitly requested by the user to be stored in Supabase, not Firestore. Needs a
// Cloud Function specifically because the live app authenticates via Firebase
// (VITE_AUTH_BACKEND=firebase) -- a logged-in user has no Supabase session, so Supabase
// RLS cannot see who they are. This function verifies the Firebase ID token server-side
// (requireUser(), unchanged from the Google Calendar era) and uses the Supabase service-
// role client to read/write Postgres directly, enforcing "global read, creator-or-admin
// write/delete" in code. See functions/lib/dashboardNotes.js for the full design note.

const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

const { requireUser } = require("./lib/auth");
const { SUPABASE_SERVICE_ROLE_KEY } = require("./lib/supabaseAuth");
const dashboardNotes = require("./lib/dashboardNotes");

const REGION = "africa-south1";
const SECRETS = [SUPABASE_SERVICE_ROLE_KEY];

setGlobalOptions({ region: REGION });

function applyCors(req, res) {
  const origin = req.get("Origin") || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

/**
 * Wraps a handler with CORS + `requireUser` + generic error handling, matching the exact
 * pattern the Google Calendar functions used (see git history) -- `handler` receives
 * (req, res, user) and must send its own response.
 */
function guarded(handler) {
  return async (req, res) => {
    if (applyCors(req, res)) return;
    try {
      const user = await requireUser(req);
      await handler(req, res, user);
    } catch (error) {
      if (error && typeof error.status === "number") {
        res.status(error.status).json({ message: error.message || "Unauthorized" });
        return;
      }
      console.error("Unhandled dashboardNotes function error", error);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  };
}

// Single REST-shaped endpoint, method-routed (GET list / POST create / PATCH update /
// DELETE delete), matching the shape frontend/src/api/apiClient.js's request() already
// expects from every other REST-style route in this app.
exports.dashboardNotes = onRequest({ secrets: SECRETS }, guarded(async (req, res, user) => {
  switch (req.method) {
    case "GET":
      return dashboardNotes.listNotes(req, res, user);
    case "POST":
      return dashboardNotes.createNote(req, res, user);
    case "PATCH":
      return dashboardNotes.updateNote(req, res, user);
    case "DELETE":
      return dashboardNotes.deleteNote(req, res, user);
    default:
      res.status(405).json({ message: "Method not allowed." });
  }
}));
