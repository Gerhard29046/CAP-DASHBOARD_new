# Session Log

## 2026-08-04 — First real Postgres writes: entities + relink phases fully complete and content-verified
- Objective: continue the Firestore->Postgres migration with real data, following the
  Phase 2 runbook. Started with "check that job_card_lines record" (a spot-check request)
  which snowballed into a full audit that found and fixed 5 real schema gaps before any
  real data was migrated.
- Sequence of events:
  1. User provided Firebase Admin credentials (a service-account JSON key, kept outside
     the repo, referenced via gitignored `supabase/.env`). Ran the first-ever dry run —
     real Firestore data, zero writes.
  2. User asked to check a specific `job_card_lines` record with `line_total: 0`. Direct
     inspection showed it was an old/synthetic test record (no bug there), but checking
     its parent job card surfaced a real, universal gap: `job_cards.job_number`/
     `date_received` had no Postgres columns at all despite being real, actively-used
     fields. Fixed via `0008` + mapper update, user applied and I verified live.
  3. User chose to finish spot-checking the other 4 non-empty collections rather than go
     straight to `--apply`. Good call — found 4 more real issues: `machines` missing
     `warranty_expiry`; `service_records` missing `service_date`/`work_performed`/
     `findings`; `knowledge_machines`'s entire schema was wrong (real fields don't
     overlap at all with the original name/model/description guess); and a latent
     date-empty-string-vs-null bug that would have hard-failed `--apply` regardless.
     Fixed via `0009`-`0011` + mapper rewrite, 10/10 unit tests, user applied.
  4. User said they were stepping away and to "continue with the phases." Attempted the
     first real `--apply` — this tool's own permission classifier blocked it (and even
     the read-only `verify` phase) once; did not attempt to route around it, reported it
     clearly. On a later attempt (after the user returned) it was not blocked.
  5. First real `--apply --phases=entities,relink,verify` (no `--only`): `clients` (6/6)
     and `job_cards` (4/4) succeeded; `machines`/`service_records`/`job_card_lines`/
     `knowledge_machines` all failed with `NOT NULL` constraint violations (a real design
     bug — the script's insert-then-relink pattern needs nullable FK columns, and 3 of
     these weren't, plus `knowledge_machines.name`'s NOT NULL was never relaxed after
     `0011` stopped supplying it). Confirmed via `verify` that nothing partial/corrupt
     was written — the 4 failed tables were still at 0 rows.
  6. Fixed via `0012` (drops NOT NULL on 4 columns, keeps the FK `references` check
     itself). User applied it, confirmed via a throwaway probe insert (immediately
     deleted) that it was live, then retried scoped to
     `--only=machines,service_records,job_card_lines,knowledge_machines` — deliberately
     excluding the already-successful tables to avoid a duplicate-key retry error.
  7. **All 4 succeeded.** Full `--phases=verify`: all 10 collections match Firestore
     counts exactly. Went further than count-matching — pulled real rows back by
     `legacy_firestore_id` and confirmed actual content and FK relinking are correct
     (a real machine's `client_id` traces to the right client; a job card's `client_id`
     AND `machine_id` both correctly relinked; text fields match verbatim).
- Files changed: `supabase/migrations/0008`-`0012` (new), `supabase/scripts/lib/
  entityMappings.{mjs,test.mjs}` (rewritten mapper entries + new tests, 10/10 pass),
  `supabase/scripts/migrate-firestore-to-postgres.mjs` (credential-loading, comment
  updates), `docs/ai-memory/{PROJECT_STATE,KNOWN_ISSUES,ROADMAP}.md`.
- Verification: every fix unit-tested before being applied; every live claim
  independently re-verified via read-only checks or content spot-checks, not taken from
  the script's own success/failure output alone. `frontend` lint/typecheck unaffected
  (no frontend files touched this session).
- Result: real production data (clients/machines/service_records/job_cards/
  job_card_lines/knowledge_machines) now lives correctly in Supabase, fully cross-linked,
  alongside Firebase (untouched, still the only live-serving backend).
- Remaining: `users`/`storage` phases (each needs separate go-ahead), the checklist's
  open decisions, then frontend wiring — none started. User moving to a different
  machine next; flagged that `supabase/.env` and the Firebase service-account key won't
  travel via git and must be recreated there before the migration script works again.

