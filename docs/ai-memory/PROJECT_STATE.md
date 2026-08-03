# Project State
_Last verified: 2026-08-03 (Firebase -> Supabase migration: 0001 confirmed executed by the
user, 0002-0005 in progress; Phase 2 prep work done ahead of that finishing — see below and
SESSION_LOG.md)_

## Firebase -> Supabase migration — RLS coverage expanded, full cutover checklist written (2026-08-03)
- User approved continuing Phase 2 prep with hard constraints: Supabase work only, behind
  feature flags (not yet wired), Firebase stays the active production backend, and no
  Firestore migration/auth switch/frontend wiring/Android changes/Firebase removal without
  separate explicit approval. Interpreted "behind feature flags only" as design intent for
  the eventual cutover, not permission to touch `App.jsx`/`AuthContext.jsx`/the 13
  Firebase-dependent files now — did not touch any of them this round.
- Expanded `supabase/scripts/smoke-test.mjs` from testing only `clients` RLS to a
  data-driven matrix covering one representative table per distinct permission namespace:
  `clients` (`clients.view`), `machines` (`machines.view`), `job_cards`
  (`job_cards.view`), `knowledge_machines` (`knowledge_base.view`). Live run: **18/18
  checks pass** (seeding, deny, allow, both triggers, storage buckets). Cleanup respects
  the `machines.client_id` `ON DELETE RESTRICT` FK by deleting in reverse seed order.
