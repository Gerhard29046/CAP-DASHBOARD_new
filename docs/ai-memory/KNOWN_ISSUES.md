# Known Issues

## First real `--apply` partially failed on NOT NULL FK constraints — FIXED via 0012, NOT yet applied (2026-08-04)
- `0009`/`0010`/`0011` confirmed applied ("100% success" per user) and live-verified
  (columns queryable) before attempting the first real `--apply --phases=entities,relink,
  verify`. Result, confirmed via the read-only `verify` phase (not just script output):
  `clients` (6/6) and `job_cards` (4/4) succeeded and relinked correctly. `machines` (0/6),
  `service_records` (0/7), `job_card_lines` (0/3), `knowledge_machines` (0/3) all failed
  outright — Postgres `NOT NULL constraint` violations, zero rows written to any of the
  four (not a partial/corrupt write).
- Root cause: the script's insert-then-relink two-phase design needs the relevant FK
  column to be nullable at insert time; `job_cards.client_id`/`machine_id` were, the other
  three FK columns weren't. `knowledge_machines.name` (pre-`0011` vestigial column) is
  separately still `NOT NULL` despite the `0011` mapper no longer supplying it.
- Fixed via `supabase/migrations/0012_nullable_fks_for_two_phase_insert.sql` (drops NOT
  NULL on 4 columns; does not weaken the FK `references` constraint itself). **Not yet
  applied to the real project.**
- **Important for the retry**: once `0012` is applied, re-run with
  `--only=machines,service_records,job_card_lines,knowledge_machines` — NOT a bare
  `--apply --phases=entities,relink,verify` with no `--only`, which would try to
  re-insert the already-successful `clients`/`job_cards` rows and likely hit a
  `legacy_firestore_id` unique-constraint error. The script does not currently check
  "already migrated" before inserting.

## `machines`/`service_records`/`knowledge_machines` schema gaps + a date empty-string bug — FIXED, NOT yet applied (2026-08-04)
- Full spot-check of all real docs (not just dry-run samples) in the 4 remaining non-empty
  collections found 4 more real issues beyond the `job_cards` one below:
  1. `machines` missing `warranty_expiry` (real, on all 6 docs).
  2. `service_records` missing `service_date`/`work_performed`/`findings` (all three real,
     `service_date` required by both real creation forms).
  3. `knowledge_machines`'s entire schema was wrong — real fields are `manufacturer`/
     `model_name`/`variant`/`product_code`/`category`/`summary`/`supported_refrigerants`/
     `technical_specifications`/`main_functions`, none of which overlap with the old
     `name`/`model`/`description` columns. Would have silently blanked every real
     knowledge-base entry.
  4. A latent bug independent of the above: `?? null` doesn't catch empty strings, and
     date fields come through as `""` (not absent) from blank `<input type=date>`
     elements — confirmed live on 4 of 6 real `machines.installation_date` values. Would
     have hard-failed `--apply` with a Postgres date-type error. Fixed defensively across
     every date field via a new `toDateOrNull()` helper, not just the one proven broken.
- Fixed via `supabase/migrations/0009_machines_warranty_expiry.sql`,
  `0010_service_records_missing_fields.sql`, `0011_knowledge_machines_real_fields.sql`,
  and updates to `supabase/scripts/lib/entityMappings.mjs` (10/10 tests pass, was 8/8).
- **`0009`/`0010`/`0011` have NOT been run against the real `CAPDATABASE` project yet** —
  needs the user to apply them via the SQL Editor before any real `--apply` of the
  migration script.

## `knowledge_notes`/`knowledge_media`/`knowledge_documents`/`knowledge_service_codes` likely have the same class of schema gap — NOT fixed, no data at risk yet (2026-08-04)
- Found as a side effect of investigating `knowledge_machines` (`KnowledgeMachineDetail.jsx`
  renders all four sub-collections together): real code uses `content` on notes (schema has
  `body`), stores an uploaded `file_url` (the full download URL `UploadFile` returns) on
  media/documents rather than a `storage_path`, plus an `original_filename` the schema
  doesn't capture at all, and `knowledge_service_codes` has a `function_name` field with no
  schema column.
- **Not fixed this session** — deliberately deferred, since the live dry run confirmed all
  four collections currently have **zero real documents** (only ever seen at 0 in every dry
  run so far), so there is no data-loss risk today, unlike the collections above that do
  have real data. Must be fixed before any real content is added to the knowledge base
  through these four sub-tables, or before a real `--apply` if that ever changes. Re-check
  Firestore doc counts for these four before assuming this is still safe to defer.

## `job_cards` missing `job_number`/`date_received` columns — FIXED, applied and verified live (2026-08-04)
- Found via a live dry-run spot-check: `0001_initial_schema.sql` never gave `job_cards`
  columns for `job_number`/`date_received`, both of which are real, universally-populated
  fields (confirmed on all 4 real docs) actively used by `BookIn.jsx`, `JobCardDetail.jsx`,
  `Jobs.jsx`, `InvoiceQueue.jsx`, `MachineDetail.jsx`. Fixed via
  `supabase/migrations/0008_job_cards_missing_fields.sql` and an updated
  `supabase/scripts/lib/entityMappings.mjs` job_cards mapper (unit-tested, 8/8 pass).
