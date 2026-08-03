# Project State
_Last verified: 2026-08-03 (Firebase -> Supabase migration started, Phase 0 only — see below
and SESSION_LOG.md)_

## Firebase -> Supabase migration (2026-08-03, Phase 0 complete, NOT wired to app)
- User requested a full migration off Firebase (Auth, Firestore, Storage, Functions) onto
  Supabase. This is a live production app (real users, real Firestore business data, a
  real live-tested Google Calendar OAuth connection) — treated as high blast-radius, not
  a greenfield build. See DECISIONS.md for the phased approach and why nothing was cut
  over yet.
- Supabase project: name `CAPDATABASE`, ref `cjvrquipmnoihksijful`, URL
  `https://cjvrquipmnoihksijful.supabase.co`. Publishable (anon) key stored in
  `frontend/.env` (gitignored, local) and `frontend/.env.example` (blank placeholder).
  Secret (service_role-equivalent) key stored in `supabase/.env` (gitignored, server-side
  only, never imported by frontend/Android code) for future migration scripts. Both keys
  were pasted into chat by the user during this session — the secret key should be
  rotated in the Supabase dashboard once migration tooling is stable, since it now exists
  in session transcripts/logs outside version control.
- Done this session (Phase 0 — additive, not imported by any existing app code, verified
  not to break anything):
  - `@supabase/supabase-js` added to `frontend/package.json`.
  - `frontend/src/services/supabase/{client,auth,database,storage}.js` scaffolded,
    following the existing `firebase.js`/`AuthContext.jsx`/`apiClient.js` patterns
    (fail-fast on missing env vars, abstraction boundary so pages never call the SDK
    directly). Buckets planned: profile-images, invoices, documents, photos, attachments
    (not yet created in the Supabase project).
  - `supabase/migrations/0001_initial_schema.sql`: normalized Postgres schema modeled on
    the **actual** Firestore collections read from `frontend/src/api/apiClient.js`
    (clients, sites, machines, service_records, job_cards, job_card_lines,
    knowledge_machines/notes/service_codes/media/documents, users, permissions,
    role_permissions), not the generic vehicle/invoice tables suggested in the original
    task brief — this is a machine-servicing business, not an automotive shop. Also added
    `notifications`/`audit_logs` (new, no Firestore precedent). Deliberately does NOT
    include `calendar_records`/`invoice_queue` (referenced in `firestore.rules` but their
    field shapes were not inspected this session — do not assume they were forgotten).
  - `supabase/migrations/0002_rls_policies.sql`: RLS policies translating
    `firestore.rules` 1:1 — same permission keys (`clients.view/create/edit/delete`,
    `machines.*`, `services.*`, `job_cards.*`, `job_cards.lines.manage`,
    `knowledge_base.*`), same admin bypass (`is_admin()`), same active-profile gate. The
    Firestore self-update-preferences-only rule for `users/{uid}` (diff().affectedKeys())
    has no direct RLS equivalent — implemented as a `BEFORE UPDATE` trigger
    (`restrict_self_user_update`) instead of a policy.
  - Verified: `frontend`: `npm run typecheck`, `npm run lint`, `npm run build` all clean
    with the new files present but unimported.
## Phase 1 (2026-08-03, user approved "go ahead with Phase 1")
- Corrected `0001_initial_schema.sql`'s `clients`/`machines`/`service_records`/
  `job_cards`/`job_card_lines` column names to match real field usage found by grepping
  `AddClient.jsx`, `MachineDetail.jsx`, `JobCardDetail.jsx`, and `apiClient.js`'s
  `calendarEvents()` (e.g. `company_name` not `name`, `next_service_due`/
  `technician_name` on service_records, `fault_description`/`technician_notes` on
  job_cards) — the Phase 0 version used plausible-but-wrong generic names.
  `job_cards.status` and `job_card_lines.line_type` are free text (not enums), matching
  the string constants used in `JobCardDetail.jsx` (`STATUSES`, `LINE_TYPES`).
- Confirmed `calendar_records`/`invoice_queue` (present in `firestore.rules`) are unused
  by any current client/function code — not a schema gap, deliberately not modeled.
- Added `frontend/src/services/supabase/entities.js`: entity service layer
  (`ClientService`, `MachineService`, `ServiceRecordService`, `JobCardService`,
  `JobCardLineService`, `KnowledgeBaseService`, `UserService`, `PermissionService`,
  `RolePermissionService`, `NotificationService`) built on `database.js`. Not imported
  by any page yet.
- Added `supabase/migrations/0003_legacy_migration_ids.sql`: `legacy_firestore_id`
  columns + indexes on the tables the migration script needs for later FK re-linking.
- Added `supabase/scripts/migrate-firestore-to-postgres.mjs` + `supabase/package.json`:
  Firestore -> Postgres export/import script, dry-run by default. Syntax-checked
  (`node --check`), dependencies not installed, **not executed** — needs Firebase Admin
  credentials Queen Bee does not have and should not try to obtain (the auto-mode
  classifier already blocked one credential-read attempt this session). The script's own
  output lists 4 unfinished TODOs (FK re-linking, `auth.users` creation, Storage file
  copy, and confirming `--apply` even works until `0003` is applied) — do not treat it as
  migration-ready.
