# Session Log

## 2026-07-23 — Google Calendar shared-integration feature + loading/error bugfixes (implemented, not deployed)
- Objective: fix "Unable to reach the server" / infinite loading-state bugs reported on
  System Settings and the Calendar page, and implement the required shared-company-level
  Google Calendar behaviour (admin-managed single connection, system-wide display toggle,
  persisted per-user display preference, real Disconnect, distinct error/loading states).
- Process note: worker-bee delegation as literally requested (`integration-sync-bee` for the
  Firebase audit, `testing-bee` for security/verification) was not possible — both agents, as
  actually defined in `.claude/agents/*.md`, are hard-scoped to `mobile-android/`'s Core.kt
  Test Connection feature only, contradicting `CLAUDE.md` §5's description of their scope.
  `integration-sync-bee` explicitly refused the task and named its real scope. Investigation
  was done directly via three read-only `Explore` agents instead; implementation was done
  directly by Queen Bee (frontend/functions/rules), since no worker bee can touch those paths.
  This CLAUDE.md/agent-definition mismatch should be resolved deliberately in a future session.
- Root cause confirmed: `frontend/src/pages/SystemSettings.jsx`'s `load()` had no
  try/catch/finally, so any status-fetch failure left `status` permanently `null` (infinite
  "Loading connection status…") while also showing the error banner. The original "Unable to
  reach the server" report was most likely a transient post-deploy Cloud Run/`*.cloudfunctions.net`
  propagation window (live logs showed zero requests reaching the functions in the first ~5
  minutes after the 2026-07-23 deploy, then clean successful requests afterward and via manual
  curl) — CORS (`functions/index.js` `applyCors`) was confirmed correctly configured throughout.
- Files changed: `functions/lib/googleCalendarStore.js` (added `displayEnabled` flag,
  `isDisplayEnabled`/`setDisplayEnabled`, `clearConnection` now clears identity/selection too),
  `functions/lib/googleCalendarService.js` (added best-effort `revokeConnection`),
  `functions/index.js` (new `googleCalendarSetDisplayEnabled` export, `display_enabled` in
  `safeStatus`, `reason`-branching in `googleCalendarEvents`, disconnect now revokes token),
  `functions/test/index.test.js` + `functions/test/googleCalendarStore.test.js` (new coverage),
  `firestore.rules` (users/{uid} may now self-update only their `preferences` field, via
  `affectedKeys().hasOnly(['preferences','updated_at'])` — narrowest possible carve-out),
  `frontend/src/api/functionsClient.js` (20s request timeout via AbortController, distinct
  timeout message), `frontend/src/api/apiClient.js` (new `display` route, `google_reason`
  pass-through), `frontend/src/pages/SystemSettings.jsx` (rewritten: fixed loading bug, Retry
  button, system-wide display toggle, AlertDialog-confirmed Disconnect),
  `frontend/src/pages/CalendarPage.jsx` (rewritten: persists "Show Google Calendar" to
  `users/{uid}.preferences.show_google_calendar`, fetches status to gate/explain the toggle,
  surfaces distinct `reason` messages, moved the loading indicator into the Refresh button
  instead of an overlay that collided with FullCalendar's view controls),
  `frontend/src/App.jsx` + `frontend/src/components/AppLayout.jsx` +
  `frontend/src/components/RoleGuard.jsx` (aligned the `/settings` route guard and nav-link
  permission to the same `hasAnyPermission` set the backend already used — they previously
  required two different single permissions, a pre-existing inconsistency found during audit).
- Verification run: `functions`: `npm test` 52/52 pass, `npm run lint` clean. `frontend`:
  `npm run typecheck` clean, `npm run lint` clean, `npm test` 2/2 pass, `npm run build` clean
  (exit 0). No deploy performed. `firestore.rules` could not be verified live — no Java runtime
  available for the Firestore emulator; static review only, disclosed as such.
- Flagged, not fixed: no evidence found that `calendar.google.*` permission keys are seeded
  into Firestore's `permissions`/`role_permissions` collections (only a legacy Laravel seeder
  has them) — recommend checking Firebase Console before/after deploy, since a missing seed
  would 403 every non-admin calendar request regardless of role.
- Deployment (user-approved, run in three steps): `firestore.rules` deployed and compiled
  cleanly; all 8 functions deployed (7 updated + new `googleCalendarSetDisplayEnabled`
  created), sanity-checked live via curl (CORS OPTIONS 204, callback redirect 302) at the
  stable `https://africa-south1-capdatabasefb2.cloudfunctions.net/*` URLs clients already use;
  frontend rebuilt (`npm run build`, clean) and deployed to Cloudflare
  (`capdashboard`, https://capdashboard.gerhardvanwijk.workers.dev, version
  `b525df23-c936-4c6e-af94-ac0b26262f31`). First `wrangler deploy` attempt crashed before
  uploading anything (stale `npx` cache had an incomplete wrangler install missing the Windows
  `@cloudflare/workerd-windows-64` native binary) - cleared that npx cache entry, reinstalled
  wrangler fresh, retry succeeded. Note: a background-task completion notification for the
  first, failed attempt incorrectly reported exit code 0 - always read the actual output file
  rather than trusting the notification summary when a step's success is load-bearing.
