# Project State
_Last verified: 2026-07-23 (static repo inspection, no builds/tests run this session)_

## Works (verified in code)
- Web (`frontend/`) and Android (`mobile-android/`) both talk to Firebase directly:
  Auth via Firebase Auth (`frontend/src/lib/firebase.js`), Firestore CRUD via
  `frontend/src/api/apiClient.js` against the named database `"capdashboard"`.
- Google Calendar integration is code-complete end-to-end: `frontend/src/api/apiClient.js`
  (`googleCalendarRoute`, lines ~253-280) calls 7 callable Cloud Functions in
  `functions/index.js` (status/connect/callback/listCalendars/selectCalendars/
  disconnect/events), each guarded by `requireUser`/`requirePermission`
  (`functions/lib/auth.js`), region `africa-south1`, project `capdatabasefb2`.
  Android has a read-only `GoogleCalendarRepository.kt` consuming the same functions.
- `firestore.rules` enforces role/permission checks via `users/{uid}.effective_permissions`
  and `isAdmin()`/`hasPermission()` helpers for clients, permissions, role_permissions, etc.
- Laravel (`backend/`) still has full controllers/tests for clients, machines, service
  records, job cards, users, permissions, and Google Calendar
  (`GoogleCalendarController.php`, `CalendarController.php`, tests
  `GoogleOauthWorkflowTest.php`, `CalendarModuleTest.php`) — but neither client calls
  these endpoints for normal CRUD or calendar; Laravel Google Calendar code is dead code
  unless a client is intentionally reconnected.

## Partially complete
- Android "Connection and Sync Status" feature: `StatusRepository` and `ConnectionStatus`
  enum already implemented in `Core.kt` (lines 56, 122+), but no `ConnectionStatusScreen.kt`
  UI exists yet under `mobile-android/app/src/main/java/.../ui/` — matches the scope split
  described in `.claude/agents/android-ui-bee.md` and `integration-sync-bee.md`.

## Not implemented / unverified
- Real Google OAuth flow has not been verified live (per `docs/GOOGLE_CALENDAR_SETUP.md`,
  setup requires manual Google Cloud Console steps). Do not report the integration as live
  until confirmed.
- No build/test run performed this session (frontend `npm run build`/`lint`/`typecheck`,
  Android `gradlew.bat`, Laravel `php artisan test`, functions `npm test` — all unexercised
  as of this memory-setup pass).

## Deployment
- Frontend deploys to Cloudflare via `wrangler.jsonc`, project `capdashboard`.
- Firebase project id: `capdatabasefb2`. Functions region: `africa-south1`.

## Repo hygiene note (not app code, unverified intent)
- Root contains `rename_api_client.py` and `rename_api_client_TEMP.txt`, both 0 bytes.
  Left untouched — may be in-progress/scratch files from a prior session.
