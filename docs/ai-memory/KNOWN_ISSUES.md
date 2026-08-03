# Known Issues

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
- `supabase/migrations/0001`-`0005` have NOT been run against the real `CAPDATABASE`
  Supabase project yet. **No connection string will be provided** (user's explicit
  decision, 2026-08-03) — the user will run all five files manually via the Supabase SQL
  Editor and confirm success before Phase 2 (actual app cutover) begins. No Storage
  buckets created yet either (created by `0004`, pending that manual run).

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