- Result: implementation complete, locally verified, and now **fully deployed**.
- Remaining work: post-deploy live verification of a real connect→consent→callback round trip
  (still never exercised end-to-end) and of the new display-toggle/per-user-preference/
  disconnect behaviour in the live UI; confirm `calendar.google.*` permission seeding in
  Firebase Console for non-admin roles.

## 2026-07-23 — Google Calendar OAuth pre-deployment audit
- Objective: user completed Google Cloud OAuth client setup for `capdatabasefb2` and asked
  for inspection-only verification before deploying secrets/functions — exact secret names,
  redirect URI match, CSRF/state validation, function bindings, and local build/test results.
- Delegation: `integration-sync-bee` (Firebase/OAuth code inventory) then `testing-bee`
  (CSRF/state security review + local builds/tests), run sequentially, no overlapping edits.
  No files were changed by either worker.
- Findings: secrets (`GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET`) correctly declared via
  `defineSecret()` and bound to all 7 functions in `functions/index.js`; redirect URI built
  in code matches `docs/GOOGLE_CALENDAR_SETUP.md` exactly; OAuth `state` CSRF protection
  verified adequate (random, hashed at rest, single-use, TTL, uid-bound, no open redirect).
- Verification run: `functions`: `npm test` 46/46 pass, `npm run lint` clean. `frontend`:
  `npm run typecheck` and `npm run lint` clean. No deploy, no secret values entered or
  requested from the user.
- Deployment: user stored both secrets themselves via interactive `firebase
  functions:secrets:set` (after one misnamed attempt as `GOOGLE_CLIENT_SECRET` was caught
  and corrected). Queen Bee ran the scoped deploy
  (`firebase deploy --only functions:googleCalendarStatus,...Events --project
  capdatabasefb2`) after explicit user approval. First two attempts failed on environment
  issues (missing secret, then missing `FRONTEND_URL` param value in non-interactive mode);
  fixed by creating gitignored `functions/.env.capdatabasefb2` with the public
  `FRONTEND_URL` default. Third attempt succeeded: all 7 functions created, secret access
  granted to the runtime service account. A trailing non-fatal warning about a missing
  Artifact Registry cleanup policy in `africa-south1` was logged (cost hygiene, not
  functional) — see [[KNOWN_ISSUES]].
- Security note: the user twice pasted a real Google OAuth Client Secret value directly into
  this chat. Both times it was not stored, logged, or reused — flagged to the user and
  reiterated that secret values must only be entered at the interactive CLI prompt, never in
  conversation. First pasted value was rotated in Google Cloud Console before use.
- Result: Google Calendar functions are deployed and live at
  `https://africa-south1-capdatabasefb2.cloudfunctions.net/googleCalendar*`. Integration is
  NOT yet confirmed end-to-end — no real user has completed a connect→consent→callback
  cycle yet.
- Remaining work: user (or a permitted user) to perform one real Connect Google Calendar
  flow from System Settings; Queen Bee to check Cloud Functions logs afterward to confirm a
  clean callback. Optionally run `firebase functions:artifacts:setpolicy --project
  capdatabasefb2` to silence the cleanup-policy warning.

## 2026-07-23 — Queen Bee first-run memory setup
- Objective: follow CLAUDE.md's "First-run Queen Bee setup" protocol — `docs/ai-memory/`
  did not exist, so create it from verified repository evidence only.
- Files changed: created `docs/ai-memory/PROJECT_STATE.md`, `ARCHITECTURE.md`,
  `DECISIONS.md`, `ROADMAP.md`, `KNOWN_ISSUES.md`, `SESSION_LOG.md` (this file). No
  application code changed.
- Verification performed: static inspection only — `git status`/`git log`, read
  `.claude/agents/*.md`, `frontend/src/lib/firebase.js`, `frontend/src/api/apiClient.js`
  (google-calendar routing), `functions/index.js`, `functions/lib/googleOAuthClient.js`,
  `firestore.rules`, `mobile-android/.../Core.kt` (StatusRepository), `backend/app/Http/
  Controllers` + `backend/tests/Feature` listings, `docs/GOOGLE_CALENDAR_SETUP.md`. No
  builds or test suites were run.
- Result: confirmed CLAUDE.md's Firebase-direct architecture and Google Calendar
  Cloud Functions claims match current code. Found the Android Connection/Sync Status
  UI screen is not yet implemented.
- Remaining work: none for this setup task. Future sessions should run actual
  builds/tests before updating PROJECT_STATE.md with live verification results.