- **User confirmed `0008` ran; verified live** via a read-only `supabase-js` select on
  `job_cards(id, job_number, date_received)` — columns exist and are queryable, table
  still has 0 rows (expected, nothing written yet). All of `0001`-`0008` are now applied.

## `restrict_self_user_update` trigger blocked service_role writes to role/permissions — FIXED, applied (2026-08-03)
- Found by running `supabase/scripts/smoke-test.mjs` live against the real project:
  granting a test user a permission via the **service_role** client (bypasses RLS by
  design) was rejected by the trigger with "Only preferences may be self-updated." Root
  cause: the trigger's bypass check is `is_admin()` alone, which depends on `auth.uid()` —
  NULL under service_role — so the trigger couldn't distinguish trusted server-side writes
  from a genuine self-update attempt.
- Impact if unfixed: `migrate-firestore-to-postgres.mjs`'s Phase C (sets each migrated
  user's real role/`effective_permissions` via the service_role/admin client) would have
  failed for every user whose role or permissions differ from the trigger-created default.
- Fix: `supabase/migrations/0007_fix_admin_user_update_trigger.sql`. **User confirmed this
  ran with no errors** (2026-08-03). Adds `or auth.uid() is null` to the trigger's bypass
  condition. Not yet re-verified live (the smoke test's grant-permission check hasn't been
  re-run since), but the fix is applied.

## `frontend/.env` still does not exist in this clone (2026-08-03, `supabase/.env` resolved)
- Both `supabase/.env` and `frontend/.env` were missing in this fresh clone (gitignored
  files don't travel with `git clone`; they were created session-locally on whatever
  machine ran Phase 0). **`supabase/.env` has since been recreated by the user** (real
  URL + anon + service_role keys, confirmed present and gitignored) and the live smoke
  test ran successfully against it.
- `frontend/.env` is still missing. Practical effect: the frontend cannot run `npm run
  dev`/`build` in this clone (`vite.config.js` throws in production mode if Firebase keys
  are missing; the Supabase client in `services/supabase/client.js` throws unconditionally
  if its two vars are missing) until it's recreated with both the Firebase and Supabase
  values. Not blocking any work done so far this session (lint/typecheck/`node --test`
  don't need it), but will block manual UI verification whenever that's needed.
- Exact keys needed are documented in `frontend/.env.example` and `supabase/.env.example`
  (added 2026-08-03, at the user's request, specifically so future required variables get
  documented there rather than pasted into chat).

## Supabase migration secrets exposed in chat/session transcript (2026-08-03)
- The user pasted both the Supabase publishable key (`sb_publishable_...`, low risk — it's
  designed to be public and RLS-constrained) and the **secret key**
  (`sb_secret_...`, service_role-equivalent, bypasses RLS entirely) directly into the
  chat during this session. Both are stored only in gitignored files
  (`frontend/.env` for the publishable key, `supabase/.env` for the secret key), never
  committed. Recommend rotating the secret key in the Supabase dashboard once migration
  tooling stabilizes, since it now exists in session logs outside version control.

## Supabase migration schema gaps (2026-08-03, updated during Phase 1)
- `calendar_records` and `invoice_queue` are permission-gated in `firestore.rules` but
  **confirmed unused** by any current client code (`frontend/src/api/apiClient.js`'s
  `calendarEvents()` derives Calendar-page events from `service_records`/`machines`/
  `clients` directly; grepping `frontend/src`, `functions/`, and `mobile-android/` found
  no reader/writer of either collection). Deliberately not modeled in the Postgres schema
  — not a gap, since there is nothing live to migrate. Re-check before assuming this if a
  future feature starts writing to either collection.
- `sites` in the new Postgres schema is gated on `clients.*` permissions (no dedicated
  `sites.*` permission key exists in `firestore.rules`). Still an inference, not a direct
  translation — confirm before relying on it.

## Supabase migration Phase 1 — data-migration script is incomplete by design (2026-08-03)
- `supabase/scripts/migrate-firestore-to-postgres.mjs` exists (dry-run by default, syntax
  verified with `node --check`, dependencies NOT installed, NOT executed against real
  Firestore data) but its own TODO section lists what's still missing before it's usable
  for a real cutover: (1) foreign-key re-linking pass from `legacy_firestore_id` to the
  new Postgres uuids — columns added in `0003_legacy_migration_ids.sql` but no re-link
  logic written yet; (2) `auth.users` creation per Firestore user (must go through
  `supabase.auth.admin.createUser`, separate from the `public.users` profile row);
  (3) Storage file copy from Firebase Storage to Supabase Storage — not attempted at all.
  Do not treat this script as migration-ready.
- Running it (even in dry-run mode) requires Firebase Admin credentials
  (`GOOGLE_APPLICATION_CREDENTIALS` pointing at a downloaded service-account key, or
  `gcloud auth application-default login` run interactively by the user) which Queen Bee
  does not have and should not try to obtain itself — the auto-mode permission classifier
  already blocked one credential-read attempt (`gcloud auth application-default
  print-access-token`) this session as an appropriate guard. The user must set this up
  and run the script themselves, or explicitly hand over a service-account key file path.
- `supabase/migrations/0001` has been run against the real `CAPDATABASE` Supabase project
  and confirmed successful by the user (2026-08-03). `0002`-`0005` are being run next, in
  order, by the user via the SQL Editor — **no connection string will be provided** (user's
  explicit decision, 2026-08-03). Not yet confirmed successful as of this entry — do not
  assume RLS/grants/storage buckets/legacy-id columns exist until the user confirms all
  five. Phase 2 (actual app cutover) begins only after that confirmation, and even then
  only proceeds through the ordered, individually-approved steps in the Phase 2 runbook
  (DECISIONS.md) — see that entry before assuming "proceed with Phase 2" authorizes a
  `--apply` run or the `AuthContext`/`apiClient` cutover on its own.
- **Fixed 2026-08-03** (was a real gap, found by static review of the migration script
  before anyone ran it): `migrate-firestore-to-postgres.mjs`'s Phase A never imported
  `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents`, and
  Phase C's `knowledge_notes.created_by` relink referenced a `legacy_firestore_id` column
  that didn't exist on that table (`0003` only added it to `knowledge_machines`). Fixed via
  `supabase/migrations/0006_knowledge_legacy_ids.sql` and updates to the script's
  entity/relink phases. See DECISIONS.md.
  - **`0006` confirmed complete 2026-08-03**: the user's SQL Editor run errored with
    `column "legacy_firestore_id" of relation "knowledge_notes" already exists` —
    verified live (not just inferred from the error) via read-only `supabase-js` probes
    against all four tables using the service_role key: all four columns already exist.
    This means all four `ADD COLUMN` statements had already committed in an earlier,
    unreported run of the same file before this one. Index existence for the four new
    `..._legacy_firestore_id_idx` indexes could not be directly confirmed the same way
    (no PostgREST-exposed introspection route for `pg_indexes`), so the migration file was
    rewritten in place to be idempotent (`if not exists` on every `add column`/
    `create index`) rather than left in a state where re-running it always errors — safe
    to run again at any time, including to fill in the indexes if they didn't make it.

## Deploy gap (2026-07-28, push resolved 2026-08-03)
- ~~Commit `aa72fa8` (Ruflo/Claude Flow MCP tooling) exists on local `main` but is not
  pushed to `origin/main`~~ — **resolved 2026-08-03**: `git push origin main` succeeded
  this session (`25f4819..59e9702`), carrying `aa72fa8`, `f5246f7`, and the new Supabase
  migration Phase 0/1 commit `59e9702` to `origin/main`. `main`/`origin/main` are in sync.
- `functions/index.js`'s CORS fix (adds `PATCH` to `Access-Control-Allow-Methods`, from
  commit `25f4819`) is **not deployed** — `firebase deploy --only functions` was denied
  by the same classifier. The frontend (already deployed, version
  `5f00ef33-e00d-4f47-a84b-115df2954f3d`) now expects PATCH to work for the System
  Settings "show Google Calendar" toggle; until functions are redeployed this call will
  still fail cross-origin in production.
