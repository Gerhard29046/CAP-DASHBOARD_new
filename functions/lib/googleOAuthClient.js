const { google } = require("googleapis");
const { defineSecret, defineString } = require("firebase-functions/params");

// Firebase Functions v2 secrets - set with:
//   npx firebase-tools functions:secrets:set GOOGLE_CALENDAR_CLIENT_ID
//   npx firebase-tools functions:secrets:set GOOGLE_CALENDAR_CLIENT_SECRET
const GOOGLE_CALENDAR_CLIENT_ID = defineSecret("GOOGLE_CALENDAR_CLIENT_ID");
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret("GOOGLE_CALENDAR_CLIENT_SECRET");

// Non-secret parameter: the CAP Dashboard URL the user is redirected back to
// after the Google OAuth flow completes. Defaults to the live Cloudflare
// deployment's System Settings route.
const FRONTEND_URL = defineString("FRONTEND_URL", {
  default: "https://capdashboard.gerhardvanwijk.workers.dev",
});

const REGION = "africa-south1";
const PROJECT_ID = "capdatabasefb2";

// This EXACT URL must be registered in Google Cloud Console -> APIs & Services
// -> Credentials -> the OAuth client -> Authorized redirect URIs. It is fixed
// by the function's name/region/project and does not change between deploys.
const REDIRECT_URI = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/googleCalendarCallback`;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "openid",
  "email",
  "profile",
];

function isConfigured() {
  return Boolean(GOOGLE_CALENDAR_CLIENT_ID.value() && GOOGLE_CALENDAR_CLIENT_SECRET.value());
}

function buildOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CALENDAR_CLIENT_ID.value(),
    GOOGLE_CALENDAR_CLIENT_SECRET.value(),
    REDIRECT_URI,
  );
}

function buildAuthUrl(state) {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

function frontendSuccessUrl() {
  return `${FRONTEND_URL.value()}/settings?google_calendar=connected`;
}

function frontendErrorUrl() {
  return `${FRONTEND_URL.value()}/settings?google_calendar=error`;
}

module.exports = {
  GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  FRONTEND_URL,
  REDIRECT_URI,
  SCOPES,
  isConfigured,
  buildOAuthClient,
  buildAuthUrl,
  frontendSuccessUrl,
  frontendErrorUrl,
};