- Verified: `frontend`: `npm run lint`/`typecheck`/`build` all clean after every edit in
  this phase.
- **Still blocked / not done**: none of `0001`/`0002`/`0003` has been run against the
  real Supabase project (`CAPDATABASE`, ref `cjvrquipmnoihksijful`) — needs the Postgres
  connection string (Dashboard → Project Settings → Database), not yet provided. No
  Storage buckets created. No data migrated. Firebase Auth/Firestore/Storage/Functions/
  `firestore.rules` are all still fully active and unchanged; `AuthContext.jsx` and
  `apiClient.js` still talk to Firebase exclusively; Android untouched. Do not report any
  part of the Supabase migration as live.

## Phase 1 (cont., 2026-08-03) — user declined DB connection string, SQL-Editor-only workflow
- User: "We are not going to use a PostgreSQL connection string or grant direct database
  access. Generate all SQL migration files only. I will execute [0001-0003] manually in
  the Supabase SQL Editor. After I confirm they have executed successfully, continue with
  Phase 2." Also: continue building (not executing) the Firestore migration script, and
  continue frontend/service-layer/storage work without direct DB access.
- Re-reviewed `0001`/`0002`/`0003` before finalizing (user will run them as-is, no
  further iteration possible once submitted): found and fixed a real gap in `0002` —
  RLS policies alone don't grant PostgREST table access; added explicit
  `grant .../revoke ...` statements for `authenticated`/`anon` plus
  `alter default privileges` for future tables, rather than assuming this Supabase
  project's default template already grants them.
- Added `0004_storage_buckets.sql`: creates the 5 buckets (via `insert into
  storage.buckets`, so still SQL-Editor-only, no dashboard UI needed) + `storage.objects`
  RLS. `profile-images` uses a per-user-folder pattern; `invoices` uses the real
  `invoices.queue.view`/`invoices.edit` permission keys (present in
  `backend/database/seeders/PermissionsSeeder.php` and `firestore.rules`, even though the
  `invoice_queue` collection itself is unused); `documents`/`photos`/`attachments` default
  to "any active profile" since no real feature/permission exists for them yet — flagged
  as a default needing confirmation, not a final security decision.
- Added `0005_legacy_user_ids.sql`: `public.users.legacy_firebase_uid` column, needed
  because Supabase Auth generates its own uuid for `auth.users.id` (Firebase UIDs aren't
  valid uuids), so anything referencing a Firestore `users/{uid}` (e.g.
  `knowledge_notes.created_by`) needs a mapping to re-link after user migration.
- Extracted `frontend/src/lib/imageOptimize.js` from `apiClient.js`'s inline
  `optimizeUpload()` (byte-for-byte identical logic) so both the Firebase path and the
  new Supabase `storage.js` share one image-compression implementation. `apiClient.js`
  now imports and aliases it (`const optimizeUpload = optimizeImageForUpload`) — verified
  no behavior change via `npm run lint`/`typecheck`/`build`/`test` (2/2 pass) after the
  change.
- Expanded `supabase/scripts/migrate-firestore-to-postgres.mjs` into 4 phases (entities /
  relink / users / storage), still dry-run by default, **still never executed** (only
  `node --check` syntax-verified). Phase C (users) creates Supabase Auth users via
  `auth.admin.createUser` — note it cannot import Firebase password hashes, so migrated
  users will need a password-reset email before the real cutover. Phase D (storage) only
  covers `knowledge_media`/`knowledge_documents` (the only collections found with a
  `storage_path` field) — profile-images/invoices/attachments have no identified source
  data to copy from yet.
- Added `frontend/src/services/supabase/SupabaseAuthContext.jsx`: parallel auth context
  matching `AuthContext.jsx`'s exact public interface, so a future Phase 2 swap in
  `App.jsx` is close to drop-in. **Not wired into `App.jsx`** — Firebase's `AuthContext`
  remains the live one.
- Verified after every change: `frontend` `npm run lint`/`typecheck`/`build`/`test` all
  clean.
- Repo hygiene: removed 3 more stray 0-byte/junk artifacts this session (`,+`,
  `functions/Postgres`, `frontend/where(field`) and a duplicate `frontend/.claude/`
  tooling-cache directory — all appear to be side effects of shell/hook quirks during
  this session (e.g. `cd frontend` state persisting across Bash calls, causing a nested
  `.claude/` to be auto-generated by the Ruflo/Claude Flow hooks when a command ran with
  `cwd=frontend/`), not intentional writes. None were application code.
- **Still blocked**: `0001`-`0005` not yet run against the real project (waiting on the
  user's SQL Editor execution + confirmation before Phase 2 starts). Migration script not
  executed (waiting on Firebase Admin credentials, to be provided later per the user).

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
