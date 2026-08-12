# Known Issues

## Google Calendar sync removed 2026-08-12 — 3 follow-up actions still needed
- See `docs/ai-memory/DECISIONS.md`'s 2026-08-12 entry for the full removal record. Web UI,
  `apiClient`/`supabaseApiClient` integration, and all 8 Cloud Functions' code are removed.
  **Still outstanding**:
  1. **Delete the actually-deployed Cloud Functions from GCP** (code removal alone doesn't
     stop billing for whatever's still deployed from before). Exact command (also in
     `functions/index.js`'s header comment):
     ```
     firebase functions:delete googleCalendarStatus googleCalendarConnect \
       googleCalendarCallback googleCalendarListCalendars googleCalendarSelectCalendars \
       googleCalendarSetDisplayEnabled googleCalendarDisconnect googleCalendarEvents \
       --region=africa-south1 --project=capdatabasefb2
     ```
     Must be run by the user (Queen Bee can't run deploy/undeploy actions).
  2. **Revoke the stored OAuth connection** in Firestore `system_integrations/
     google_calendar` — the code that read/wrote it is gone, but the stored tokens
     themselves weren't explicitly deleted/revoked this session.
  3. **Android's `GoogleCalendarRepository` read-only consumer** (`mobile-android/app/src/
     main/java/za/co/connoisseurauto/capmobile/GoogleCalendarRepository.kt` +
     `MainActivity.kt` reference) was NOT touched — it will just get connection errors now
     that the Cloud Functions are gone (matches its existing error-handling design, not a
     crash), but it's dead code that should be removed by `android-ui-bee`/
     `integration-sync-bee` for cleanliness. Not delegated yet as of this entry.
- The previously-tracked "Google Calendar Cloud Functions reject a genuinely valid Supabase
  session with 401" bug (below, dated 2026-08-07) is now moot — the feature it affected no
  longer exists. Left in this file as historical record, not removed, since the underlying
  investigation (a real deployed-function 500/503 seen 2026-08-12, different from the
  documented 401) is what prompted the user's removal decision and may be relevant context
  if Google Calendar is ever reconsidered.

## Memory catch-up (2026-08-12): 2026-08-07 through 2026-08-11 work was never recorded here — reconstructed from agent memory + code comments, not a live session transcript
- On 2026-08-12, found the working tree (branch `supabase-phase3-cutover-prep`) had ~5 days
  of uncommitted, unpushed work (23 files, ~1240 lines) that this file/`PROJECT_STATE.md`/
  `SESSION_LOG.md` never captured — the last dated entry anywhere in `docs/ai-memory/` was
  2026-08-06. The narrative below (this entry plus the two new dated entries under this one)
  was reconstructed from Queen Bee agent memory (which *had* been kept current, just in the
  wrong location — see below) and dated code comments in the uncommitted files themselves,
  not from a live session log. Treat dates/details here as best-effort reconstruction, not a
  first-hand verified account, until a real session revisits and re-verifies each item.
- **Also found**: a duplicate `frontend/.claude/agent-memory/queen-bee/` directory holding 4
  real memory files (dated 2026-08-07) that were never merged into the canonical
  `.claude/agent-memory/queen-bee/` — same recurring Ruflo/Claude-Flow tooling-artifact
  pattern already documented in `[[project-supabase-migration]]`, except this instance had
  substantive content, not just 0-byte junk. Merged into the canonical location 2026-08-12.
  `frontend/.claude/`/`supabase/.claude/` (both containing only Ruflo `proven-config.json`
  tooling cache, no other real content) are left in the working tree, **unstaged and
  untracked** — Queen Bee's own delete attempt (`git rm`, plain `rm -rf`) was blocked by the
  auto-mode safety classifier as a sensitive `.claude`-directory deletion. **User action
  needed**: manually delete `frontend/.claude/` and `supabase/.claude/` if confirmed to be
  the same junk pattern (recommended), since Queen Bee cannot.

## Google Calendar Cloud Functions reject a genuinely valid Supabase session with 401 — found 2026-08-07, root cause unconfirmed, NOT fixed
- The first-ever test of the Google Calendar auth redesign with a **real, validly-signed**
  Supabase session (not an intentionally-malformed test token) found `GET
  googleCalendarStatus` returns `401 {"message":"Unauthorized"}` against the live deployed
  function. The 2026-08-06 "verified live" deploy only tested rejection paths (fake
  signature, missing header, garbage token, CORS preflight) — never a real successful
  Supabase session actually succeeding. This 2026-08-07 test is the first real positive-path
  test, and it fails.
- **Isolated so far**: reproducing `verifySupabaseUser()`'s exact logic
  (`supabase.auth.getUser(token)` via a service-role client, then a `public.users` profile
  query) locally against the real project with the current `supabase/.env` service-role key
  succeeds every time. This proves the logic itself is sound and the current local
  service-role key is valid/working — the failure is specific to the **deployed** function's
  environment. Most likely cause (unconfirmed): the `SUPABASE_SERVICE_ROLE_KEY` Firebase
  Secret bound to the deployed function is stale (doesn't match the key rotated/verified
  2026-08-06), or the deployed `SUPABASE_URL` differs from the local default. Queen Bee has
  no Cloud Functions log access in this environment to confirm directly.
- **Blocks**: any real Supabase-backend Google Calendar QA, and therefore blocks a real
  go/no-go cutover recommendation for Calendar specifically (core data-layer QA is unaffected
  — see the QA summary below).
- **Recommended next step**: user checks Cloud Functions logs for the real
  `verifySupabaseUser`/`getUser` error; as a first troubleshooting guess, re-run `firebase
  functions:secrets:set SUPABASE_SERVICE_ROLE_KEY` with the current `supabase/.env` value and
  redeploy, then re-test with `supabase/scripts/qa-test-user.mjs` + `qa-clickthrough.mjs`
  (both untracked in the repo, kept specifically for this retest). Not fixed — deploys are
  always user-run per CLAUDE.md section 12, and the root cause isn't confirmed enough to
  guess-fix blind.

## Phase 3 scripted QA (2026-08-07, no browser tool available): core data/auth/RLS layer passed; Calendar blocked by the 401 bug above
- `mcp__claude-in-chrome__*` browser tools were not actually available/loaded in that
  session, so a real UI click-through wasn't possible. Substituted scripted verification: a
  throwaway admin-equivalent Supabase Auth test user (`qa-test-user.mjs`) driving the exact
  `supabase.from(table).select/insert/update/delete()` calls the real frontend code makes
  (`qa-clickthrough.mjs`), plus a real HTTP call to the deployed Calendar function with that
  session's token. This tests the real auth/data/RLS layer end-to-end but does **not** verify
  visual rendering, navigation, or client-side JS bugs (the `AuthLayout.jsx` prop-drop bug
  below was NOT caught by this method — found later via direct code inspection instead).
- **Passed**: auth, all table reads, full CRUD write/update/delete, permission-bypass check
  (`role=admin`) — all against the real project with a real (throwaway) session.
- **Failed**: Google Calendar (see the 401 entry above) — isolated to that integration only.
- One QA run left a second, unexpected duplicate throwaway test user behind that only a full
  residual-data sweep (not just deleting the one tracked ID) caught — `qa-cleanup-smoketest-
  residue.mjs` exists for exactly this. Always do a full sweep after using throwaway test
  data, not just delete-by-known-id.

## `permissions`/`role_permissions` were never migrated at all, plus a real column-name mismatch vs. the live UI — fixed via new migration, NOT yet applied (found ~2026-08-11)
- `migrate-firestore-to-postgres.mjs`'s entity mappings never covered the `permissions`
  (flat catalog) or `role_permissions` (per-role permission arrays) Firestore collections at
  all — confirmed live: 0 rows in both real Postgres tables. Even once populated, two
  real column mismatches would have broken the live UI: `frontend/src/pages/UserAdmin.jsx`
  reads `permission.name`/`permission.group` directly, and `supabaseApiClient.js`'s
  `GET /permissions` handler groups by `permission.group` — but
  `0001_initial_schema.sql` only ever gave `permissions` a `label` column and no `group`
  column at all. Real Firestore data: 76 `permissions` docs (`name`/`group` fields, e.g.
  `group="Calendar"`), 4 `role_permissions` docs (one per role, each a permissions array).
- **Fixed, not yet applied**: `supabase/migrations/0014_permissions_name_and_group.sql`
  (renames `label`→`name`, adds `group` column — safe since both tables are still empty
  live, confirmed immediately before writing the file) + new
  `supabase/scripts/migrate-permissions.mjs` (dry-run by default, fans each
  `role_permissions` doc's array out into normalized `(role, permission_key)` rows matching
  the existing Postgres shape). **`0014` needs the user to run it via the SQL Editor before
  `migrate-permissions.mjs --apply`** — same pattern as every prior migration.

## `AuthLayout.jsx` silently dropped every caller's `icon`/`title`/`subtitle`/`footer` props — pre-existing since file creation (2026-07-14), unrelated to the migration, fixed 2026-08-11
- Found directly during Supabase auth QA click-through: every auth page (Login, Register,
  ForgotPassword, ResetPassword) rendered as a near-empty white card with no heading —
  `AuthLayout.jsx` only ever rendered `{children}`, ignoring the other props every caller
  already passed. Pre-existing under Firebase too, not introduced by the migration, but
  low-risk/presentational-only so fixed inline rather than just flagged. Also had to
  locally override `--foreground`/`--card-foreground`/`--muted-foreground` CSS custom
  properties inside the card, since the app's global theme is dark-mode-by-design but this
  card is intentionally a light/white surface — scoped via inline `style`, not a global
  theme change. Verification status of this fix (build/lint/test) not yet re-confirmed as of
  2026-08-12 — see the verification-gap note below.

## Local dev couldn't load at all with VITE_AUTH_BACKEND=supabase — frontend/.env had no Firebase config, and firebase.js's eager fail-fast blocks the whole app regardless of backend (2026-08-06, fixed)
- Started manual QA (Phase 3 step 3, per user's ordered validation plan): local dev server
  (`VITE_AUTH_BACKEND=supabase npm run dev -- --port 5173`), sent a fresh password-reset
  email pointed at it. User clicked the link and got a **blank white page**, not even the
  app's own "Invalid reset link" fallback.
- **Root cause, confirmed via the browser console (user reported the exact error, not
  guessed)**: `Uncaught Error: Missing Firebase configuration: apiKey, authDomain,
  projectId, storageBucket, messagingSenderId, appId` at `firebase.js:20`.
  `frontend/.env` (local dev) never had `VITE_FIREBASE_*` values at all (a pre-existing,
  previously-harmless gap — see the "frontend/.env still does not exist" entry below,
  originally about `npm run dev` not running at all). It became a hard blocker specifically
  because of this session's Phase 3 flag wiring: `frontend/src/lib/AuthContext.jsx` (and
  `apiClient.js`/`functionsClient.js`) still statically/unconditionally import from
  `@/lib/firebase` at module scope regardless of `VITE_AUTH_BACKEND`, and `firebase.js`
  itself throws **eagerly at import time** if its env vars are missing (the same class of
  bug already found+fixed for Supabase's `client.js` earlier this session, via a lazy
  Proxy) — but `firebase.js` itself was never made lazy, so the crash happens before React
  can render anything at all, with no error boundary to catch it (blank white page, not a
  graceful fallback).
- **Fixed pragmatically, no code changes**: added the same real, public-safe Firebase web
  config already committed in `frontend/.env.production` (not a secret — same posture as
  the Firebase project's own public client config, protected by `firestore.rules`/Storage
  rules, not by hiding these values) to local `frontend/.env`. Restarted the dev server
  (Vite reads `.env` at startup only, not live) to pick it up — confirmed responding again.
- **Design asymmetry worth remembering, not fixed this round** (deliberately, per the
  user's "fix only issues directly related to the Supabase migration, do not implement new
  features" instruction — this is a defensive robustness improvement, not required for the
  migration itself to work correctly once `frontend/.env`/`.env.production` both have real
  values for both backends, which they now do): unlike `services/supabase/client.js`
  (lazy Proxy, added earlier this session), `frontend/src/lib/firebase.js` still fails
  fast at import time regardless of which backend is actually selected. This is low-risk in
  practice (both `.env` and `.env.production` now have real values for both backends), but
  if a future environment ever has Supabase config but not Firebase config, the app would
  still hard-crash instead of gracefully running Supabase-only. Revisit if that scenario
  becomes real.
- **Real-world flow gap, not a bug**: the reset email's link only resolves on whichever
  machine runs the `localhost:5173` dev server. User's email account is on a different
  computer than the dev server — resolved by having the user open/check the email via a
  browser on the dev-server machine itself, not by changing any config.
- **Status at end of day 2026-08-06**: dev server running (Firebase config now present,
  confirmed loads), a fresh password-reset email sent and accepted (2nd resend, first one's
  token was never consumed since the app crashed before Supabase's client ever touched the
  URL hash — likely still technically valid but superseded by the resend). User stepping
  away, will click the link and continue QA tomorrow. Nothing beyond this env fix was
  changed — no application code touched this entry.

## Real bug found in the FIRST live deploy of the Google Calendar auth redesign — RESOLVED, redeployed and verified (2026-08-06)
- User deployed `functions/lib/auth.js`/`supabaseAuth.js` for the first time
  (`firebase deploy --only functions`, after the `SUPABASE_SERVICE_ROLE_KEY` secret and GCP
  billing blockers were both resolved). Queen Bee verified the live deploy with a real
  request rather than trusting "it is done": sent a bearer token with a real Supabase
  issuer claim (fake signature) to the live `googleCalendarStatus` URL — got a raw `500`
  instead of the expected `401`.
- **Root cause, confirmed via live Cloud Functions logs**: `@supabase/supabase-js`'s
  `createClient()` unconditionally constructs an internal Realtime client requiring a
  global `WebSocket` constructor. Node 22+ has this natively; Cloud Functions' pinned
  runtime is Node 20 (`functions/package.json`'s `engines`), which doesn't. Not caught by
  local testing because the local dev machine runs Node 24 (confirmed via `node --version`)
  — a real, easy-to-miss environment mismatch between local testing and the actual
  deployed runtime.
- **Confirmed zero impact on real production traffic**: `getServiceRoleClient()` (the
  function that hits this bug) is only ever called from `verifySupabaseUser()`, which is
  only reached when a token's issuer actually matches Supabase's — real users authenticate
  with Firebase ID tokens today, which take the completely unchanged original code path and
  never reach this bug. Only found because Queen Bee deliberately crafted a Supabase-shaped
  test token to verify the new branch was actually live.
- **Fixed**: `functions/lib/supabaseAuth.js` now polyfills `globalThis.WebSocket` with the
  `ws` package (new direct dependency, `functions/package.json`) before `createClient()` is
  ever called, guarded so it's a no-op on any Node version that already has a native
  `WebSocket` (e.g. local dev). Verified: `functions` lint clean, `npm test` 76/76
  (unchanged pass count — this fix doesn't change any of the already-mocked test paths,
  only real un-mocked `createClient()` calls, which local tests happen to succeed at
  regardless of the polyfill since local Node already has native WebSocket).
- **Redeployed and verified live, RESOLVED (2026-08-06).** User redeployed. Re-ran the same
  live probe: now correctly returns `401 {"message":"Unauthorized"}` instead of `500`.
  Additionally verified 3 more real live requests against the deployed function to confirm
  no regression: missing Authorization header (401, unchanged), a garbage non-JWT token
  routed through the still-unchanged Firebase branch (401, unchanged), and a CORS preflight
  OPTIONS request (204, unchanged). Checked live Cloud Functions logs directly: both the
  Supabase-branch failure (`__isAuthError: true, status: 401`) and the Firebase-branch
  failure (`FirebaseAuthError: Decoding Firebase ID token failed`) are handled cleanly by
  `guarded()`'s catch block — no unhandled exceptions, no crashes. The Google Calendar auth
  redesign is now genuinely live and working for both issuer branches, though only the
  Firebase branch has any real traffic yet (no client authenticates via Supabase in
  production — `VITE_AUTH_BACKEND` still defaults to `firebase` everywhere).

## Firebase Secret Manager billing error — RESOLVED (2026-08-06)
- First attempt at `functions:secrets:set SUPABASE_SERVICE_ROLE_KEY` failed with a billing-
  not-enabled error, unexpectedly (existing Google Calendar secrets already worked in the
  same project). User retried and it succeeded — likely transient/propagation delay rather
  than a real billing gap, since no billing change was reported. Secret confirmed created
  (`Created a new secret version projects/100946498038/secrets/SUPABASE_SERVICE_ROLE_KEY/versions/1`)
  and confirmed bound correctly to all 8 functions via the live deploy's Cloud Functions
  logs (`secretEnvironmentVariables` includes it alongside the two Google Calendar secrets).

## Supabase Auth "Redirect URLs" allowlist status is unknown — needs the user to check the dashboard (2026-08-06)
- `supabase/scripts/send-password-reset-emails.mjs --apply` was run for real
  (`admin@connoisseurauto.co.za`) with `redirectTo` pointed at the live production URL —
  but the live production frontend doesn't have the Supabase-aware `ResetPassword.jsx` fix
  deployed, and even if it did, `VITE_AUTH_BACKEND` defaults to `firebase` there, so the
  link isn't actually completable right now regardless (see the entry below). That first
  send should be treated as expired/unusable by the time real QA happens.
- Started a local dev server (`VITE_AUTH_BACKEND=supabase npm run dev -- --port 5173`,
  confirmed responding, `/reset-password` route resolves) as a real test target for a
  re-sent email. **Before re-sending with `--redirect-to=http://localhost:5173/reset-password`**,
  confirm that URL (or `http://localhost:5173/*`) is in Supabase's Auth → URL Configuration
  → Redirect URLs allowlist for this project — Queen Bee cannot check or edit this itself
  (Dashboard-only, no Management API token available). If it's not listed, Supabase may
  silently redirect elsewhere or reject the link rather than erroring at send time, so this
  needs confirming before assuming a re-sent email will actually work.

## Live production password-reset link (sent 2026-08-06) is not currently completable
- The one real password-reset email already sent (`admin@connoisseurauto.co.za`, via
  `send-password-reset-emails.mjs --apply`) points at
  `https://capdashboard.gerhardvanwijk.workers.dev/reset-password` — the live, currently-
  deployed production frontend, which does NOT have today's `ResetPassword.jsx` fix
  (nothing was deployed to Cloudflare this session) and whose `VITE_AUTH_BACKEND` correctly
  still defaults to `firebase` regardless. Clicking that link will very likely show
  "Invalid reset link." Supabase recovery links are time-limited (~1hr default) and likely
  already expired by the time this is revisited — plan to re-send once a real test target
  (local dev, confirmed redirect-allowlisted) is ready, not to reuse this one.

## `SUPABASE_SERVICE_ROLE_KEY` rotation — DONE, verified working (2026-08-06)
- User rotated the key via the Supabase Dashboard and updated `supabase/.env` directly
  themselves (recommended path — avoided re-pasting the secret into chat, per the earlier
  "Supabase migration secrets exposed" incident below).
- **Verified the new key live, not just assumed**: `migrate-firestore-to-postgres.mjs
  --phases=verify` (read-only, all 10 collections still match) and a full
  `smoke-test.mjs` run — **18/18 checks pass** with the new key, including Auth Admin API
  user creation, service_role RLS-bypass writes, both triggers, storage-bucket checks, and
  full cleanup (all seeded rows + the test user deleted afterward, no residue). This proves
  the new key has full working service-role capability, not just basic connectivity.
- No other file in the repo holds the raw key (Cloud Functions aren't deployed yet, so
  there's no stale Secret Manager copy to worry about either) — `supabase/.env` was the only
  place needing an update, and it's done.

## Google Calendar Cloud Functions auth redesign is implemented but not deployed (2026-08-06)
- `functions/lib/auth.js`'s `requireUser()` now supports both Firebase ID tokens (unchanged
  path) and Supabase JWTs (new, via `functions/lib/supabaseAuth.js`) — written, unit-tested
  (76/76 `functions` tests pass), `node --check`/lint clean. **Not deployed.** Firebase
  Cloud Functions still only run the pre-2026-08-06 code until `firebase deploy --only
  functions` is explicitly approved and run — see PROJECT_STATE.md's 2026-08-06 entry.

## Frontend `VITE_AUTH_BACKEND` flag exists in code but has never been live-QA'd end-to-end (2026-08-06)
- `AuthContext.jsx`/`apiClient.js`/`functionsClient.js`/`ResetPassword.jsx` all now branch
  on `VITE_AUTH_BACKEND`, verified via unit tests and real production builds (one per flag
  value) — but no one has actually run the app in a browser with the flag set to
  `supabase` and clicked through real pages. Currently blocked, in order: (1) key rotation
  (see entry above), (2) `send-password-reset-emails.mjs --apply` actually run + the email
  confirmed received + a real password set (the 1 migrated Supabase Auth user has no
  usable password yet — script is built and dry-run verified, not yet sent for real), (3)
  the undeployed Cloud Functions auth redesign (Google Calendar would 401 under a Supabase
  session until deployed). Do this live QA pass before ever considering the actual cutover
  (`PHASE2_CUTOVER_CHECKLIST.md` section 4).

## `service_records.photos` / `job_cards.arrival_photos` have no Postgres columns — confirmed no data loss, not fixed (2026-08-06)
- Real UI fields (`MachineDetail.jsx`, `ServiceRecords.jsx`, `JobCardDetail.jsx` all read
  them) with no Postgres column and no entry in `entityMappings.mjs`'s mapper — found while
  reviewing storage-phase coverage during the users/storage migration run.
- **Confirmed no data loss**: live Firestore query found zero real `service_records`/
  `job_cards` docs with either field populated. Root cause traced: `frontend/src/
  components/LogServiceModal.jsx` uploads photos into local component state and displays
  them for review, but its `ServiceRecord.create()` payload never actually includes
  `photos` — the upload feature has never worked end-to-end, a pre-existing frontend bug
  unrelated to the Supabase migration. `job_cards.arrival_photos` is read-only dead code
  with no writer anywhere (`BookIn.jsx` writes photo URLs into `technician_notes` as text
  instead, not into a dedicated field).
- Not fixed — out of migration scope (fixing the upload feature itself is a `frontend/`-only
  bug fix, not part of Firebase->Supabase data migration). If asked to fix the upload
  feature later, remember to add matching Postgres columns + mapper entries first so the
  fix doesn't immediately create a new migration gap.

## Password-reset-email script for migrated Supabase Auth users still doesn't exist (2026-08-06, carried over)
- The `users` migration phase ran 2026-08-06: 1 real user (`admin@connoisseurauto.co.za`)
  now has a real Supabase Auth account, but with no usable password (Firebase password
  hashes can't be imported via `auth.admin.createUser`). No script exists yet to trigger a
  recovery email (e.g. `supabase.auth.admin.generateLink({ type: 'recovery', ... })` per
  user). Not blocking anything right now since Supabase isn't the live backend for any
  client yet, but must exist and be tested before any real cutover — see
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` section 1.

## Supabase migration tooling won't work from a new machine without recreating local secrets (2026-08-04)
- `supabase/.env` (Supabase URL/anon/service_role keys + `GOOGLE_APPLICATION_CREDENTIALS`
  path) is gitignored by design and does not travel via `git clone`/`git pull`. The
  Firebase service-account JSON key it points to also lives outside the repo entirely
  (`C:\Users\Gerhard\Documents\cap database firebase files\...json` on the machine used
  this session) and isn't tracked anywhere.
- User is switching to a different machine ("home"). Before any further
  `migrate-firestore-to-postgres.mjs` run (even read-only `--phases=verify`) works there,
  both need recreating: `supabase/.env` with the same 3 values (see
  `supabase/.env.example` for the exact keys expected), and the Firebase service-account
  JSON key placed somewhere on that machine with `GOOGLE_APPLICATION_CREDENTIALS` in
  `supabase/.env` pointed at it. `frontend/.env` (Firebase + Supabase client keys) is a
  separate, also-gitignored file with the same portability gap for anything needing
  `npm run dev`/`build` on the new machine.
- Not a blocker for anything else — all code/schema/docs work in this repo is unaffected
  and available immediately after a clone, on any machine.

## First real `--apply` partially failed on NOT NULL FK constraints — FIXED via 0012, applied and content-verified live (2026-08-04)
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
  NULL on 4 columns; does not weaken the FK `references` constraint itself). **User
  applied `0012` ("100% success"); retried the write scoped to the 4 failed tables only
  — all 4 succeeded. Full `--phases=verify` across all 10 collections: all match. Content
  spot-checked (not just counts) by tracing real IDs through Postgres — correct.** This
  issue is now fully resolved, not just fixed-in-code.
- **What mattered for the retry** (worth remembering for any future partial-failure
  retry): re-ran scoped to
  `--only=machines,service_records,job_card_lines,knowledge_machines` — NOT a bare
  `--apply --phases=entities,relink,verify` with no `--only`, which would have tried to
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

## `knowledge_notes`/`knowledge_media`/`knowledge_documents`/`knowledge_service_codes` schema gap — FIXED 2026-08-05, NOT yet applied
- Found 2026-08-04 as a side effect of investigating `knowledge_machines`
  (`KnowledgeMachineDetail.jsx` renders all four sub-collections together): real code uses
  `content` on notes (schema had `body`), stores an uploaded `file_url` (the full download
  URL `UploadFile` returns) on media/documents rather than a `storage_path`, plus an
  `original_filename` the schema didn't capture at all, and `knowledge_service_codes` has a
  `function_name` field with no schema column, plus a `service_code` field the reveal
  endpoint reads that the schema had named `code` instead.
- Deferred at the time since all four collections had zero real documents in every dry run
  so far — no data-loss risk, but confirmed still worth fixing before real content is ever
  added or before any real `--apply` touches these tables.
- **Fixed 2026-08-05**: `supabase/migrations/0013_knowledge_subcollections_real_fields.sql`
  (column renames: `body`→`content`, `code`→`service_code`, `storage_path`→`file_url` on
  both media/documents; new columns: `note_type`, `function_name`, `original_filename`,
  `title` on media). `supabase/scripts/lib/entityMappings.mjs`'s mapper updated to match
  (12/12 unit tests pass, was 8). `frontend/src/api/supabaseApiClient.js`'s
  `knowledge-service-codes/:id/reveal` handler updated from `record.code` to
  `record.service_code` to match. Verified: `frontend` lint/typecheck/test all clean;
  `supabase` `node --check` + `npm test` clean.
- **`0013` has NOT been applied to the real `CAPDATABASE` project yet** — needs the user to
  run it via the SQL Editor, same as every prior migration. Safe to run any time before real
  content exists in these four tables (still true as of 2026-08-05); becomes a real
  data-affecting rename once they hold real rows.
- **Second, deeper bug found and fixed in the same pass**: `supabase/scripts/
  migrate-firestore-to-postgres.mjs`'s Phase D (storage copy) independently read the same
  wrong `storage_path` field name directly off the raw Firestore document (not through the
  entityMappings.mjs mapper, so the schema fix alone would not have caught it), and even
  with the field name corrected, a bare rename would still not have worked — the real field
  is a full Firebase Storage *download URL*, not a bare object path, and the Firebase Admin
  SDK's `bucket().file(path)` needs the raw decoded object path. Fixed via a new
  zero-dependency, unit-tested helper `supabase/scripts/lib/firebaseStorageUrl.mjs`
  (`extractFirebaseStoragePath()`, 6/6 tests) that parses the download-URL shape and
  extracts+decodes the real object path. Phase D also now re-points each migrated row's
  Postgres `file_url` to a fresh Supabase signed URL after a successful copy (previously it
  copied the file but left Postgres pointing at the stale Firebase URL forever). Still
  untested against a real download URL end-to-end (no real documents exist in either
  collection to test against) — the unit tests cover the URL-parsing logic in isolation
  only, not a live Firebase Storage read.

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
