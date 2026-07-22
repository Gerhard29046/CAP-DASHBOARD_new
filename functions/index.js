const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

const { requireUser, requirePermission, hasAnyPermission } = require("./lib/auth");
const {
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  isConfigured,
  buildAuthUrl,
  frontendSuccessUrl,
  frontendErrorUrl,
} = require("./lib/googleOAuthClient");
const store = require("./lib/googleCalendarStore");
const googleCalendar = require("./lib/googleCalendarService");

const REGION = "africa-south1";
const SECRETS = [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET];

setGlobalOptions({ region: REGION });

const MAX_RANGE_DAYS = 370;
const MAX_CALENDAR_IDS = 50;
const MAX_CALENDAR_ID_LENGTH = 1024;

function applyCors(req, res) {
  const origin = req.get("Origin") || "*";
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

/**
 * Wraps a handler with CORS + `requireUser` + generic error handling so every
 * function shares the exact same safe-failure behaviour. `handler` receives
 * (req, res, user) and must send its own successful response.
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
      console.error("Unhandled Google Calendar function error", error);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  };
}

function safeStatus(connection) {
  return {
    connected: Boolean(connection),
    requires_reconnection: Boolean(connection?.lastError),
    account_name: connection?.googleAccountName ?? null,
    account_email: connection?.googleAccountEmail ?? null,
    connected_at: toIso(connection?.connectedAt),
    last_refreshed_at: toIso(connection?.lastRefreshedAt),
    selected_calendars: connection?.selectedCalendarIds ?? [],
    last_error: connection?.lastError ?? null,
  };
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Pure validation of the `start`/`end` query params used by
 * `googleCalendarEvents`. Returns `{ ok: true, startDate, endDate }` on
 * success or `{ ok: false, status, message }` describing the HTTP response
 * the caller should send.
 */
function validateDateRange(startRaw, endRaw) {
  const startDate = startRaw ? new Date(String(startRaw)) : null;
  const endDate = endRaw ? new Date(String(endRaw)) : null;
  if (!startRaw || !endRaw || Number.isNaN(startDate?.getTime()) || Number.isNaN(endDate?.getTime())) {
    return { ok: false, status: 400, message: "Valid start and end query parameters are required." };
  }
  if (endDate <= startDate) {
    return { ok: false, status: 400, message: "end must be after start." };
  }
  const rangeDays = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > MAX_RANGE_DAYS) {
    return { ok: false, status: 400, message: `The calendar date range may not exceed ${MAX_RANGE_DAYS} days.` };
  }
  return { ok: true, startDate, endDate };
}

/**
 * Pure validation of the `calendar_ids` body field used by
 * `googleCalendarSelectCalendars`. Returns `{ ok: true, calendarIds }` on
 * success or `{ ok: false, status, message }` describing the HTTP response
 * the caller should send.
 */
function validateCalendarIds(value) {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || id.length === 0 || id.length > MAX_CALENDAR_ID_LENGTH)
  ) {
    return { ok: false, status: 400, message: "calendar_ids must be an array of non-empty strings." };
  }
  if (value.length > MAX_CALENDAR_IDS) {
    return { ok: false, status: 400, message: `No more than ${MAX_CALENDAR_IDS} calendars may be selected.` };
  }
  return { ok: true, calendarIds: value };
}

/**
 * Fetches events for each calendar id via `fetchCalendarEvents`, collecting a
 * user-facing warning (and continuing with the remaining calendars) whenever
 * an individual calendar's fetch fails, instead of letting one bad calendar
 * break the whole response.
 */
async function collectCalendarEventsForCalendars(calendarIds, fetchCalendarEvents) {
  const events = [];
  const warnings = [];
  for (const calendarId of calendarIds) {
    try {
      const calendarEvents = await fetchCalendarEvents(calendarId);
      events.push(...calendarEvents);
    } catch (error) {
      console.error(`Failed to fetch events for Google calendar ${calendarId}`, error);
      warnings.push("Some Google Calendar events could not be loaded.");
    }
  }
  return { events, warnings };
}

// 1. Status --------------------------------------------------------------

exports.googleCalendarStatus = onRequest(
  { secrets: SECRETS },
  guarded(async (req, res, user) => {
    const allowed = hasAnyPermission(user, [
      "calendar.google.view",
      "calendar.google.connect",
      "calendar.google.calendars.select",
      "calendar.google.disconnect",
    ]);
    if (!allowed) {
      res.status(403).json({ message: "Forbidden", required_permission: "calendar.google.view" });
      return;
    }
    const connection = await store.getConnection();
    res.json(safeStatus(connection));
  }),
);

// 2. Connect ---------------------------------------------------------------

exports.googleCalendarConnect = onRequest(
  { secrets: SECRETS },
  guarded(async (req, res, user) => {
    if (!requirePermission(user, "calendar.google.connect", res)) return;
    if (!isConfigured()) {
      res.status(422).json({ message: "Google Calendar integration has not been configured on the server." });
      return;
    }
    await store.pruneExpiredOAuthStates();
    const rawState = crypto.randomBytes(32).toString("hex");
    await store.createOAuthState(rawState, user.uid);
    res.json({ authorization_url: buildAuthUrl(rawState) });
  }),
);

// 3. Callback (browser-navigated, no bearer token - the OAuth state is the
//    security boundary, exactly like the legacy Laravel callback route) ----

