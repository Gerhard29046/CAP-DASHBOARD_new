# Decisions

## 2026-08-12 — Google Calendar sync removed entirely (cost)
- Decision: remove the Google Calendar sync feature completely — web UI, `apiClient`/
  `supabaseApiClient` integration, and all 8 Cloud Functions — while explicitly **keeping**
  the CAP Dashboard's own in-app Calendar page (Upcoming Services, built from
  `service_records`/`machines`/`clients` directly, never dependent on Google).
- Reason: explicit user instruction — "i dont want to connect to google calender anymore.
  it cost me too much money", then "make that the calender doesnt sync to google. but keep
  a calender." This followed Queen Bee finding the live `googleCalendarStatus` function
  returning raw platform-level 500/503 errors on every request pattern during unrelated
  Supabase-migration QA — possibly already related to the user taking cost-cutting action on
  the Google Cloud side before this conversation, though that was never confirmed.
- Affected: `frontend/src/pages/SystemSettings.jsx` (deleted), `frontend/src/api/
  functionsClient.js` (deleted), `frontend/src/api/apiClient.js`/`supabaseApiClient.js`
  (Google branch removed from `calendarEvents()`, `/google-calendar/*` route dispatch
  removed), `frontend/src/pages/CalendarPage.jsx` (Google toggle/status/event-details UI
  removed, Upcoming Services UI kept), `frontend/src/components/AppLayout.jsx` + `App.jsx`
  (`/settings` route and nav entry removed), `functions/index.js` (all 8 `googleCalendar*`
  exports removed — file now exports nothing), `functions/lib/googleCalendarService.js`/
  `googleCalendarStore.js`/`googleOAuthClient.js` (deleted) + their tests,
  `functions/package.json` (`googleapis` dependency removed), `frontend/.env.production`/
  `.env.example` (`VITE_FUNCTIONS_BASE_URL` removed), `CLAUDE.md` section 7 (marked
  removed, historical record only).
- Deliberately kept: `functions/lib/auth.js`/`supabaseAuth.js` (generic Cloud Functions auth
  infrastructure, not Google-specific, unused/unbilled while nothing exports them — no cost
  or security reason to remove); `calendar.google.*` permission keys in the permission
  catalog/Firestore rules (unused, harmless, not worth the risk of touching the permission
  model for a pure cleanup); Laravel's Google Calendar controllers/tests (already
  documented dead code, out of scope); `docs/GOOGLE_CALENDAR_SETUP.md`/`docs/migration/
  GOOGLE_CALENDAR_AUTH_REDESIGN.md` (historical record).
