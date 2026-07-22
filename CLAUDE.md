# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture — read this before touching data flow

This repo contains three apps plus a mostly-superseded API:

- `frontend/`: React/Vite web client (deployed to Cloudflare via `wrangler.jsonc`, project name `capdashboard`).
- `mobile-android/`: Native Kotlin/Compose client (MVVM, Hilt, Room, WorkManager).
- `backend/`: Laravel 13 API (MySQL, Sanctum, `app/Models`, `app/Http/Controllers`).
- `docs/`: API and implementation documentation.

**`AGENTS.md` at the repo root says "frontend only communicates with Laravel" and "never connect a client directly to MySQL, Google, Sage, or SMTP" — this is now out of date for Firestore.** Both `frontend` and `mobile-android` talk to **Firebase directly**:

- Auth is Firebase Auth (`frontend/src/lib/firebase.js`, `frontend/src/lib/AuthContext.jsx`), not Sanctum.
- All CRUD (clients, machines, service records, job cards, users, knowledge base, permissions) reads and writes **Firestore** directly from the browser/app — see `frontend/src/api/apiClient.js`. There is no HTTP call to Laravel for any of this; `apiClient.request(path)` maps REST-shaped paths onto Firestore collection operations (`routeCollections` / `endpointMap`) via the SDK.
- File uploads go straight to Firebase Storage (`apiClient.integrations.Core.UploadFile`), with client-side image downscaling to WebP before upload.
- Authorization for this data is enforced by **`firestore.rules`** (role/permission checks against the signed-in user's own `users/{uid}` document), not by Laravel middleware — `RequirePermission`/`RequireRole` in `backend/app/Http/Middleware` guard the Laravel API only, which the clients no longer call for these resources.
- The Laravel backend (`backend/`) still has full routes/controllers/Sanctum/permission tables for clients, machines, service records, job cards, and users, but neither client currently calls those endpoints. Treat backend changes to these resources as needing a corresponding Firestore + `firestore.rules` change to actually take effect for users, and don't assume adding a Laravel endpoint alone changes client behavior.
- One partially-wired exception: `frontend/src/pages/SystemSettings.jsx` calls `apiClient.request('/google-calendar/...')` for the Google Calendar connect/disconnect flow, but `apiClient.js`'s Firestore router has no case for `google-calendar` — it falls through to the generic "Firebase route is not available" (501) error. Laravel's `GoogleCalendarController`/`CalendarController` routes exist and are exercised by `backend/tests/Feature/GoogleOauthWorkflowTest.php` and `CalendarModuleTest.php`, but the frontend has no working path to reach them since it stopped talking to Laravel for other resources.
- The permission model is duplicated in two places that must be kept consistent by hand: Laravel's `permissions`/`role_permissions`/`user_permissions` tables (`backend/app/Models`) and Firestore's `permissions`/`role_permissions` collections + `effective_permissions` array on each `users/{uid}` doc, read by both `firestore.rules` and `AuthContext.jsx`/`apiClient.js`.
- Firestore database is explicitly named `"capdashboard"` (`getFirestore(firebaseApp, "capdashboard")`), not the default database — keep that in mind if adding new Firestore SDK calls or writing security rules against a different database id.

## Commands

Frontend (`frontend/`):
- `npm run dev` — Vite dev server
- `npm run build` — production build (outputs to `dist/`, served by `wrangler`)
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run typecheck` — `tsc -p ./jsconfig.json` (JS project with type-checking via JSDoc/jsconfig, not a TS build — don't convert `.jsx` files to `.tsx`, per `AGENTS.md`)
- `npm test` — runs `tests/*.test.js` via the built-in Node test runner (`node --test`); to run a single file: `node --test tests/records.test.js`
- `npm run test:e2e:live` — runs `tests/live-sync.mjs` directly against live Firebase (not a mock/emulator); only run this deliberately

Backend (`backend/`):
- `composer install`
- `composer run dev` — runs `php artisan serve`, `queue:listen`, `pail` (log tailing), and `npm run dev` together via `concurrently`
- `composer run test` (or `php artisan test`) — full PHPUnit suite (`tests/Unit`, `tests/Feature`)
- Single test: `php artisan test --filter=TestName` or `php artisan test tests/Feature/SomeTest.php`
- `composer run setup` — first-time bootstrap (copies `.env`, generates key, migrates, installs/builds frontend assets for Laravel's own Vite integration)

Mobile (`mobile-android/`):
- `gradlew.bat testDebugUnitTest lintDebug assembleDebug` (Windows) — unit tests, lint, debug build
- Single test class: `gradlew.bat testDebugUnitTest --tests "com.example.SomeClassTest"`

## Conventions and constraints (from `AGENTS.md`)

- JavaScript stays JavaScript/JSX — no incidental TypeScript conversion.
- Android: Kotlin, Compose, MVVM, Hilt, repositories, immutable UI state.
- Never commit `.env`, tokens, credentials, signing files, or production passwords.
- Store Android bearer/session tokens only via Keystore-backed encrypted storage; never store passwords.
- Do not run `migrate:fresh`, delete business data, or rewrite existing Laravel migrations.
- Preserve unrelated worktree changes; use feature branches/worktrees for parallel work; don't force-push shared branches.
- Changed backend behavior needs feature tests; Android domain/view-model changes need unit tests, and important navigation needs Compose tests.