exports.googleCalendarCallback = onRequest(
  { secrets: SECRETS },
  async (req, res) => {
    if (applyCors(req, res)) return;
    const failureUrl = frontendErrorUrl();
    try {
      const { state, code, error } = req.query;
      if (error || !state || !code) {
        res.redirect(302, failureUrl);
        return;
      }

      const uid = await store.consumeOAuthState(String(state));
      if (!uid) {
        res.redirect(302, failureUrl);
        return;
      }

      const existing = await store.getConnectionRaw();
      let tokens;
      try {
        tokens = await googleCalendar.exchangeCode(String(code));
      } catch (exchangeError) {
        console.error("Google Calendar token exchange failed", exchangeError);
        res.redirect(302, failureUrl);
        return;
      }

      let identity;
      try {
        identity = await googleCalendar.fetchAccountIdentity(tokens);
      } catch (identityError) {
        console.error("Google Calendar identity lookup failed", identityError);
        res.redirect(302, failureUrl);
        return;
      }

      await store.upsertConnection({
        connectedByUid: uid,
        googleAccountId: identity.id ?? null,
        googleAccountName: identity.name ?? null,
        googleAccountEmail: identity.email ?? null,
        accessToken: {
          access_token: tokens.access_token,
          token_type: tokens.token_type || "Bearer",
        },
        // Preserve the existing refresh token if Google's response omitted
        // one (Google only issues a refresh_token on the initial consent).
        refreshToken: tokens.refresh_token || existing?.refreshToken || null,
        tokenExpiresAtMillis: tokens.expiry_date || Date.now() + 3600 * 1000,
        scopes: (tokens.scope || "").split(" ").filter(Boolean),
        isActive: true,
        connectedAt: new Date(),
        lastError: null,
      });

      res.redirect(302, frontendSuccessUrl());
    } catch (unexpected) {
      console.error("Unhandled Google Calendar callback error", unexpected);
      res.redirect(302, failureUrl);
    }
  },
);

// 4. List calendars ---------------------------------------------------------

exports.googleCalendarListCalendars = onRequest(
  { secrets: SECRETS },
  guarded(async (req, res, user) => {
    if (!requirePermission(user, "calendar.google.view", res)) return;
    const connection = await store.getConnection();
    if (!connection) {
      res.json([]);
      return;
    }
    try {
      const client = await googleCalendar.ensureFreshToken(connection);
      const calendars = await googleCalendar.listCalendars(client, connection.selectedCalendarIds || []);
      res.json(calendars);
    } catch (error) {
      console.error("Failed to list Google calendars", error);
      await store.updateConnection({ lastError: "Google Calendar must be reconnected." });
      res.json([]);
    }
  }),
);

// 5. Select calendars --------------------------------------------------------

exports.googleCalendarSelectCalendars = onRequest(
  { secrets: SECRETS },
  guarded(async (req, res, user) => {
    if (!requirePermission(user, "calendar.google.calendars.select", res)) return;

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const validation = validateCalendarIds(body?.calendar_ids);
    if (!validation.ok) {
      res.status(validation.status).json({ message: validation.message });
      return;
    }

    const connection = await store.getConnection();
    if (!connection) {
      res.status(409).json({ message: "Google Calendar is not connected." });
      return;
    }

    const deduped = Array.from(new Set(validation.calendarIds));
    await store.updateConnection({ selectedCalendarIds: deduped });
    const updated = await store.getConnection();
    res.json(safeStatus(updated));
  }),
);

// 6. Disconnect ---------------------------------------------------------------

exports.googleCalendarDisconnect = onRequest(
  { secrets: SECRETS },
  guarded(async (req, res, user) => {
    if (!requirePermission(user, "calendar.google.disconnect", res)) return;
    await store.clearConnection();
    res.json({ connected: false });
  }),
);

// 7. Events -------------------------------------------------------------------

exports.googleCalendarEvents = onRequest(
  { secrets: SECRETS },
  guarded(async (req, res, user) => {
    if (!requirePermission(user, "calendar.google.view", res)) return;

    const { start, end } = req.query;
    const rangeValidation = validateDateRange(start, end);
    if (!rangeValidation.ok) {
      res.status(rangeValidation.status).json({ message: rangeValidation.message });
      return;
    }
    const { startDate, endDate } = rangeValidation;

    const connection = await store.getConnection();
    if (!connection) {
      res.json({ events: [], warnings: ["Google Calendar is not connected."] });
      return;
    }

    let client;
    try {
      client = await googleCalendar.ensureFreshToken(connection);
    } catch (error) {
      console.error("Google Calendar token refresh failed for events fetch", error);
      await store.updateConnection({ lastError: "Google Calendar must be reconnected." });
      res.json({ events: [], warnings: ["Google Calendar must be reconnected."] });
      return;
    }

    const selectedIds = connection.selectedCalendarIds || [];

    let calendarNameById = {};
    try {
      const calendars = await googleCalendar.listCalendars(client, selectedIds);
      calendarNameById = Object.fromEntries(calendars.map((cal) => [cal.id, cal.name]));
    } catch (error) {
      console.error("Failed to load Google calendar names", error);
    }

    const { events, warnings } = await collectCalendarEventsForCalendars(selectedIds, (calendarId) =>
      googleCalendar.listEventsForCalendar(
        client,
        calendarId,
        calendarNameById[calendarId],
        startDate.toISOString(),
        endDate.toISOString(),
      ),
    );

    await store.updateConnection({ lastRefreshedAt: new Date(), lastError: null });
    res.json({ events, warnings });
  }),
);

// Pure helpers exported for unit testing (not part of the deployed function
// surface - Firebase only deploys `onRequest`-wrapped exports above).
module.exports.safeStatus = safeStatus;
module.exports.validateDateRange = validateDateRange;
module.exports.validateCalendarIds = validateCalendarIds;
module.exports.collectCalendarEventsForCalendars = collectCalendarEventsForCalendars;
