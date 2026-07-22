const crypto = require("crypto");
const { google } = require("googleapis");
const { buildOAuthClient } = require("./googleOAuthClient");
const { updateConnection } = require("./googleCalendarStore");

/** Exchanges an OAuth authorization code for tokens. Throws on failure. */
async function exchangeCode(code) {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens || !tokens.access_token) {
    throw new Error("Google did not return an access token.");
  }
  return tokens;
}

/** Fetches the connected Google account's identity (id/name/email). */
async function fetchAccountIdentity(tokens) {
  const client = buildOAuthClient();
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return { id: data.id, name: data.name, email: data.email };
}

function authorizedClientFor(connection) {
  const client = buildOAuthClient();
  client.setCredentials({
    access_token: connection.accessToken?.access_token,
    refresh_token: connection.refreshToken,
    scope: (connection.scopes || []).join(" "),
    token_type: connection.accessToken?.token_type || "Bearer",
    expiry_date: connection.tokenExpiresAtMillis || undefined,
  });
  return client;
}

/**
 * Ensures the connection's access token is still valid, refreshing it via
 * the stored refresh token if needed. Persists the refreshed token back to
 * Firestore (never clobbering the stored refresh token with an empty value -
 * Google normally omits refresh_token on a refresh response and only sends
 * it on the initial consent grant).
 *
 * Returns an authorized OAuth2 client ready for API calls. Throws if the
 * connection cannot be refreshed (e.g. no refresh token, or Google rejects
 * it) - callers must treat this as "must be reconnected".
 */
async function ensureFreshToken(connection) {
  const client = authorizedClientFor(connection);
  const expiryMillis = connection.tokenExpiresAtMillis || 0;
  const isExpired = !expiryMillis || expiryMillis <= Date.now() + 60 * 1000;

  if (!isExpired) return client;

  if (!connection.refreshToken) {
    throw new Error("Google Calendar must be reconnected.");
  }

  let refreshed;
  try {
    const response = await client.refreshAccessToken();
    refreshed = response.credentials;
  } catch (error) {
    console.error("Google Calendar token refresh failed", error);
    throw new Error("Google Calendar must be reconnected.");
  }

  const newExpiryMillis = refreshed.expiry_date || Date.now() + 3600 * 1000;
  await updateConnection({
    accessToken: {
      access_token: refreshed.access_token,
      token_type: refreshed.token_type || "Bearer",
    },
    // Preserve the existing refresh token exactly when Google's refresh
    // response omits one (the normal case for a refresh call).
    refreshToken: refreshed.refresh_token || connection.refreshToken,
    tokenExpiresAtMillis: newExpiryMillis,
    lastRefreshedAt: new Date(),
    lastError: null,
  });

  client.setCredentials({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || connection.refreshToken,
    expiry_date: newExpiryMillis,
  });
  return client;
}

/** Lists the connected account's calendars, flagging which are selected. */
async function listCalendars(client, selectedCalendarIds = []) {
  const calendar = google.calendar({ version: "v3", auth: client });
  const { data } = await calendar.calendarList.list();
  const items = data.items || [];
  return items.map((item) => ({
    id: item.id,
    name: item.summary,
    primary: Boolean(item.primary),
    selected: selectedCalendarIds.includes(item.id),
  }));
}

function stableEventId(calendarId, eventId) {
  return `google-${crypto.createHash("sha1").update(`${calendarId}-${eventId}`).digest("hex")}`;
}

/** Pure mapping of a raw Google Calendar API event to the FullCalendar shape. */
function mapGoogleEventToFullCalendar(rawEvent, calendarId, calendarName) {
  return {
    id: stableEventId(calendarId, rawEvent.id),
    title: rawEvent.summary || "(Untitled event)",
    start: rawEvent.start?.dateTime || rawEvent.start?.date,
    end: rawEvent.end?.dateTime || rawEvent.end?.date,
    allDay: Boolean(rawEvent.start?.date && !rawEvent.start?.dateTime),
    editable: false,
    extendedProps: {
      sourceType: "google_calendar",
      calendarId,
      calendarName: calendarName || calendarId,
      location: rawEvent.location || null,
      description: rawEvent.description || null,
      organiser: rawEvent.organizer?.displayName || rawEvent.organizer?.email || null,
      htmlLink: rawEvent.htmlLink || null,
    },
  };
}

/** Fetches events for a single calendar id within [start, end], mapped to FullCalendar shape. */
async function listEventsForCalendar(client, calendarId, calendarName, start, end) {
  const calendar = google.calendar({ version: "v3", auth: client });
  const { data } = await calendar.events.list({
    calendarId,
    timeMin: start,
    timeMax: end,
    singleEvents: true,
    orderBy: "startTime",
  });
  const items = data.items || [];
  return items.map((event) => mapGoogleEventToFullCalendar(event, calendarId, calendarName));
}

module.exports = {
  exchangeCode,
  fetchAccountIdentity,
  ensureFreshToken,
  listCalendars,
  listEventsForCalendar,
  mapGoogleEventToFullCalendar,
};
