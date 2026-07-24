# Project State
_Last verified: 2026-07-23 (Google Calendar shared-integration feature implemented and locally
verified; not yet deployed — see SESSION_LOG.md)_

## Google Calendar — implementation status (2026-07-23, not deployed)
- Shared company-level model confirmed correct at the data layer: single
  `system_integrations/google_calendar` Firestore doc, one admin-managed connection, shared
  `selectedCalendarIds` — this was already the existing design, not new.
- Added this session: `displayEnabled` system-wide toggle (separate from connection aliveness),
  a real Disconnect (best-effort Google token revoke + clears calendar selection/identity, not
  just a UI hide), per-user persisted "Show Google Calendar" preference at
  `users/{uid}.preferences.show_google_calendar` (new narrow self-update `firestore.rules`
  carve-out), distinct `reason` codes on the events endpoint (not_connected/display_disabled/
  no_calendars_selected/reauth_required), a 20s request timeout, and a real fix for the
  System Settings infinite-loading bug (`load()` previously never left `status` at `null` on
  error). See `docs/ai-memory/SESSION_LOG.md` 2026-07-23 entry for the full file list.
- **Deployed** (2026-07-23): `firestore.rules`, all 8 functions (7 updated + new
  `googleCalendarSetDisplayEnabled`), and the Cloudflare frontend rebuild
  (https://capdashboard.gerhardvanwijk.workers.dev, version `b525df23-c936-4c6e-af94-ac0b26262f31`).
- **Live-tested end to end 2026-07-24**: real connect flow completed with account
  `gerhard.ark.of.war@gmail.com`. Root cause of the post-connect "must be reconnected" +
  duplicate "no calendars selected" bug: the Google Calendar API was never actually enabled on
  Cloud project `capdatabasefb2`/`100946498038` (confirmed via `gcloud services list` returning
  zero calendar services, despite being reported enabled earlier) — every `listCalendars`/events
  call 403'd with `accessNotConfigured`, and the code treated that identically to a genuinely
  invalid refresh token. Fixed: enabled `calendar-json.googleapis.com`; added a
  single-source-of-truth `status` field (`connected`/`calendar_selection_required`/
  `reauth_required`/`connection_error`/`disconnected`) in `functions/lib/googleCalendarStore.js`
  so `reauth_required` is only set on a genuinely invalid/missing refresh token, not any API
  failure; auto-selects the primary calendar on a fresh connect; removed the duplicate
  "no calendars selected" message (was pushed into both `warnings` and `reason`); added
  `color` to listed calendars and `googleAccountId` into the event dedup id; added safe
  diagnostic logging (verified live, no tokens logged). Redeployed all 8 functions + frontend
  (version `f209f804-6a3d-446e-89d1-d31e701925a8`). Verified live: one accurate status, calendar
  selection persisted, 2 real Google events synced onto the Calendar page, Refresh completes
  cleanly. The already-connected account did **not** need to reconnect — only the disabled API
  was breaking calls, not the tokens.

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
- Google Cloud OAuth client (`CAP Dashboard Google Calendar`, Web application type) created
  in project `capdatabasefb2`; Calendar API enabled; consent screen configured.
  `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET` are now stored in Firebase
  Secret Manager, and all 7 Google Calendar functions were deployed successfully on
  2026-07-23 (`googleCalendarStatus/Connect/Callback/ListCalendars/SelectCalendars/
  Disconnect/Events`, region `africa-south1`) with `secretAccessor` granted to the runtime
  service account. Deploy required adding `functions/.env.capdatabasefb2` (gitignored,
  non-secret — just `FRONTEND_URL=https://capdashboard.gerhardvanwijk.workers.dev`) since
  non-interactive `firebase deploy` can't confirm a parameter default; recreate this file if
  it's ever missing on redeploy. The **live OAuth round-trip (connect → consent → callback)
  has not yet been exercised by a real user** — do not report the integration as fully live
  until that's confirmed.
- 2026-07-23 code audit (queen-bee + integration-sync-bee + testing-bee) confirmed, by
  reading `functions/index.js` and `functions/lib/googleOAuthClient.js`/`googleCalendarStore.js`:
  - Secrets `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET` via `defineSecret()`,
    correctly bound to all 7 calendar functions, accessed lazily via `.value()`.
  - Callback redirect URI built in code == `https://africa-south1-capdatabasefb2.cloudfunctions.net/googleCalendarCallback`,
    matching `docs/GOOGLE_CALENDAR_SETUP.md` exactly.
  - OAuth `state` CSRF protection is solid: `crypto.randomBytes(32)` random, stored hashed
    in Firestore (`google_calendar_oauth_states/{sha256(state)}`) with the initiating uid,
    single-use (atomic transaction), 10-minute TTL, no client-suppliable redirect target.
  - Minor drift risk (not a bug): `googleOAuthClient.js` redeclares its own `REGION`/`PROJECT_ID`
    constants instead of importing them from `index.js` — currently identical values, but a
    second source of truth.
- Local verification run this session (no deploy):
  `functions`: `npm test` 46/46 pass, `npm run lint` clean, no build step (plain JS).
  `frontend`: `npm run typecheck` clean, `npm run lint` clean (build/e2e-live not run).

## Deployment
- Frontend deploys to Cloudflare via `wrangler.jsonc`, project `capdashboard`.
- Firebase project id: `capdatabasefb2`. Functions region: `africa-south1`.

## Repo hygiene note (not app code, unverified intent)
- Root contains `rename_api_client.py` and `rename_api_client_TEMP.txt`, both 0 bytes.
  Left untouched — may be in-progress/scratch files from a prior session.