- Wrote `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` — the complete task
  list/downtime-estimate/rollback-plan/verification-steps document the user asked for
  before requesting the final cutover. Surfaces several real, previously-implicit gaps as
  explicit open items rather than assuming them away: `sites` has no Firestore source to
  migrate from (confirm intentional), no password-reset-email script exists yet for
  migrated users (the data-migration script only reminds about this, doesn't do it), no
  incremental/delta-sync capability exists (one-time bulk import only — real implication
  for the write-freeze window at actual cutover time), Android cutover timing is an
  unmade decision, and `subscribe()`/`watch()` in `supabaseApiClient.js` re-query on every
  change rather than replicating Firestore's exact snapshot semantics.
- Verified: live `node scripts/smoke-test.mjs` run, 18/18 pass, all seeded rows across 4
  tables + the test user cleaned up automatically, `node --check` clean.
- Did NOT: touch `AuthContext.jsx`/`apiClient.js`/`App.jsx`/any Android file; run the
  Firestore migration script; remove Firebase code.

## Firebase -> Supabase migration — 0006/0007 both confirmed applied (2026-08-03)
- User attempted `0006` a second time and hit `column "legacy_firestore_id" ... already
  exists` on `knowledge_notes`. Verified live via read-only `supabase-js` selects (service
  role key, no direct DB connection) that all four `knowledge_*` tables already have the
  column — meaning `0006` had already fully committed in an earlier, unreported run.
  **`0006` is complete.** Rewrote the migration file in place to be idempotent
  (`add column if not exists` / `create index if not exists`) since it's safe to do for a
  file whose target state is already achieved, and it directly addresses re-run safety
  going forward (index existence couldn't be confirmed the same way — no PostgREST route
  for `pg_indexes` — so idempotency covers that uncertainty too).
- User confirmed `0007_fix_admin_user_update_trigger.sql` ran with no errors. **`0007` is
  applied and its fix is confirmed live**: re-ran `smoke-test.mjs` afterward — **9/9
  checks now pass**, including the previously-failing "grant clients.view via
  service_role, then confirm the RLS allow branch" step. All of `0001`-`0007` are now
  confirmed applied and behaving as designed on the real `CAPDATABASE` project.

## Firebase -> Supabase migration — live smoke test run, real trigger bug found+fixed, Supabase-backed apiClient scaffolded (2026-08-03)
- User created `supabase/.env` locally (gitignored) with real project URL + anon +
  service_role keys. Ran `supabase/scripts/smoke-test.mjs` live against the real
  `CAPDATABASE` project (still empty of real business data at this point).
- Result: 8 of 9 checks passed — auth-user creation, the `handle_new_auth_user` trigger's
  default profile shape, RLS correctly denying a `clients` read with no permission (proven
  against a real seeded row, not just an empty table), self-preferences update, the
  role-escalation-block trigger, and all 5 storage buckets from `0004` all confirmed
  working live.
- **1 real bug found**: granting the test user `clients.view` via the **service_role**
  client failed with "Only preferences may be self-updated." `restrict_self_user_update()`
  (from `0002`) only bypasses its restriction when `is_admin()` is true, and `is_admin()`
  depends on `auth.uid()`, which is NULL under service_role — so the trigger was blocking
  all service_role writes to `role`/`is_active`/`effective_permissions`/`email`, not just
  genuine self-updates. This would have broken
  `migrate-firestore-to-postgres.mjs`'s Phase C (sets a migrated user's role/permissions
  via the admin/service_role client) during the real data migration. Fixed via new
  `supabase/migrations/0007_fix_admin_user_update_trigger.sql` (`create or replace
  function`, adds `or auth.uid() is null` to the bypass check) — **written, not yet run**;
  needs the user to apply it via the SQL Editor same as before. Not urgent immediately
  (doesn't block anything else in progress), but required before ever running the
  migration script's `users` phase for real.
- Re-ran the smoke test after seeding via service_role once already fixed the deny-proof
  weakness (original check only proved 0 rows on what might've been an empty table); now
  inserts one real client row first so the deny check is conclusive, and (once `0007` is
  applied) will also prove the ALLOW branch by granting the permission and re-reading.
- Built `frontend/src/api/supabaseApiClient.js`: Supabase-backed drop-in equivalent of
  `apiClient.js` (`request`/`entities`/`integrations.Core.UploadFile`/`auth.*`), built on
  the existing `entities.js`/`database.js`/`storage.js`/`auth.js` scaffolding. **Not
  imported by any page or `App.jsx`** — Firebase's `apiClient.js` remains the live path.
  Google Calendar routes still call the same Firebase Cloud Functions either way (that
  integration is out of scope for this migration). Documented deviations inline: normalized
  `role_permissions` table shape, `knowledge_service_codes.code` vs. Firestore's
  `service_code` field name, and Supabase's session-based (not token-exchange) password
  reset flow.
- Verified: `frontend`: `npm run lint`, `npm run typecheck`, `npm test` (2/2) all clean
  with the new file present but unimported. `npm run build` still not run — blocked
  independently by `frontend/.env` not existing in this clone (pre-existing gap, unrelated
  to this file).
- Did NOT: run the Firestore migration script; touch `AuthContext.jsx`/`apiClient.js`/
  `App.jsx`; remove any Firebase code; apply `0007` (prepared only, needs the user's
  SQL-Editor run like every prior migration file).

## Firebase -> Supabase migration — all 6 migrations applied, live smoke test pending env (2026-08-03)
- User confirmed `0001`-`0006` all executed successfully in the Supabase SQL Editor (schema,
  RLS/grants, legacy-id columns for entities/users, storage buckets, and the knowledge_*
  legacy-id fix all applied to the real `CAPDATABASE` project). No errors reported.
- User approved running a live smoke test against the real (still-empty-of-business-data)
  Supabase project: create one throwaway auth user, verify RLS/grants/the
  self-update-preferences trigger behave as designed, then clean up. This is separate from
  and does not touch the Firestore data-migration script (still not executed, still
  blocked on Firebase Admin credentials, and the user separately confirmed this session not
  to run it).
- Built `supabase/scripts/smoke-test.mjs` for this (see file header for exact behavior:
  creates a test user via `auth.admin.createUser` if a service_role key is available,
  falls back to `auth.signUp` otherwise; checks own-profile defaults, RLS-blocked
  `clients` select, self-preferences update, and the role-escalation trigger; cleans up
  automatically when possible). `node --check` clean. Ran `npm install` in `supabase/`
  (175 packages, no credentials needed) so it and the data-migration script are both
  runnable dependency-wise.
- **Blocked before the smoke test could actually run**: `supabase/.env` doesn't exist in
  this clone (see KNOWN_ISSUES.md — fresh clone, gitignored file never traveled with it).
  Confirmed via the script's own fail-fast check. Needs the user to recreate
  `supabase/.env` with `SUPABASE_URL`/`SUPABASE_ANON_KEY` (and optionally
  `SUPABASE_SERVICE_ROLE_KEY` for automatic cleanup) before this can proceed — see the
  script's header comment for the exact format. Recommend doing this via the user's own
  terminal/editor rather than pasting values into chat again (KNOWN_ISSUES.md already
  flags the secret key was exposed in transcript once before).
- Still not done: the live smoke test itself (blocked on the above), anything from
  `runVerifyPhase`/the data-migration script (blocked on Firebase Admin credentials,
  separately user-forbidden to run this session), `frontend/.env` recreation (blocks
  `npm run dev`/`build` in this clone entirely, a pre-existing gap unrelated to Supabase).

## Firebase -> Supabase migration — 0001 executed, 0002-0005 in progress (2026-08-03)
- User ran `0001_initial_schema.sql` in the Supabase SQL Editor and confirmed it completed
  with no errors. `0002`-`0005` are being run next, in order, by the user. None of
  `0002`-`0005` has been confirmed successful yet as of this entry — do not assume RLS,
  grants, storage buckets, or legacy-id columns exist in the real project until the user
  confirms.
- While `0002`-`0005` were in progress, did Phase 2 prep that does not depend on them
  finishing (user's instruction: prepare Phase 2 work that doesn't need the migrations
  done, without removing Firebase or switching the live app):
  - Found and fixed a real gap via static review (not execution):
    `supabase/scripts/migrate-firestore-to-postgres.mjs`'s Phase A never imported
    `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents`
    (confirmed live collections), and Phase C's `knowledge_notes.created_by` relink
    referenced a `legacy_firestore_id` column that didn't exist on that table. See
    DECISIONS.md for the full fix (new `supabase/scripts/lib/entityMappings.{mjs,test.mjs}`,
    new `supabase/migrations/0006_knowledge_legacy_ids.sql`, updated relink phase, new
    read-only `verify` phase).
  - Verified: `cd supabase && node --check scripts/migrate-firestore-to-postgres.mjs
    scripts/lib/entityMappings.mjs` clean; `npm test` (new, `node --test
    scripts/lib/*.test.mjs`) 7/7 pass, no dependency install required. The migration
    script itself still has never been run, dry or otherwise (still blocked on Firebase
    Admin credentials — unchanged).
  - Added a Phase 2 execution runbook to DECISIONS.md — ordered steps from dry-run through
    Firebase removal, each tagged with whether it needs a fresh explicit approval per
    CLAUDE.md section 12. "Proceed with Phase 2" once migrations are confirmed authorizes
    starting the runbook, not skipping its per-step approval gates (`--apply` runs, the
    actual `AuthContext`/`apiClient` flag flip, and Firebase removal each still need a
    separate go-ahead).
  - Did NOT touch `frontend/`, `backend/`, `mobile-android/`, or `functions/` this round —
    no live-app behavior changed. Did NOT wire `SupabaseAuthProvider` into `App.jsx`.

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
