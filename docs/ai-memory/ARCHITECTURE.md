# Architecture
_Source of truth: CLAUDE.md section 6-9, verified against code 2026-07-23_

## Apps
- `frontend/`: React/Vite web client, Cloudflare (`wrangler.jsonc`, project `capdashboard`).
- `mobile-android/`: Kotlin/Compose, MVVM, Hilt — package
  `za.co.connoisseurauto.capmobile` (main) — note: androidTest package path is
  `com.CAPDATABASE.capdatabase` (`LiveFirebaseSmokeTest.kt`), differs from main source
  package; worth double-checking before assuming a single package name project-wide.
- `backend/`: Laravel 13, MySQL, Sanctum — largely superseded for client CRUD, see below.
- `functions/`: Firebase Cloud Functions v2, Node 20, `functions/index.js` +
  `functions/lib/{auth,firebaseAdmin,googleCalendarService,googleCalendarStore,
  googleOAuthClient}.js`. Tests in `functions/test/*.test.js` (`node --test`).
- `docs/`: includes `docs/GOOGLE_CALENDAR_SETUP.md`.

## Data flow (verified, supersedes AGENTS.md's Laravel-only claim)
- Auth: Firebase Auth (`frontend/src/lib/firebase.js`, `AuthContext.jsx`).
- Firestore: `getFirestore(firebaseApp, "capdashboard")` — named database, not default.
  `apiClient.js` maps REST-shaped paths onto Firestore ops directly; no Laravel HTTP call
  for normal CRUD (clients, machines, service records, job cards, users, knowledge base).
- Storage: uploads go directly to Firebase Storage, with client-side WebP downscaling,
  via `apiClient.integrations.Core.UploadFile`.
- Authorization for the above: `firestore.rules` only. Laravel middleware
  (`RequirePermission`/`RequireRole`) protects Laravel routes only and has no effect on
  Firestore-direct client operations.

## Google Calendar (distinct path, not plain Firestore CRUD)
- `frontend/src/pages/SystemSettings.jsx` → `apiClient.js` `google-calendar/*` routes →
  callable Cloud Functions in `functions/index.js` → `googleCalendarStore.js` (state in
  Firestore doc `system_integrations/google_calendar`) + `googleCalendarService.js`
  (Google Calendar API via `googleapis`).
- OAuth client secret stays server-side (`functions/lib/googleOAuthClient.js`).
- Every callable function wrapped in `guarded()` → `requireUser` then
  `requirePermission`/`hasAnyPermission` (permissions: `calendar.google.view`,
  `.connect`, `.calendars.select`, `.disconnect`).
- Android: `GoogleCalendarRepository.kt` consumes the same functions, read-only.
- Laravel equivalents (`GoogleCalendarController.php`, `CalendarController.php`) exist
  and have feature tests but are not called by either active client.

## Permission model (duplicated, must be kept consistent by hand)
- Laravel: `permissions`, `role_permissions`, `user_permissions` tables/models.
- Firestore: `permissions`, `role_permissions` collections +
  `users/{uid}.effective_permissions` array, read by `firestore.rules` and by
  `AuthContext.jsx`/`apiClient.js` on the client, and by `functions/lib/auth.js` in
  Cloud Functions.
- `firestore.rules` helpers: `signedIn()`, `hasActiveProfile()`, `isAdmin()`,
  `hasPermission(permission)` (admin bypass, else membership check against
  `effective_permissions`).

## Worker-bee file ownership (from `.claude/agents/*.md`)
- `android-ui-bee`: Compose UI only in `mobile-android/.../capmobile/`; never touches
  `Core.kt` data/repository/Hilt code, `firestore.rules`, `storage.rules`, `firebase.json`,
  `.firebaserc`, `google-services.json`, package/applicationId.
- `integration-sync-bee`: owns `Core.kt` only; reuses existing repository patterns; same
  never-edit list as above plus never touches `backend/` or `frontend/`.
- `testing-bee`: runs `gradlew.bat testDebugUnitTest lintDebug assembleDebug` from
  `mobile-android/`; adds tests under `app/src/test/**` / `app/src/androidTest/**`; never
  edits application source; never runs publish/deploy tasks or touches `backend/`/`frontend/`.
