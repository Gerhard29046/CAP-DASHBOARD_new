// Google Calendar was the only feature this Cloud Functions deployment ever served
// (status/connect/callback/list-calendars/select-calendars/set-display/disconnect/events).
// Removed entirely 2026-08-12 (user decision: the Cloud Functions + Google Calendar API
// cost was not justified). See git history before this change for the removed
// implementation, and docs/ai-memory/DECISIONS.md's 2026-08-12 entry for the removal
// record. `functions/lib/googleCalendarService.js`/`googleCalendarStore.js`/
// `googleOAuthClient.js` were deleted alongside this file's exports.
//
// `functions/lib/auth.js` (requireUser/requirePermission/hasAnyPermission) and
// `functions/lib/supabaseAuth.js` (the issuer-routed Supabase JWT branch added for the
// now-removed Google Calendar functions) are left in place, unused by any export here --
// they're generic, reusable Cloud Functions auth infrastructure, not Google-specific, and
// harmless to keep for a future function that needs the same requireUser() pattern. They
// are not deployed or billed while nothing here exports them.
//
// This file currently exports nothing, so `firebase deploy --only functions` deploys an
// empty function set. If any of the original 8 googleCalendar* functions are still
// deployed from before this change, run (or ask the user to run):
//   firebase functions:delete googleCalendarStatus googleCalendarConnect \
//     googleCalendarCallback googleCalendarListCalendars googleCalendarSelectCalendars \
//     googleCalendarSetDisplayEnabled googleCalendarDisconnect googleCalendarEvents \
//     --region=africa-south1 --project=capdatabasefb2
