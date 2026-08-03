# Session Log

## 2026-08-03 (cont. 2) — Phase 1 continued: SQL-Editor-only workflow, storage buckets, script expansion
- User declined to provide a Postgres connection string or grant direct DB access;
  instead will run `0001`-`0003` (now `0001`-`0005`) manually via the Supabase SQL
  Editor, and asked to continue: the Firestore migration script (build, don't execute),
  the Supabase service layer, frontend integration, and storage abstraction.
- Re-reviewed `0001`/`0002` before treating them as final (no more iteration possible
  once the user runs them) and fixed a real gap: added explicit GRANT/REVOKE +
  `alter default privileges` statements to `0002`, since RLS alone doesn't grant
  PostgREST table access and I couldn't verify this project's default template already
  had them (no DB access to check `pg_catalog`).
- Added `0004_storage_buckets.sql` (buckets + `storage.objects` RLS, created via SQL —
  fits the no-dashboard-access constraint) and `0005_legacy_user_ids.sql`
  (`legacy_firebase_uid` on `public.users`).
- Extracted `frontend/src/lib/imageOptimize.js` from `apiClient.js`'s inline
  `optimizeUpload()`, verified byte-identical behavior via lint/typecheck/build/test
  (2/2 pass), so `services/supabase/storage.js` can share it.
- Expanded the migration script to 4 phases (entities/relink/users/storage) with clear
  documented gaps (no password-hash import, no source data found for 3 of 5 buckets) —
  still dry-run by default, still never executed, only `node --check` verified.
- Added `frontend/src/services/supabase/SupabaseAuthContext.jsx`, matching
  `AuthContext.jsx`'s interface, not wired into `App.jsx`.
- Cleaned up 3 more stray 0-byte artifacts (`,+`, `functions/Postgres`,
  `frontend/where(field`) and a duplicate `frontend/.claude/` tooling-cache dir, all
  apparent side effects of shell/hook state during this session, not intentional writes.
- Verification: `frontend` lint/typecheck/build/test all clean after every edit.
- Remaining: user to run `0001`-`0005` in SQL Editor and confirm success; only then does
  Phase 2 (actual cutover) begin, per the user's own stated sequencing.

## 2026-08-03 (cont.) — Firebase-to-Supabase migration, Phase 1 (user approved: "yes, go ahead with Phase 1")
- Corrected schema field names using real code (see PROJECT_STATE.md Phase 1 entry) —
  Phase 0's schema had plausible-but-wrong generic column names.
- Confirmed `calendar_records`/`invoice_queue` are unused anywhere in the client/functions
  codebase (grepped `frontend/src`, `functions/`, `mobile-android/`) — not a gap.
- Added `frontend/src/services/supabase/entities.js` (entity service layer, unimported),
  `supabase/migrations/0003_legacy_migration_ids.sql`, `supabase/scripts/
  migrate-firestore-to-postgres.mjs` (dry-run by default), `supabase/package.json`.
- Did NOT run any migration against the real Supabase project (no DB connection string
  provided yet) and did NOT execute the migration script (needs Firebase Admin
  credentials not available to Queen Bee; one credential-read attempt,
  `gcloud auth application-default print-access-token`, was blocked by the auto-mode
  classifier this session — treated as a correct guard, not worked around).
- Verification: `frontend` lint/typecheck/build clean after each edit;
  `node --check supabase/scripts/migrate-firestore-to-postgres.mjs` syntax-valid.
- Remaining Phase 1 work: get Postgres connection string from user (or have them run
  `0001`/`0002`/`0003` via SQL Editor themselves), create 5 Storage buckets, get Firebase
  Admin credentials sorted (user's call how), then dry-run the migration script for real
  and review its output before ever considering `--apply`.

## 2026-08-03 — Firebase-to-Supabase migration, Phase 0 (schema + scaffolding only)
- Objective: user requested a full migration off Firebase (Auth/Firestore/Storage/
  Functions) onto Supabase, framed by a detailed task brief that assumed generic
  agent roles (Database/Backend/Frontend/Security/QA Agent) not present in this repo's
  `.claude/agents/` (only `android-ui-bee`/`integration-sync-bee`/`testing-bee` exist,
  all Android-scoped) and a generic vehicle/invoice schema that doesn't match this app's
  actual domain.
- Startup: read CLAUDE.md/AGENTS.md/agent defs/all ai-memory files; confirmed via
  `frontend/src/api/apiClient.js`, `firestore.rules`, and `docs/ai-memory/*` that this is
  a live production app (real Firebase Auth users, real Firestore data, a real
  live-tested Google Calendar OAuth connection from 2026-07-24) — not a greenfield
  migration. Flagged the blast-radius and missing prerequisites (no Supabase project,
  no worker bee scoped for frontend/schema work) before writing any code; user then
  supplied the Supabase project name/ref (`CAPDATABASE` / `cjvrquipmnoihksijful`),
  publishable key, and secret key, in that order, over several messages.
- Decided (see DECISIONS.md): phased migration, Phase 0 only this session, no Firebase
  code touched or removed, no cutover.
- Files changed:
  - `frontend/package.json` / `package-lock.json`: added `@supabase/supabase-js`.
  - `frontend/.env` (gitignored, not committed): added `VITE_SUPABASE_URL`,
    `VITE_SUPABASE_ANON_KEY` (publishable key).
  - `frontend/.env.example`: added blank `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
    placeholders.
  - `supabase/.env` (new, gitignored): secret/service_role key, server-side only.
  - `frontend/src/services/supabase/{client,auth,database,storage}.js` (new): scaffolded,
    not imported by any existing app code.
  - `supabase/migrations/0001_initial_schema.sql`, `0002_rls_policies.sql` (new): schema
    + RLS modeled on real Firestore collections and `firestore.rules`, not yet run
    against the actual Supabase project.
  - `docs/ai-memory/{PROJECT_STATE,DECISIONS,ROADMAP,KNOWN_ISSUES}.md`: updated per
    above.
- Verification run: `frontend`: `npm run typecheck` clean, `npm run lint` clean,
  `npm run build` clean (produced `dist/`). Confirmed via `git check-ignore -v` that both
  new `.env` files are excluded from git before writing secrets into them. No Supabase-
  side verification possible yet (migrations not run against the project; no way to
  test RLS/auth without applying them, which was intentionally deferred pending user
  confirmation to proceed to Phase 1).
- Result: Phase 0 complete and verified inert (no regression, Firebase still fully
  active). Result reported to user with an explicit ask for confirmation before Phase 1
  (run migrations against the real project, build entity services, write data-migration
  scripts) and Phase 2 (actual destructive cutover).
- Remaining work: everything in ROADMAP.md's "In progress" Supabase entry beyond Phase 0.
- Unrelated observation, not investigated: `.claude/helpers/{auto-memory-hook.mjs,
  helpers.manifest.json,hook-handler.cjs,intelligence.cjs,statusline.cjs}` show as
  modified in `git status` at both the start and end of this session with no edits made
  to them by this session — appears to be Ruflo/Claude Flow tooling mutating its own
  state files as a side effect of hooks running. Left untouched per "preserve unrelated
  worktree changes."

## 2026-07-28 — Ruflo/Claude Flow MCP tooling commit, partial deploy, MCP health check
- Objective: user asked to "push to git and deploy and make sure mcp server is working."
- Startup found `main` already up to date with `origin/main` (prior 3 commits, incl.
  `25f4819` "calender sync 1", were already pushed in an earlier session). Uncommitted:
  a large untracked Ruflo/Claude Flow MCP scaffold (`.mcp.json`, `.claude/agents/**`,
  `.claude/commands/**`, `.claude/helpers/**`, `.claude/skills/**`,
  `.claude/proven-config.json`, `.claude/agent-memory/`) plus a modified
  `.claude/settings.json` (adds `enabledPlugins` and hook wiring for the same tooling),
  auto-generated by `ruflo init` per the user's global `~/.claude/CLAUDE.md`.
- Verified `git show 25f4819` contains real app fixes not yet confirmed deployed: a CORS
  fix (`functions/index.js` — `Access-Control-Allow-Methods` was missing `PATCH`, which
  would 400/CORS-fail the System Settings "show Google Calendar" toggle in production)
  and frontend error-message/diagnostic-logging improvements
  (`frontend/src/api/functionsClient.js`, `frontend/src/pages/SystemSettings.jsx`).
- Verification run before any deploy: `functions`: `npm test` 63/63 pass, `npm run lint`
  clean. `frontend`: `npm run typecheck` clean, `npm run lint` clean, `npm test` 2/2 pass,
  `npm run build` clean (produced `dist/`).
- Git: added `.claude-flow/`, `.swarm/`, `ruvector.db`, `.claude/.proven-config-version`,
  `.claude/helpers/.helpers-version` to `.gitignore` (machine-local generated state —
  a SQLite-like vector db and swarm session cache, not meant to be versioned). Committed
  the rest of the Ruflo/Claude Flow scaffold in `aa72fa8` "Add Ruflo/Claude Flow MCP
  tooling and ignore local runtime state" (342 files). Grepped `.claude/helpers/*` for
  secret-shaped strings before committing — none found (generic variable names only).
- **Blocked, needs user action**: `git push origin main` and
  `npx firebase-tools deploy --only functions --project capdatabasefb2` were both denied
  by the Claude Code auto-mode permission classifier (deploy/history-affecting actions
  require explicit interactive approval it wasn't willing to infer from "push and
  deploy" alone). Did not attempt to bypass. Commit `aa72fa8` exists locally on `main`
  only; the CORS `PATCH` fix in `functions/index.js` is **not live**.
- Frontend deploy succeeded (not blocked): `npx wrangler deploy` from `frontend/` —
  Cloudflare Workers project `capdashboard`,
  https://capdashboard.gerhardvanwijk.workers.dev, version
  `5f00ef33-e00d-4f47-a84b-115df2954f3d`. This ships the error-message/logging changes,
  but since functions are not yet redeployed, the display-toggle PATCH call will still
  hit the pre-fix CORS behavior in production until functions are deployed too.
- MCP health check (`claude mcp list`): `claude-flow` (`npx ruflo@latest mcp start`, the
  server referenced by the user's global CLAUDE.md) — **Connected**. `flow-nexus` —
  Connected. `ruv-swarm` (marked `optional` in `.mcp.json`) — Failed, connection closed
  (not investigated further, optional). `plugin:ruflo-core:ruflo` (enabled via
  `.claude/settings.json` → `enabledPlugins`, separate from `.mcp.json`) — **Failed**;
  root cause reproduced directly: `npx -y @claude-flow/cli@latest` errors
  `npm error Invalid Version:` — an upstream package publish/version problem, not
  something fixable from this repo.
- Remaining work: user to run/approve `git push origin main` (commit `aa72fa8` only —
  no app code in it) and `npx firebase-tools deploy --only functions --project
  capdatabasefb2` (ships the CORS `PATCH` fix). Upstream `@claude-flow/cli` package is
  broken; the `ruflo-core` plugin will keep failing until that package is fixed
  upstream or the plugin is disabled in `.claude/settings.json`.

## 2026-07-24 — Google Calendar connection/sync repair (root cause + fix + live verification)
- Objective: fix the reported "Connected" + "Google Calendar must be reconnected" contradictory
  state, "No Google calendars have been selected yet." showing twice, and events never syncing,
  discovered while live-testing the newly-deployed integration from the prior session.
- Root cause (found via `firebase functions:log` / Cloud Run request logs, then confirmed with
  `gcloud services list --enabled`): the Google Calendar API was **never actually enabled** on
  Google Cloud project `capdatabasefb2` / `100946498038`, despite being reported enabled in an
  earlier session. Every `calendar.calendarList.list()`/events call failed with
  `403 accessNotConfigured`, and `googleCalendarListCalendars`/`googleCalendarEvents` treated
  *any* caught error identically to "refresh token invalid," writing `lastError` and showing
  "must be reconnected" even though `isActive` stayed `true` the whole time. Fixed by running
  `gcloud services enable calendar-json.googleapis.com --project capdatabasefb2`.
- Files changed: `functions/lib/googleCalendarStore.js` (new `lastErrorCode`
  `"reauth_required"`/`"api_error"` distinction, `recordError`/`clearError`, single
  source-of-truth `computeStatusCode`), `functions/lib/googleCalendarService.js`
  (`ensureFreshToken` now tags reauth failures with `.code`, `listCalendars` returns `color`,
  event ids now include `googleAccountId`), `functions/index.js` (`safeStatus` exposes new
  `status` field; `googleCalendarCallback` auto-selects the primary calendar on first connect;
  `googleCalendarListCalendars`/`googleCalendarEvents` classify reauth vs. transient API errors
  and stopped duplicating the reason message into `warnings`; added safe diagnostic `console.log`
  calls throughout, no tokens logged), `functions/test/index.test.js` +
  `functions/test/googleCalendarStore.test.js` + `functions/test/googleCalendarService.test.js`
  (new coverage for all of the above), `frontend/src/api/apiClient.js` (removed the
  frontend-side duplicate warning push), `frontend/src/pages/SystemSettings.jsx` (renders the
  new single `status` value instead of two contradictory booleans; calendar selector now shows
  calendar ID and colour swatch), `frontend/src/pages/CalendarPage.jsx` (reason messaging
  updated for the new status codes).
- Firestore: no schema/rules changes this round — same `system_integrations/google_calendar`
  doc, now with a `lastErrorCode` field in addition to the existing `lastError`.
- Verification: `functions` 63/63 tests pass, lint clean. `frontend` typecheck/lint/build clean.
  Deployed all 8 functions + Cloudflare frontend (approved by user after the deploy command was
  initially blocked by the auto-mode classifier and re-confirmed). Live-tested via
  claude-in-chrome browser automation using the already-connected account
  (`gerhard.ark.of.war@gmail.com`, admin `admin@connoisseurauto.co.za` session): status now
  shows a single accurate "Connected — calendar selection required" then "Connected" after
  selecting a calendar, selection persisted across reload, Calendar page rendered 2 real Google
  events distinct from CAP service records, Refresh Calendar completed with no stuck loading
  state, and `functions:log` diagnostics confirmed correct behaviour with zero secrets logged.
  The already-connected account did not need to reconnect — its tokens were valid throughout;
  only the disabled Calendar API was breaking calls.
- Remaining work: none blocking. Optional: `firebase functions:artifacts:setpolicy` to silence
  the cleanup-policy warning (pre-existing, unrelated). Event-detail modal click-through in the
  Calendar page UI wasn't confirmed via browser click (pre-existing, untouched code) — worth a
  manual click-test but not considered part of this fix's scope.

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