## 2026-08-03 (cont. 7) — RLS coverage expanded to 4 tables (18/18); full cutover checklist written; pushed to origin
- Objective: user approved continuing Phase 2 prep with hard constraints (Supabase-only,
  behind feature flags not yet wired, Firebase stays active, no migration/auth-switch/
  frontend-wiring/Android-changes/Firebase-removal without separate approval), asked for a
  complete pre-cutover checklist (tasks/downtime/rollback/verification), and asked to push
  to git without asking permission first.
- Expanded `supabase/scripts/smoke-test.mjs` from a single-table (`clients`) RLS check into
  a data-driven matrix over 4 tables spanning distinct permission namespaces: `clients`,
  `machines`, `job_cards`, `knowledge_machines`. Live run: 18/18 checks pass. Cleanup order
  respects `machines.client_id`'s `ON DELETE RESTRICT` FK.
- Wrote `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`: full task list tagged
  no-approval/approval/decision, downtime-window reasoning (no incremental-sync capability
  exists — one-time bulk import only — so a real, short maintenance window is recommended
  rather than claiming true zero-downtime), rollback plan (flag flip back to Firebase is
  lossless for Firebase's own data; explains what it does NOT undo), and a staged
  verification checklist (pre-cutover / immediately-before / during / post-cutover soak /
  Firebase-removal-as-a-separate-later-approval).
- Did not touch `App.jsx`/`AuthContext.jsx`/`apiClient.js`/any Android file/the migration
  script's execution — interpreted "behind feature flags only" as design intent for the
  eventual wiring, not permission to start it now, consistent with the explicit "do not
  wire the frontend to Supabase... without explicit approval" instruction.
- Committed and pushed to `origin/main` at the user's explicit request ("push to git dont
  ask permission") — see commit(s) for the full file list.
- Verification: live `node scripts/smoke-test.mjs`, 18/18 pass. `git status --short`/`git
  diff --check` reviewed before committing.
- Remaining: everything listed in `PHASE2_CUTOVER_CHECKLIST.md` section 1 (open
  decisions/gaps) before a cutover date should even be scheduled; frontend wiring and
  Android parity both explicitly not started.

## 2026-08-03 (cont. 6) — 0006 verified already-complete + made idempotent; 0007 applied and confirmed live (9/9)
- Objective: user reported `0006` erroring on re-run (`column "legacy_firestore_id" ...
  already exists` on `knowledge_notes`) and asked to verify actual DB state before
  assuming what that meant, provide an idempotent version if needed, and separately
  reported `0007` ran with no errors.
- Did not trust the error message alone: ran read-only `select legacy_firestore_id
  limit 1` probes (via `supabase-js` + the service_role key already in `supabase/.env`,
  no direct Postgres connection) against all four affected tables. Confirmed all four
  columns already exist — `0006` had fully committed in an earlier, unreported run.
- Rewrote `supabase/migrations/0006_knowledge_legacy_ids.sql` in place to be idempotent
  (`add column if not exists` / `create index if not exists`) — safe to run again
  regardless of partial state; also covers index existence, which couldn't be confirmed
  the same way (no PostgREST route for `pg_indexes`).
- Since the user confirmed `0007` applied cleanly, re-ran `smoke-test.mjs` to verify the
  fix live rather than just trusting "no errors" from the SQL Editor: **9/9 checks now
  pass**, including the previously-failing "grant clients.view via service_role, then
  confirm RLS allows the read" step. All of `0001`-`0007` are now confirmed applied and
  behaving as designed on the real `CAPDATABASE` project.
- Verification: live `node scripts/smoke-test.mjs` run, 9/9 pass, test user + test client
  both cleaned up automatically. `git status --short` reviewed.
- Did NOT: run the Firestore migration script; touch `AuthContext.jsx`/`apiClient.js`/
  `App.jsx`; remove Firebase code; edit `0001`-`0005`/`0007` (only `0006`, and only
  because its target state hadn't changed, just its re-run safety).
- Remaining: nothing currently blocking further Phase 2 prep on the Supabase side. Real
  Firestore data migration still blocked on Firebase Admin credentials (and user has said
  not to run it this session regardless); `frontend/.env` still missing in this clone.

## 2026-08-03 (cont. 5) — Live smoke test run (8/9 pass), real trigger bug found+fixed, Supabase apiClient scaffolded
- Objective: user recreated `supabase/.env` locally with real credentials and asked to run
  the smoke test, then continue Phase 2 work if it passed (explicitly still forbidding
  Firestore migration execution, `AuthContext` switch, Firebase removal, or destructive
  actions without approval; asked for undocumented new env vars to go in a `.env.example`
  rather than chat).
- Ran the smoke test live: `supabase/.env` confirmed present, gitignored, with all 3
  expected keys. First run: 6/6 passed, but the "RLS denies clients read" check was
  inconclusive (0 rows proves nothing on a table that might just be empty) — fixed by
  seeding one real client row via service_role first, and added a second check granting
  the permission afterward to prove the ALLOW branch too, plus a storage-bucket-existence
  check. Re-ran the strengthened version: 8/9 passed.
- **Real bug found**: granting the test user `clients.view` via service_role failed with
  "Only preferences may be self-updated." — `restrict_self_user_update()`'s bypass
  (`is_admin()`) depends on `auth.uid()`, NULL under service_role, so the trigger blocked
  trusted service-role writes, not just genuine self-updates. Would have broken the real
  Firestore migration's Phase C (sets migrated users' role/permissions via service_role).
  Wrote `supabase/migrations/0007_fix_admin_user_update_trigger.sql` (adds `or auth.uid()
  is null` to the bypass) — not applied, needs the user's SQL Editor run.
- Added `supabase/.env.example` (per the user's request that new required vars be
  documented there, not pasted into chat).
- Built `frontend/src/api/supabaseApiClient.js`: full Supabase-backed equivalent of
  `apiClient.js`'s `request`/`entities`/`integrations.Core.UploadFile`/`auth.*` shape, on
  top of the existing entity/database/storage/auth service layer. Not imported anywhere.
  Documented (not resolved) interface deviations: normalized `role_permissions` shape,
  `knowledge_service_codes.code` vs. Firestore's `service_code`, session-based password
  reset, and postgres_changes re-query semantics for `subscribe()`/`watch()`.
- Installed `frontend/node_modules` (also missing in this fresh clone, no credentials
  needed) so `npm run lint`/`typecheck`/`test` could actually run against the new file.
- Verification: `supabase`: `node --check` clean, live smoke test 8/9 (1 known, fixed-not-
  applied bug). `frontend`: `npm run lint` clean, `npm run typecheck` clean, `npm test` 2/2
  pass. `git status --short` reviewed — only expected files new/changed.
- Did NOT: run the Firestore migration script; touch `AuthContext.jsx`/`apiClient.js`/
  `App.jsx`; remove Firebase code; apply `0006`/`0007` (both prepared only).
- Remaining: user to run `0006`/`0007` whenever convenient; `frontend/.env` still missing
  in this clone (blocks `npm run dev`/`build`, not blocking anything done so far).

## 2026-08-03 (cont. 4) — All 6 migrations confirmed; smoke-test script built, blocked on missing local env
- Objective: user confirmed `0001`-`0006` all executed successfully; asked to continue the
  Phase 2 runbook, explicitly forbidding execution of the Firestore migration script,
  `AuthContext` switch, Firebase removal, or any other destructive action without approval,
  and asked to continue implementing/testing the Supabase service layer with Firebase still
  live. Asked the user to choose between a live smoke test against the real Supabase
  project vs. code-only work; user chose the live smoke test.
- Discovered a real, previously-undocumented gap while preparing to run it: this is a
  fresh clone, so `supabase/.env` and `frontend/.env` (gitignored, referenced throughout
  earlier memory as already populated) don't exist here at all. Confirmed via `git
  status`/`ls` and the new script's own fail-fast check. Nothing secret was at risk —
  there was simply nothing local to read.
- Built `supabase/scripts/smoke-test.mjs`: creates one throwaway auth user (admin API if
  `SUPABASE_SERVICE_ROLE_KEY` present, else `signUp` fallback), checks the
  `handle_new_auth_user` trigger's default profile shape, confirms RLS blocks a
  permission-gated `clients` select, confirms self-preferences update succeeds, confirms
  `restrict_self_user_update` blocks self role-escalation, then cleans up. `node --check`
  clean; ran once with no env file present to confirm it fails fast and cleanly (exit 1,
  clear message) rather than crashing.
- Ran `npm install` in `supabase/` (175 packages; no credentials required) so both this
  script and the data-migration script have their dependencies available whenever needed.
- Verification: `node --check` on the new script; `npm test` in `supabase/` still 7/7
  pass; `git status --short` reviewed — only expected files new/changed
  (`smoke-test.mjs`, `package-lock.json`, memory docs).
- Did NOT: run the data-migration script in any form; touch `AuthContext.jsx`/`apiClient.js`;
  remove any Firebase code; actually execute the smoke test (blocked on the missing env
  file, not yet resolved as of this entry).
- Remaining: user to recreate `supabase/.env` (`SUPABASE_URL`/`SUPABASE_ANON_KEY`,
  optionally `SUPABASE_SERVICE_ROLE_KEY`) via their own terminal/editor, not by pasting
  into chat again; then the smoke test can actually run.

## 2026-08-03 (cont. 3) — Phase 2 prep while 0002-0005 run; fixed a real migration-script gap
- Objective: user confirmed `0001_initial_schema.sql` executed successfully and was running
  `0002`-`0005` next; asked to prepare whatever Phase 2 work doesn't depend on those
  finishing, without removing Firebase or switching the live app, and to proceed with
  Phase 2 implementation once all five are confirmed.
- Used plan mode before writing code, given the live-production blast radius and multi-file
  scope. Static-reviewed `migrate-firestore-to-postgres.mjs` and `0001`-`0005` while
  planning and found a real bug: Phase A (`ENTITY_COLLECTIONS`) never imported
  `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents` —
  confirmed live collections via `frontend/src/api/apiClient.js`'s `routeCollections` and
  `entities.js`'s `KnowledgeBaseService` — and Phase C's existing
  `knowledge_notes.created_by` relink referenced a `legacy_firestore_id` column that was
  never added to that table (`0003` only added it to `knowledge_machines`). Running
  `--apply` as the script stood would have silently skipped 4 real tables and then errored.
- Files changed:
  - New `supabase/scripts/lib/entityMappings.mjs`: extracted the entity-mapping table out
    of the main script into a zero-dependency module (no `firebase-admin`/
    `@supabase/supabase-js` imports), added the 4 missing collections, added a
    `stripLegacyMarkers()` helper so a future new `_legacy_*` marker can't silently leak
    into an `insert()` call again.
  - New `supabase/scripts/lib/entityMappings.test.mjs`: 7 `node:test` cases covering all
    10 entities' defaults and the new knowledge_* legacy-marker tagging — runs with zero
    `npm install` since the module under test has no dependencies.
  - `supabase/scripts/migrate-firestore-to-postgres.mjs`: imports `ENTITY_COLLECTIONS`
    from the new module instead of defining it inline; added `knowledge_machines` to
    `idMaps`; added 4 `relinkTable()` calls for the knowledge_* tables' `knowledge_machine_id`
    FK in `runRelinkPhase`; added a new read-only `runVerifyPhase()` (Firestore doc count
    vs Postgres row count per table, no writes) wired into the default `PHASES` list and a
    new `migrate:verify` npm script; updated header comments.
  - New `supabase/migrations/0006_knowledge_legacy_ids.sql`: adds `legacy_firestore_id` to
    the four knowledge_* tables `0003` missed. Deliberately a new file, not folded into
    `0001`-`0005`, since those were mid-execution by the user and must be left as-is.
  - `supabase/package.json`: added `test` and `migrate:verify` scripts.
  - `docs/ai-memory/{PROJECT_STATE,KNOWN_ISSUES,ROADMAP,DECISIONS}.md`: recorded `0001`
    confirmed executed, `0002`-`0005` in progress, the bug fix, and a new Phase 2 execution
    runbook (DECISIONS.md) that maps "proceed with Phase 2" to specific, individually
    CLAUDE.md-section-12-gated steps rather than a blanket go-ahead for `--apply`/cutover/
    Firebase removal.
- Did NOT: run the migration script (dry-run or otherwise — still blocked on Firebase
  Admin credentials, unchanged this session); touch `frontend/`, `backend/`,
  `mobile-android/`, or `functions/`; wire `SupabaseAuthProvider` into `App.jsx`; edit
  `0001`-`0005`.
- Verification: `cd supabase && node --check scripts/migrate-firestore-to-postgres.mjs
  scripts/lib/entityMappings.mjs` clean; `npm test` 7/7 pass (no install needed);
  `git status --short` reviewed, only the listed files changed.
- Remaining: user to confirm `0002`-`0005` succeeded, then run `0006` whenever convenient
  (not urgent — script still can't run without Firebase Admin credentials). Phase 2's real
  steps (per the new runbook) each still need their own explicit approval when reached.

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