- Upstream `@claude-flow/cli@latest` npm package is broken (`npm error Invalid Version:`
  on install), which is why the `plugin:ruflo-core:ruflo` MCP server fails to connect
  (`claude mcp list`). The `.mcp.json`-defined `claude-flow` server (a different
  package, `ruflo@latest`) connects fine. Not fixable from this repo; either wait for
  upstream or disable `ruflo-core`/`ruflo-swarm`/`ruflo-rag-memory`/`ruflo-neural-trader`
  in `.claude/settings.json` → `enabledPlugins` if the failures are noisy.

## Verification gaps
- No build, lint, typecheck, or test suite has been run this session for any layer
  (frontend, backend, functions, Android). All statements above are from static code
  inspection only.
- Google Calendar: fully live-tested 2026-07-24, including a real connect flow and event
  sync with account `gerhard.ark.of.war@gmail.com`. No longer an open verification gap.
- Firebase reported "No cleanup policy detected for repositories in africa-south1" during
  this deploy — old container images may accumulate a small storage cost over time. Fix
  (not yet applied, low priority): `firebase functions:artifacts:setpolicy --project
  capdatabasefb2`.

## Documentation drift risk
- `AGENTS.md` still states the frontend only talks to Laravel and must never connect
  directly to Firebase/Google. This is intentionally superseded by CLAUDE.md (section 1)
  but left unedited in `AGENTS.md` itself — a future reader of `AGENTS.md` alone would be
  misled. See [[DECISIONS]] entry on this.

## Repo hygiene (not verified as intentional, not touched)
- `rename_api_client.py` and `rename_api_client_TEMP.txt` at repo root are both empty
  (0 bytes) and untracked-looking scratch files. Left in place per "do not change
  application code" scope of this setup task.

## Duplicated permission model
- Permission data is maintained by hand in two systems (Laravel tables vs. Firestore
  collections/`effective_permissions`) with no automated sync verified in this session.
  Any permission change must be checked against both per CLAUDE.md section 9.