- **Not done this session** (needs the user or a delegated worker bee): actually deleting
  the deployed Cloud Functions from GCP (`firebase functions:delete ...` — deploy-adjacent
  action Queen Bee can't run, exact command given to the user directly and in `functions/
  index.js`'s header comment); revoking the stored OAuth connection in Firestore
  `system_integrations/google_calendar`; removing the Android `GoogleCalendarRepository`
  read-only consumer (belongs to `android-ui-bee`/`integration-sync-bee`).
- Consequences: `/settings` and the Google Calendar section of the app no longer exist for
  any user, regardless of permission. The in-app Calendar page (`/calendar`) is unaffected
  and continues to work from Firestore/Postgres data directly.
- Reversal condition: if Google Calendar sync is wanted again later, the removed code is
  fully recoverable from git history at this commit's parent — this was a clean removal, not
  a destructive data-loss action (no Firestore/Storage data was deleted by this change
  itself).

## 2026-08-05 — Google Calendar authentication redesign: issuer-routed dual verification, design-only
- Decision: recommend redesigning `functions/lib/auth.js`'s `requireUser()` to branch on
  the bearer token's `iss` (issuer) claim — Firebase ID tokens keep using the existing
  `admin.auth().verifyIdToken()` + Firestore `users/{uid}` read path unchanged; Supabase
  JWTs get a new path (`supabase.auth.getUser(token)` to verify, then a service-role
  Postgres query for `role`/`effective_permissions`/`is_active`), returning the identical
  `{ uid, role, effectivePermissions }` shape so no call site in `functions/index.js`
  changes. Full design in `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md`.
- Reason: explicit user instruction — treat this as a first-class migration task, do not
  assume Firebase Auth remains available after the Supabase cutover, keep using the Google
  Calendar API while authenticating independently of Firebase Auth. The dual-issuer
  approach specifically (rather than a hard swap) was chosen so the frontend's
  `VITE_AUTH_BACKEND` flag flip and a Cloud Functions redeploy never have to be coordinated
  as one atomic event — each can happen independently, in either order, which matches how
  every other flag-gated step in the existing Phase 2 runbook is designed to work.
  `supabase.auth.getUser(token)` was chosen over local JWKS/`jose` verification specifically
  to avoid new key-management/rotation code for a latency cost judged acceptable (these
  functions already round-trip to Google's Calendar API under a 20s client timeout).
- Affected (design only, nothing implemented yet): `docs/migration/
  GOOGLE_CALENDAR_AUTH_REDESIGN.md` (new). Cross-referenced from
  `docs/migration/FIREBASE_DEPENDENCIES.md` and `PHASE2_CUTOVER_CHECKLIST.md` (new
  prerequisite step 3.0, gating step 3.1's `SupabaseAuthProvider` wiring). No changes to
  `functions/` or `frontend/` code this session — implementation is listed as its own
  ordered, approval-tagged step list in the design doc, not done here.
- Consequences: a new Firebase Secret (`SUPABASE_SERVICE_ROLE_KEY`) and a new
  `functions/` dependency (`@supabase/supabase-js`) will be needed at implementation time.
  The design doc recommends rotating the service_role key before using it in this new
  server-side dependency, since `KNOWN_ISSUES.md` already flags it was pasted into a chat
  transcript once during Phase 0.
- Reversal condition: if the Auth cutover is abandoned entirely, this design (and its
  eventual implementation) has no cost to revert — the Firebase-issuer branch stays the
  only one ever actually used, and the Supabase branch is simply unreached dead code until
  removed.

## 2026-08-05 — Fixed the deferred knowledge_* sub-collection schema gap and a second, deeper storage-copy bug
- Decision: closed the schema gap flagged-but-deferred on 2026-08-04 (`knowledge_notes`/
  `knowledge_service_codes`/`knowledge_media`/`knowledge_documents` columns didn't match
  real Firestore field names) via `supabase/migrations/
  0013_knowledge_subcollections_real_fields.sql` and matching `entityMappings.mjs` updates,
  rather than continuing to defer it. While fixing it, found a second, independent bug in
  the same area: `migrate-firestore-to-postgres.mjs`'s Phase D (storage copy) read the same
  wrong field name directly off raw Firestore docs (bypassing the mapper entirely, so the
  schema fix alone would not have caught it), and even with the name corrected would still
  have failed — the real field is a Firebase Storage *download URL*, not a bare object path
  the Admin SDK can use directly.
- Reason: this session's instructions prioritized "build and verify remaining Supabase
  service-layer functionality" and "continue improving tests and verification scripts."
  The original defer-it decision (2026-08-04) was conditioned on re-checking before
  assuming it was still safe — re-checked (still 0 real docs in all four collections,
  confirmed via the live `verify` phase run 2026-08-04) and fixing now, before either the
  `users`/`storage` migration phases or any real content addition, is strictly safer than
  fixing it later under time pressure once real data exists.
- Affected: `supabase/migrations/0013_knowledge_subcollections_real_fields.sql` (new),
  `supabase/scripts/lib/entityMappings.mjs` (4 mapper entries corrected),
  `supabase/scripts/lib/entityMappings.test.mjs` (stale test fixed, 3 new tests added, 12/12
  pass), `supabase/scripts/lib/firebaseStorageUrl.mjs` (new, unit-tested, 6/6 pass),
  `supabase/scripts/migrate-firestore-to-postgres.mjs` (Phase D rewritten to use the new
  helper and to re-point each migrated row's Postgres `file_url` to a fresh Supabase signed
  URL after copy, matching the private-bucket signed-URL precedent already established in
  `supabaseApiClient.js`), `frontend/src/api/supabaseApiClient.js` (reveal handler and a
  stale header comment corrected to `service_code`).
- Verified: `supabase`: `node --check` on all 4 changed/new script files, `npm test` 18/18
  (was 12, +6 new). `frontend`: `npm run lint`/`typecheck`/`test`/`build` all clean.
  Migration file itself re-reviewed for safety (uses `rename column`, not drop+add, and
  every affected table confirmed at 0 real rows via the most recent live `verify` run before
  writing it) — not applied to the real project yet, needs the user via the SQL Editor like
  every prior migration.
- Consequences: `0013` is a column-rename migration. Safe to apply any time before real rows
  exist in these four tables (still true as of 2026-08-05) — becomes a real, careful
  data-affecting change once they don't. The Phase D storage-copy fix has only been unit-
  tested in isolation (the URL-parsing logic); it has never run against a real Firebase
  Storage file, since no real documents exist in either source collection to test against.
- Reversal condition: none expected for the schema correction (closes a real gap). The
  Phase D signed-URL re-pointing carries the same known limitation already documented for
  `supabaseApiClient.js`'s upload path — a 7-day signed URL expires and is not
  auto-refreshed; whoever builds a real reader for these tables should re-sign on read
  rather than rely on the stored URL indefinitely.

## 2026-08-03 — Verified `0006`'s actual state live instead of trusting the error message, then made it idempotent
- Decision: when the user reported `0006` erroring with "column ... already exists," did
  not assume from the error text alone what state the database was in. Instead ran
  read-only `select legacy_firestore_id limit 1` probes against all four affected tables
  via `supabase-js` with the service_role key (no direct Postgres connection available or
  wanted — the user has consistently declined providing one). Confirmed all four columns
  already exist, meaning `0006` had already fully committed in an earlier, unreported run.
  Then rewrote `0006_knowledge_legacy_ids.sql` in place (`add column if not exists` /
  `create index if not exists`) so it's safe to run again regardless of partial state.
- Reason: CLAUDE.md section 3 ("do not assume planned work was implemented") and section
  13 ("inspect the actual implementation") both argue against treating an error message as
  self-explanatory without checking real state, especially for something as consequential
  as whether a schema migration actually applied. Rewriting the file in place (rather than
  leaving it as a one-shot, now-broken-to-re-run artifact) was judged acceptable here
  specifically because its target state was already fully achieved — this is not the same
  as editing an already-applied migration to change its effect.
- Affected: `supabase/migrations/0006_knowledge_legacy_ids.sql` (content changed, same
  filename/number — no new migration file, since nothing about its target end-state
  changed).
- Consequences: index existence for the four new indexes could not be confirmed the same
  way (no PostgREST-exposed route for `pg_indexes`), so the idempotent rewrite also
  functions as a safety net for that unknown, not just the confirmed column case.
- Reversal condition: none expected.

## 2026-08-03 — Fixed a real trigger bug found by the live smoke test, via new migration 0007
- Decision: `supabase/migrations/0007_fix_admin_user_update_trigger.sql` amends
  `restrict_self_user_update()` to also bypass its restriction when `auth.uid() is null`
  (i.e. no authenticated end-user session — service_role/definer-context calls), not only
  when `is_admin()` is true.
- Reason: running `supabase/scripts/smoke-test.mjs` live against the real project showed
  the service_role client itself was blocked from updating `effective_permissions`, because
  `is_admin()` depends on `auth.uid()`, which is NULL under service_role. Left unfixed, this
  would break `migrate-firestore-to-postgres.mjs`'s Phase C (sets each migrated user's real
  role/permissions via the service_role/admin client) for any user who isn't left at the
  trigger-created default.
- Affected: `public.restrict_self_user_update()` (function only, via `create or replace` —
  no table/column changes). Written as a new migration, not an edit to `0002`, since `0002`
  is already applied to the real project.
- Consequences: authenticated non-admin users are unaffected — self-updates outside
  `preferences` are still blocked exactly as before. Only trusted service_role writes
  (already RLS-bypassing by design) gain the ability to set role/is_active/
  effective_permissions/email.
- Reversal condition: none expected — this closes a real gap, not a judgment call.
- **Applied 2026-08-03** — user ran it via the SQL Editor with no errors, and a follow-up
  live smoke test re-run confirmed the fix works (the previously-failing "grant
  clients.view via service_role" check now passes; 9/9 checks pass overall).

## 2026-08-03 — Built a Supabase-backed apiClient equivalent, unwired
- Decision: added `frontend/src/api/supabaseApiClient.js`, matching `apiClient.js`'s
  exact exported shape (`request`/`entities`/`integrations.Core.UploadFile`/`auth.*`),
  built on the existing `entities.js`/`database.js`/`storage.js`/`auth.js` scaffolding
  from Phase 0/1. Not imported by any page or `App.jsx`.
- Reason: this is the biggest remaining piece of "Phase 2, step 6" from the runbook
  (wiring a Supabase-backed data layer behind a flag before ever flipping it live) — having
  it built and verified via lint/typecheck now, ahead of the real data migration, means the
  eventual cutover is closer to a routing change than a rewrite done under time pressure.
- Affected: new file only; no existing file imports it. Google Calendar routes
  intentionally still call the same Firebase Cloud Functions (out of scope for this
  migration regardless of which data layer serves the rest of the app).
- Documented, not resolved, deviations from `apiClient.js`'s exact Firestore-era behavior:
  `role_permissions` is now a normalized (role, permission_key) table rather than one doc
  per role with a `permissions` array; `knowledge_service_codes`'s column is `code`, not
  Firestore's `service_code` (response key kept the same for caller compatibility); password
  reset is Supabase's session-based recovery flow, not Firebase's opaque-token exchange;
  and its `subscribe()`/`watch()` re-query on every postgres_changes event rather than
  Firestore's full-snapshot-per-change semantics (flagged as a gap for whichever page
  first consumes it, not solved here since nothing does yet).
- Verified: `frontend` `npm run lint`/`typecheck`/`test` (2/2) all clean with the file
  present but unimported. `npm run build` not run — still blocked by `frontend/.env` not
  existing in this clone (pre-existing, unrelated to this file).
- Reversal condition: if Phase 2 cutover is abandoned, this file (like `entities.js`/
  `SupabaseAuthContext.jsx`) can be deleted with zero impact — nothing imports it.

## 2026-08-03 — Full cutover checklist written as a dedicated doc, not just this runbook entry
- Decision: wrote `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` as the authoritative,
  detailed cutover plan (task-by-task, tagged no-approval/approval/decision; downtime
  estimate; rollback plan; verification checklist) rather than expanding the shorter
  runbook entry below in place.
- Reason: user explicitly asked for "a complete checklist of every remaining task,
  estimated downtime (if any), rollback plan, and verification steps" before the final
  cutover is requested — a first-class, scannable document serves that better than a
  memory-file paragraph. The runbook entry below stays as the short version / historical
  record of why a phased approach was chosen at all; the new doc is what to actually work
  from when scheduling a cutover.
- Affected: new `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`. Surfaced several real,
  previously-implicit gaps as explicit open items: no password-reset-email delivery script
  exists yet for migrated users, no incremental/delta-sync capability exists in the
  migration script (one-time bulk import only), `sites` has no Firestore source to migrate
  from, Android cutover timing is an unmade decision, and a single Supabase project serves
  both "the real target" and "wherever staging testing would happen."
- Reversal condition: update the doc as decisions get made and gaps get closed — it's a
  living checklist, not a historical record like DECISIONS.md entries otherwise are.

## 2026-08-03 — Phase 2 execution runbook (not started; steps below gate their own approval)
- Written while `0001` was confirmed executed and `0002`-`0005` were being run by the user,
  in response to "once I confirm all five migrations have completed successfully, proceed
  with Phase 2 implementation." That instruction authorizes *starting* Phase 2 once
  migrations are confirmed — it does not by itself satisfy CLAUDE.md section 12's
  requirement that destructive/irreversible actions each get their own explicit approval.
  This runbook exists so that distinction is applied consistently rather than re-litigated
  each time.
- Ordered steps, each tagged with what it needs before running:
  1. Install `supabase/` script deps, dry-run all phases (including `verify`, added
     2026-08-03), review output line by line. No approval needed — read-only.
  2. `--apply --phases=entities,relink,verify` against the real project. Needs explicit
     user go-ahead — first real write to Postgres, though Firebase/Firestore remain
     untouched and authoritative throughout.
  3. Spot-check row counts (via the new `verify` phase) and a handful of real records
     against their Firestore originals.
  4. `--apply --phases=users`. Needs explicit go-ahead — creates real Supabase Auth
     accounts. Immediately follow with password-reset emails (migrated users have no
     usable password — the script already reminds of this).
  5. `--apply --phases=storage`. Needs explicit go-ahead — copies real files.
  6. Wire `SupabaseAuthProvider` / a Supabase-backed data layer into the app behind an
     env flag defaulting off; test end-to-end against the migrated data without it being
     the live path yet.
  7. Flip the flag so Supabase becomes the live path. Needs explicit go-ahead — this is
     the actual cutover moment CLAUDE.md section 12 is guarding.
  8. Only after a confirmed soak period: remove Firebase code/config. Needs explicit
     go-ahead — treated as irreversible in spirit even though git history retains it.
- Reversal condition: if the user decides to stop at any step, everything up to and
  including step 5 is additive to Postgres only (Firebase stays live and authoritative);
  rolling back means deleting the migrated Postgres rows/Auth users/Storage files, not
  reverting any app code, since nothing before step 6 touches `frontend/`/`mobile-android/`.

## 2026-08-03 — Fixed a real Phase-A coverage gap found during Phase 2 prep (static review)
- Decision: extracted the entity-mapping table into a new zero-dependency
  `supabase/scripts/lib/entityMappings.mjs` (unit-tested in `entityMappings.test.mjs`) and
  added the four collections it was missing — `knowledge_notes`, `knowledge_service_codes`,
  `knowledge_media`, `knowledge_documents` — plus a new `supabase/migrations/
  0006_knowledge_legacy_ids.sql` giving those tables the `legacy_firestore_id` column
  `0003_legacy_migration_ids.sql` only gave `knowledge_machines`. Also added a read-only
  `verify` phase to `migrate-firestore-to-postgres.mjs` that compares Firestore doc counts
  to Postgres row counts per table.
- Reason: `frontend/src/api/apiClient.js`'s `routeCollections` and `frontend/src/services/
  supabase/entities.js`'s `KnowledgeBaseService` both confirm these four collections are
  live, but the migration script's Phase A never imported them, and Phase C's existing
  `knowledge_notes.created_by` relink referenced a `legacy_firestore_id` column that did
  not exist on that table — running `--apply` as the script stood would have silently
  skipped real data and then errored. Found by static review, not execution (the script
  still has never been run, dry or otherwise).
- Affected: `supabase/scripts/migrate-firestore-to-postgres.mjs`, new
  `supabase/scripts/lib/entityMappings.{mjs,test.mjs}`, new `supabase/migrations/
  0006_knowledge_legacy_ids.sql`, `supabase/package.json` (added `test`/`migrate:verify`
  scripts).
- Consequences: `0006` must be applied (whenever convenient, after `0001`-`0005`) before a
  real `--apply` run touching the `users` phase; not urgent today since Firebase Admin
  credentials still block any real run regardless.
- Reversal condition: none expected — this closes a real gap, not a judgment call that
  could go the other way.

## 2026-08-03 — Firebase-to-Supabase migration will be phased, not a single cutover
- Decision: migrate incrementally (Phase 0 schema/scaffolding -> Phase 1 service layer +
  data-migration scripts, run against a copy -> Phase 2 actual cutover of Auth/Firestore/
  Storage + Firebase removal, requiring explicit user sign-off -> Phase 3 docs/cleanup),
  rather than deleting Firebase code and switching over in one pass as the originating
  task brief implied.
- Reason: this is a live production app — real user accounts in Firebase Auth, real
  business data in Firestore, a real live-tested Google Calendar OAuth token
  (`gerhard.ark.of.war@gmail.com`, see PROJECT_STATE.md 2026-07-24 entry). CLAUDE.md
  section 12 prohibits deleting Firestore/Storage data or rotating credentials without
  explicit approval; an irreversible one-shot cutover would violate that. Also, none of
  the three real worker bees (`android-ui-bee`, `integration-sync-bee`, `testing-bee`)
  are scoped to touch `frontend/` or `backend/` or Firebase config files, so this work is
  done directly by Queen Bee, sequentially, to avoid concurrent-edit risk on shared files
  like `apiClient.js`.
- Affected: `frontend/src/services/supabase/*`, `supabase/migrations/*`, eventually
  `frontend/src/lib/firebase.js`, `AuthContext.jsx`, `apiClient.js`,
  `mobile-android/.../Core.kt`, `firestore.rules`, `functions/`.
- Consequences: Firebase remains the active data path until Phase 2 is explicitly
  approved and executed; anyone reading this repo mid-migration should not assume
  Supabase is live just because scaffolding/schema files exist.
- Reversal condition: if the user decides not to proceed past Phase 0/1, Firebase stays
  permanent and the `supabase/` + `frontend/src/services/supabase/` additions can be
  deleted with no impact (nothing imports them).

## 2026-08-03 — Postgres schema modeled on real Firestore collections, not the task brief's generic tables
- Decision: `supabase/migrations/0001_initial_schema.sql` uses clients/sites/machines/
  service_records/job_cards/job_card_lines/knowledge_* tables (matching
  `frontend/src/api/apiClient.js`'s `endpointMap`/`routeCollections`), not the
  customers/vehicles/invoices/quotations tables suggested by the original migration
  task description.
- Reason: CAP Dashboard is a machine-servicing business (client -> site -> machine ->
  service record/job card), not an automotive shop; using the brief's generic schema
  verbatim would have produced tables that don't match any real data or UI.
- Affected: `supabase/migrations/0001_initial_schema.sql`, `0002_rls_policies.sql`.
- Reversal condition: none expected; would require a genuine change in business domain.

## 2026 (exact date unverified — inferred from commit `02aa511`) — Google Calendar moved from Laravel to Firebase Cloud Functions
- Decision: Google Calendar OAuth/connect/events flow is implemented as Firebase Cloud
  Functions (`functions/`), not Laravel, matching the rest of the client-Firestore
  architecture.
- Reason: frontend/Android already bypass Laravel for all other CRUD; keeping Calendar on
  Laravel left it unreachable from the client (CLAUDE.md's superseded text described this
  as a 501 dead route before the fix).
- Affected: `functions/index.js` + `functions/lib/*`, `frontend/src/api/apiClient.js`
  (`google-calendar` routing), `mobile-android/.../GoogleCalendarRepository.kt`.
  `backend/app/Http/Controllers/GoogleCalendarController.php` and `CalendarController.php`
  remain but are no longer the active path.
- Consequences: permission model for calendar access now lives in
  `functions/lib/auth.js` + Firestore `effective_permissions`, not Laravel middleware.
- Reversal condition: none documented; would require re-wiring `apiClient.js` back to
  Laravel HTTP calls and restoring OAuth secret handling server-side in Laravel instead.

## Firestore database is explicitly named, not default
- Decision: use `getFirestore(firebaseApp, "capdashboard")` everywhere on the client.
- Reason: (not documented in commit history reviewed; stated as a hard constraint in
  CLAUDE.md section 6.1/11).
- Affected: any new Firestore SDK initialization, `firestore.rules` targeting.
- Consequences: a default-database `getFirestore(firebaseApp)` call would silently read/
  write the wrong database.

## AGENTS.md architecture claims are treated as superseded, not deleted
- Decision: `AGENTS.md`'s "frontend only communicates with Laravel" / "never connect
  directly to Firebase" statements are documented as outdated in CLAUDE.md section 1,
  rather than edited out of `AGENTS.md`.
- Reason: preserve other still-valid `AGENTS.md` conventions (JS/JSX, Android stack,
  token storage, migration rules) while establishing CLAUDE.md as the current authority
  per the instruction-precedence order.
- Affected: `AGENTS.md` (unmodified), `CLAUDE.md` section 1.
- Reversal condition: if `AGENTS.md` is rewritten to match current architecture, this
  note in CLAUDE.md section 1 should be removed as no-longer-needed.
