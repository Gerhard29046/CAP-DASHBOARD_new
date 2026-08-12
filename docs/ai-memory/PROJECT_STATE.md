# Project State
_Last verified: 2026-08-12. **Google Calendar sync was removed entirely this session** (user
decision: cost) — see the dated entry below and `docs/ai-memory/DECISIONS.md`. Web UI
(`SystemSettings.jsx` deleted, `/settings` route/nav gone), `apiClient`/`supabaseApiClient`
Google routes, and all 8 Cloud Functions' code are removed; the in-app Calendar page
(Upcoming Services) is kept and unaffected. **Still needed**: the user must run `firebase
functions:delete ...` to stop billing on whatever's still actually deployed (exact command
in KNOWN_ISSUES.md), revoke the stored Firestore OAuth connection, and Android's
`GoogleCalendarRepository` needs removing by `android-ui-bee`/`integration-sync-bee` (not
done yet). The previously-tracked "Calendar rejects a valid Supabase session with 401" bug
(2026-08-07) is now moot — the feature is gone — but is kept as historical record below.
**Firebase -> Supabase Phase 2 (data migration) is fully complete**, separately from the
above. **Phase 3 scripted QA (2026-08-07) passed for the core auth/data/RLS layer**
(throwaway-admin-test-user script-driven, since no browser tool was available). A real,
pre-existing (not migration-caused) `AuthLayout.jsx` UI bug was found+fixed 2026-08-11 (auth
pages rendered with no heading). A real migration gap (`permissions`/`role_permissions`
never migrated, plus a column-name mismatch) was found+fixed via a new unapplied migration
(`0014`) ~2026-08-11.
**~23 files / ~1240 lines of this work sat uncommitted in the working tree** on branch
`supabase-phase3-cutover-prep` until 2026-08-12. **Nothing is live** — `VITE_AUTH_BACKEND`
still defaults to `firebase` everywhere in every committed/production config. Password-reset
email flow has still never been physically clicked end-to-end by a real human (deferred,
not blocking); a real admin password WAS set directly via `qa-set-admin-password.mjs`
2026-08-11 as a workaround (see KNOWN_ISSUES.md/agent memory
`project_supabase_password_reset_untested`). See SESSION_LOG.md for full narrative before
continuing — the 2026-08-07/08-11 detail there is reconstructed, not first-hand verified._

## Google Calendar sync removed entirely — cost decision (2026-08-12)
- User: "i dont want to connect to google calender anymore. it cost me too much money", then
  "make that the calender doesnt sync to google. but keep a calender." This came right after
  Queen Bee found the live `googleCalendarStatus` function returning raw platform-level
  500/503 errors (not clean app-level 401s) on every request pattern during unrelated
  Supabase-migration QA — possibly related to cost-cutting action the user had already taken
  on the Google Cloud side, never confirmed.
- **Removed, verified via real builds/tests, not just written**: `frontend/src/pages/
  SystemSettings.jsx` (deleted — sole purpose was Google Calendar UI), `/settings` route +
  nav entry (`App.jsx`/`AppLayout.jsx`), `frontend/src/api/functionsClient.js` (deleted —
  sole purpose was calling Google Calendar Cloud Functions), the Google branch of both
  `apiClient.js`'s and `supabaseApiClient.js`'s `calendarEvents()` + their `/google-
  calendar/*` route dispatch, `CalendarPage.jsx`'s Google toggle/status/event-details UI
  (Upcoming-Services UI **kept** — it never depended on Google), all 8 `googleCalendar*`
  Cloud Functions (`functions/index.js` now exports nothing), `functions/lib/
  googleCalendarService.js`/`googleCalendarStore.js`/`googleOAuthClient.js` + their tests,
  `googleapis` from `functions/package.json`, `VITE_FUNCTIONS_BASE_URL` from `frontend/
  .env.production`/`.env.example`. `CLAUDE.md` section 7 rewritten to record the removal.
- **Deliberately kept**: `functions/lib/auth.js`/`supabaseAuth.js` (generic, reusable Cloud
  Functions auth infra, not Google-specific, unused/unbilled with nothing exporting them);
  `calendar.google.*` permission keys (unused, harmless, not worth touching the permission
  model for a pure cleanup); Laravel's Google Calendar code (already-documented dead code);
  `docs/GOOGLE_CALENDAR_SETUP.md`/`GOOGLE_CALENDAR_AUTH_REDESIGN.md` (historical record).
- **Verified**: `frontend` lint/typecheck/test (2/2)/build all clean after every edit;
  `functions` lint clean, test suite 28/28 pass (3 Google-specific test files deleted
  alongside their subjects, matching the removed code — not silently skipped).
- **Not done this session** (see KNOWN_ISSUES.md for the exact follow-up list): the user
  still needs to run `firebase functions:delete ...` to stop billing on whatever's actually
  deployed right now (code removal alone doesn't undeploy anything); the stored Firestore
  `system_integrations/google_calendar` OAuth connection wasn't explicitly revoked; Android's
  `GoogleCalendarRepository` read-only consumer wasn't touched (belongs to `android-ui-bee`/
  `integration-sync-bee`, not delegated yet).
- This is a clean, git-recoverable removal, not a destructive data-loss action — no
  Firestore/Storage data was deleted by this change itself.

## Firebase -> Supabase migration — memory catch-up: reconstructed 2026-08-07 through 2026-08-11 work, found+merged stray memory, found ~5 days of uncommitted work (2026-08-12)
- **This entry is a reconstruction**, not a first-hand session account — `docs/ai-memory/`
  was never updated past 2026-08-06 despite real work continuing. Rebuilt from Queen Bee
  agent memory (which had been kept current, but written to the wrong path — see below) and
  dated code comments in the still-uncommitted files. Treat every claim here as needing
  re-verification by whoever picks this up next, not as equivalent to a live-verified entry.
- **Found a real process gap**: `frontend/.claude/agent-memory/queen-bee/` (a duplicate,
  wrong-location copy of this project's Queen Bee memory, 4 real files dated 2026-08-07) had
  never been merged into the canonical `.claude/agent-memory/queen-bee/` at the repo root —
  same recurring Ruflo/Claude-Flow tooling-artifact pattern already flagged repeatedly in
  memory, except this instance had real substantive content instead of 0-byte junk. Merged
  2026-08-12. The leftover `frontend/.claude/`/`supabase/.claude/` directories (Ruflo
  `proven-config.json` cache only, nothing else of value) could not be deleted — Queen Bee's
  `git rm`/`rm -rf` attempts were both blocked by the auto-mode safety classifier as sensitive
  `.claude`-directory deletions. Unstaged instead; **user should delete both manually**.
- **2026-08-07 (reconstructed)**: first real positive-path test of the Google Calendar auth
  redesign (a genuinely valid Supabase session, not a deliberately-malformed test token)
  found it fails with 401 against the live deployed function — see KNOWN_ISSUES.md, not
  fixed, root cause unconfirmed. Separately, scripted QA (no browser tool available in that
  session) using a throwaway admin-equivalent Supabase Auth test user
  (`supabase/scripts/qa-test-user.mjs` + `qa-clickthrough.mjs`, both untracked) found the
  core auth/data/RLS layer works correctly end-to-end (all CRUD, permission-bypass check) —
  only Calendar failed. A residual-data sweep found and cleaned an unexpected duplicate
  leftover test user (`qa-cleanup-smoketest-residue.mjs`).
- **~2026-08-11 (reconstructed from code comments)**: found+fixed a real, unrelated-to-
  migration UI bug — `frontend/src/components/AuthLayout.jsx` silently dropped every
  caller's `icon`/`title`/`subtitle`/`footer` prop since the file's creation (2026-07-14),
  rendering every auth page as a near-empty white card. Also found+fixed a real migration
  gap: `permissions`/`role_permissions` were never in the migration script's entity mappings
  at all (0 rows live) and had a column-name mismatch (`label` vs the real `name`, missing
  `group`) vs. what `UserAdmin.jsx` actually reads — new `supabase/migrations/
  0014_permissions_name_and_group.sql` (NOT yet applied) + new
  `supabase/scripts/migrate-permissions.mjs`. Also: a real password was set directly for the
  migrated admin account via `qa-set-admin-password.mjs` (explicit user approval per its own
  code comment), verified via a real `signInWithPassword` call — a workaround for the
  still-unclicked password-reset-email flow, not a replacement for testing that flow for
  real. A recovery-link generator (`qa-generate-recovery-link.mjs`) was also added to hand
  back a real recovery link directly (bypassing email delivery) for the same reason.
- **2026-08-12**: found all of the above sitting uncommitted (~23 files, ~1240 lines) on
  branch `supabase-phase3-cutover-prep`, with `.mcp.json`/`.claude/settings.json` tooling
  config changes (Supabase MCP server, statusline) mixed in. Consolidated memory, wrote this
  catch-up entry and matching `KNOWN_ISSUES.md`/`SESSION_LOG.md`/`ROADMAP.md` entries, then
  ran fresh verification (see the next dated entry) before committing.
- **Not done this pass**: did not attempt to fix the Calendar 401 bug (needs Cloud Functions
  log access Queen Bee doesn't have) or apply `0014` (needs the user via the SQL Editor) or
  send/click a real password-reset email. Firebase remains the sole live production backend
  throughout; nothing in this catch-up pass touched production.

## Firebase -> Supabase migration — Google Calendar auth redesign deployed live, real bug found+fixed via live testing (2026-08-06)
- Following key rotation (below) and "fix everything dude" (read as approval for the
  Functions deploy specifically, not the production cutover), attempted the deploy.
- **Real infra hiccup, self-resolved**: `firebase functions:secrets:set
  SUPABASE_SERVICE_ROLE_KEY` (run by the user themselves — Queen Bee's auto-mode classifier
  correctly blocked doing this programmatically, since it requires piping a raw secret
  through a command Queen Bee runs) failed once with a billing-not-enabled error despite
  existing secrets already working in the same project, then succeeded on retry — likely
  transient. Secret confirmed created and, later, confirmed correctly bound to all 8
  functions via live deploy logs.
- The actual `firebase deploy --only functions` command is **also blocked by the auto-mode
  classifier** for Queen Bee directly (a hard system-level gate on production deploys,
  distinct from and in addition to CLAUDE.md's own policy) — asked the user to run it
  themselves each time, did not attempt to route around it.
- **First deploy attempt: verified live, not trusted at face value.** User said "it is
  done." Instead of accepting that, sent a real HTTP request to the live
  `googleCalendarStatus` URL with a bearer token carrying a real Supabase issuer claim (fake
  signature) — got a raw `500`, not the expected `401`. Checked live Cloud Functions logs
  directly: `@supabase/supabase-js`'s `createClient()` unconditionally constructs an
  internal Realtime client requiring a global `WebSocket`, which Node 22+ has natively but
  Cloud Functions' pinned Node 20 runtime does not. **Not caught by local testing** because
  the local dev machine runs Node 24 (confirmed via `node --version`) — a genuine
  environment mismatch between local testing and the actual deployed runtime, worth
  remembering for any future Node-version-sensitive dependency.
- **Confirmed zero impact on real production traffic before or during the bug**: traced
  the code path — `getServiceRoleClient()` (where the crash occurred) is only reached when
  a token's issuer actually matches Supabase's; real users authenticate with Firebase ID
  tokens, taking the completely unchanged original path. Only found because Queen Bee
  deliberately crafted a Supabase-shaped test token specifically to verify the new branch
  was live — not something any real caller would trigger, since no client sends
  Supabase-issued tokens yet (`VITE_AUTH_BACKEND` defaults to `firebase` everywhere).
- **Fixed**: `functions/lib/supabaseAuth.js` now polyfills `globalThis.WebSocket` with the
  `ws` package (new direct dependency) before `createClient()` is ever called, guarded to
  be a no-op on any Node version with a native `WebSocket` already. Verified: `functions`
  lint clean, `npm test` 76/76 unchanged (the fix only affects real un-mocked
  `createClient()` calls, which local tests happen to succeed at regardless since local
  Node already has native WebSocket — the bug was Cloud-Functions-runtime-specific).
- **Second deploy: verified live and genuinely correct this time.** User redeployed. Sent
  4 real live requests against the deployed function: the same Supabase-issuer test token
  (now correctly `401 {"message":"Unauthorized"}`), a missing Authorization header
  (`401`, unchanged), a garbage non-JWT token exercising the still-unchanged Firebase branch
  (`401`, unchanged), and a CORS preflight `OPTIONS` request (`204`, unchanged). Checked live
  Cloud Functions logs directly: both the Supabase-branch failure
  (`__isAuthError: true, status: 401`) and the Firebase-branch failure
  (`FirebaseAuthError: Decoding Firebase ID token failed`) are caught cleanly by
  `guarded()`'s error handler — no unhandled exceptions, no crashes, in production.
- **Current real state**: the Google Calendar Cloud Functions auth redesign is genuinely
  deployed and working for both issuer branches. Only the Firebase branch carries any real
  traffic today (no client sends Supabase tokens). Firebase remains completely otherwise
  unaffected — `googleOAuthClient.js`/`googleCalendarService.js`/`googleCalendarStore.js`
  and the actual Calendar OAuth/API logic were never touched by this redesign.

## Firebase -> Supabase migration — Phase 3 prep continued: key-rotation blocker + password-reset/login-migration flow built (2026-08-06)
- User instruction, explicit sequencing: "Do not deploy the Cloud Functions yet. First,
  let's rotate the SUPABASE_SERVICE_ROLE_KEY and update all local environment/configuration
  to use the new key. After that, implement the password-reset/login migration flow... Once
  those two items are complete and verified, we'll deploy the Functions and then perform
  manual QA before any production cutover." Mid-session the user also said "continue with
  the next stages when you're done - i need to leave the office" — interpreted as
  "keep implementing/verifying what's safely completable," not as permission to skip the
  explicit approval gates (deploy, real email send, key rotation itself) the same message
  had just laid out. None of those three were done this round.
- **Key rotation: genuinely blocked on the user, not something Queen Bee can do.**
  `SUPABASE_SERVICE_ROLE_KEY`'s only local copy is `supabase/.env` (gitignored) — confirmed
  via a repo-wide search that no other file holds the raw value (Cloud Functions aren't
  deployed yet, so no Secret Manager copy exists either). Rotating it requires the Supabase
  Dashboard (Settings → API → service_role → regenerate) or a Management API Personal
  Access Token, neither of which Queen Bee has. Told the user the exact dashboard steps and
  recommended they edit `supabase/.env` directly themselves rather than pasting the new
  value into chat (this exact key was already exposed in a transcript once before — see the
  "Supabase migration secrets exposed" KNOWN_ISSUES.md entry). **Not yet rotated as of this
  entry** — supabase/.env still holds the original key.
- **Real bug found while designing the reset flow**: `frontend/src/pages/
  ResetPassword.jsx` only recognized Firebase's `oobCode`/`token` URL *query* param.
  Supabase's recovery flow puts its tokens in the URL *hash fragment* instead, exchanged
  into a real session automatically by the Supabase client SDK
  (`detectSessionInUrl: true`) — the page would have shown "Invalid reset link" for every
  real Supabase reset email, even after `send-password-reset-emails.mjs` (below) succeeds.
  **Fixed**: the page now branches on `VITE_AUTH_BACKEND` — Firebase keeps its exact
  original `oobCode`/`token` check; Supabase mode waits for `getSession()`/the
  `PASSWORD_RECOVERY` auth event and gates the form on an actual established recovery
  session instead. `supabase` is now a plain static import in this file (safe regardless of
  backend, since `services/supabase/client.js`'s fail-fast is the lazy Proxy fixed earlier
  the same day — see the prior entry).
- **New `supabase/scripts/send-password-reset-emails.mjs`**: dry-run by default (matches
  every other script in this repo's convention), `--apply` sends real emails. Deliberately
  calls `supabase.auth.resetPasswordForEmail()` via the **anon-key** client — the exact
  same public, non-privileged method `frontend/src/services/supabase/auth.js`'s
  `requestPasswordReset()`/`ForgotPassword.jsx` will use for self-service resets post-
  cutover — rather than `auth.admin.generateLink()`, so there's only one code path to keep
  correct. Uses the service-role client only to *read* which users need an email
  (`public.users where legacy_firebase_uid is not null`), never to send. Supports
  `--email=` to scope to one user and `--redirect-to=` to override the default production
  URL. Added `SUPABASE_ANON_KEY` to `supabase/.env`/`.env.example` (same public/RLS-
  constrained value already in `frontend/.env`, not a new secret) since the script needs it.
- **Dry-run verified live**: correctly found the 1 real migrated user
  (`admin@connoisseurauto.co.za`, `legacy_firebase_uid=cPqQe8oWr5VO79fe6ZSMYa278wR2`) and
  reported it would send, without sending anything. **No real email has been sent** —
  deliberately not run with `--apply`, since (a) the key rotation is still pending per the
  user's explicit sequencing, and (b) sending a real email to a real inbox is exactly the
  kind of user-facing production action that should happen with the user present/able to
  confirm receipt, not autonomously while they're away from their desk.
- Verified: `frontend`: lint/typecheck/test/build all clean (both after the
  `ResetPassword.jsx` fix, and again in a forced `VITE_AUTH_BACKEND=supabase` test build —
  reverted immediately after, confirmed no crash, no regression). `supabase`: `node --check`
  on the new script, `npm test` 18/18 (unchanged — no test-covered logic in the new script
  itself, which is thin I/O over already-tested primitives).
- Cleaned up 1 more stray 0-byte artifact (`supabase/Postgres`, same recurring
  Ruflo/Claude-Flow hook pattern).
- **What remains, in the user's own stated order**: (1) user rotates
  `SUPABASE_SERVICE_ROLE_KEY` in the Supabase Dashboard and updates `supabase/.env`
  themselves (or tells Queen Bee the new value); (2) Queen Bee verifies the new key works
  (re-run `smoke-test.mjs`/`migrate:verify` against it) and confirms the old key is fully
  retired; (3) `--apply` the password-reset email for real, confirm receipt; (4) only then,
  with explicit approval, `firebase deploy --only functions`; (5) manual QA with the flag
  flipped in a local/staging build; (6) only then, with explicit approval, the actual
  production cutover. Firebase remains the live production backend throughout.

## Firebase -> Supabase migration — Phase 3 prep: Google Calendar auth redesign implemented + frontend flag wiring built (2026-08-06)
- User approved: "start on the Google Calendar auth redesign and continue with phase 3."
  Implemented the design from `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md` in full,
  plus the frontend flag-wiring from `PHASE2_CUTOVER_CHECKLIST.md` section 3. **Did NOT**
  deploy Cloud Functions, flip any production flag, or rotate the Supabase service_role
  key — all three still need their own separate explicit approval.
- **Confirmed the real Supabase JWT issuer** (design doc flagged this as unconfirmed):
  created a throwaway Supabase Auth test user, signed in, decoded the real session JWT —
  `iss = "https://cjvrquipmnoihksijful.supabase.co/auth/v1"`, `alg: ES256`. Test user
  deleted immediately after (cleanup confirmed, no error).
- **`functions/lib/supabaseAuth.js` (new)**: `isSupabaseIssuer()` + `verifySupabaseUser()`
  — verifies a Supabase JWT via `supabase.auth.getUser(token)`, then loads
  `role`/`effective_permissions`/`is_active` from Postgres `public.users` via a
  service-role client (RLS-bypassing, trusted server-side code), returning the exact same
  `{ uid, role, effectivePermissions }` shape `requireUser()` already returns. New Firebase
  Secret `SUPABASE_SERVICE_ROLE_KEY` (via `defineSecret`, bound in `functions/index.js`'s
  shared `SECRETS` array, same pattern as `GOOGLE_CALENDAR_CLIENT_ID/_SECRET`) — **not yet
  set in Secret Manager, not yet deployed**.
- **`functions/lib/auth.js`**: `requireUser()` now decodes (without verifying) the bearer
  token's `iss` claim to route to the Supabase branch above, or falls through to the
  original, completely unchanged Firebase branch. A malformed/unrecognized-issuer token
  still falls through to the Firebase branch and gets the same 401 as always. Referenced
  `supabaseAuth` via the module object (not destructured) specifically so tests can mock
  `isSupabaseIssuer`/`verifySupabaseUser` in place — matches the existing `admin`/`db`
  pattern already used in this file.
- **`functions/package.json`**: added `@supabase/supabase-js` (version aligned with
  `frontend`/`supabase`'s existing usage). `npm install` run, `package-lock.json` updated.
- **Verified, not just written**: `functions`: `node --check` on every changed/new file,
  `npm run lint` clean, **`npm test` 76/76 pass (was 63)** — 10 new tests in
  `test/supabaseAuth.test.js` (issuer matching, `getUser()` failure, profile-query error,
  missing/inactive profile, non-array `effective_permissions`, successful resolution) plus
  3 new tests in `test/auth.test.js` proving the actual routing behavior end-to-end: a
  Supabase-issued token really does skip `verifyIdToken` entirely and reach the Supabase
  branch, a Firebase-issued (or malformed) token really does skip `verifySupabaseUser`
  entirely and reach the unchanged Firebase branch. **Not deployed** — `firebase deploy
  --only functions` needs its own explicit approval per CLAUDE.md section 12, same as every
  prior deploy in this project. The design doc's recommendation to rotate
  `SUPABASE_SERVICE_ROLE_KEY` before using it in this new server-side dependency (it was
  pasted into a chat transcript once during Phase 0) has **not been done** — flagged as a
  pre-deploy prerequisite, not something Queen Bee can do itself (requires the Supabase
  dashboard).
- **Frontend flag wiring (`PHASE2_CUTOVER_CHECKLIST.md` section 3), built with a genuinely
  zero-blast-radius design**: `VITE_AUTH_BACKEND` (`"firebase"` default | `"supabase"`)
  selects the backend inside `frontend/src/lib/AuthContext.jsx` and
  `frontend/src/api/apiClient.js` themselves — **none of the ~13+21 files that already
  import `useAuth`/`apiClient` needed any change**, closing the exact blast-radius concern
  `PHASE2_CUTOVER_CHECKLIST.md` had flagged repeatedly as the reason this wiring needed
  care.
  - `AuthContext.jsx`: exported `AuthProvider`/`useAuth` unchanged in name and shape. The
    Firebase implementation (renamed internally to `FirebaseAuthProviderImpl`, otherwise
    byte-identical) stays the default. The Supabase branch is `React.lazy()`-loaded (via
    dynamic `import()`, wrapped in `Suspense`) into a new bridge component
    (`frontend/src/services/supabase/SupabaseAuthBridge.jsx`, new file) that writes into
    the SAME shared `AuthContext` React context object this file already exports — not a
    separate context — so `useAuth()` works identically regardless of backend.
    `SupabaseAuthContext.jsx`'s state logic was extracted into a reusable
    `useSupabaseAuthState()` hook (zero behavior change for its own pre-existing
    `SupabaseAuthProvider`/`useSupabaseAuth` exports) so both the bridge and the standalone
    context share one implementation.
  - `apiClient.js`: exported `apiClient` binding unchanged; internally is
    `firebaseApiClient` (renamed from the old direct export, otherwise untouched) or
    `supabaseApiClient` (already existed, unwired) picked by the same flag, via a plain
    static import (see the two real bugs found+fixed below for why not a dynamic import).
  - `functionsClient.js`: `getBearerToken()` attaches a Firebase ID token (default) or a
    Supabase session's `access_token` (flag on) — Google Calendar itself stays on Firebase
    Cloud Functions regardless (unchanged), only WHICH token gets attached changes. Uses a
    dynamic `import()` for the Supabase branch (safe here — not top-level, see below).
- **Two real bugs found and fixed via actually testing the build, not just writing code**:
  1. First attempt used a **top-level** `await import(...)` in `apiClient.js` for lazy
     loading — `npm run build` failed: "Top-level await is not available in the configured
     target environment" (this project's `vite.config.js` doesn't set an esbuild target
     that supports it). Would have been caught immediately by anyone running a real build,
     but wasn't something reasoning about the code alone would surface.
  2. Root-caused *why* laziness was wanted in the first place:
     `frontend/src/services/supabase/client.js` throws **at module-import time** if
     `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing, and
     `frontend/.env.production` didn't have them — a naive static import of the Supabase
     path into always-loaded code would have crashed the default (`firebase`) production
     build the moment env vars were ever missing in some environment, even though the flag
     defaults off. Fixed at the actual root: `client.js` now defers that check into a lazy
     `Proxy` (constructed only on first real `supabase.<method>` call, not at import time) —
     zero change needed to any of its 5 existing consumers, all of which already do
     `supabase.<method>(...)` inline. This let `apiClient.js` switch to a plain, simple
     **static** import (no top-level await, no lazy machinery needed there at all) with
     zero risk to the default path.
  - Also added real, non-secret Supabase config (`VITE_SUPABASE_URL`, the public/RLS-
    constrained anon key, `VITE_AUTH_BACKEND=firebase`) to `frontend/.env.production`
    (committed — the anon key is designed to be public, same posture as the already-
    committed Firebase web config) and documented `VITE_AUTH_BACKEND` in `.env.example`.
- **Verified via two real production builds, not just unit tests**: built once with
  `VITE_AUTH_BACKEND=firebase` (the committed default) — confirmed via `grep` on the output
  bundle that **zero** Supabase-related code (`createClient`, `supabaseApiClient`,
  `SupabaseAuthBridge`) exists in it at all; the ternary branch was fully dead-code-
  eliminated by Vite/esbuild's constant-folding of `import.meta.env.VITE_AUTH_BACKEND` at
  build time. Rebuilt a second time with `VITE_AUTH_BACKEND=supabase` forced (local-only
  test, reverted immediately after) — confirmed the build succeeds and the Supabase code
  path compiles correctly with the fixes above. `frontend`: `npm run lint`/`typecheck`/
  `test` (2/2) all clean throughout, both real production builds succeeded (exit 0).
- **What was explicitly NOT done, still needs its own approval**: `firebase deploy --only
  functions` (the redesigned `requireUser` is written and tested locally only); rotating
  `SUPABASE_SERVICE_ROLE_KEY` before first production use (recommended by the design doc,
  requires the Supabase dashboard); any live, manual, end-to-end click-through of the app
  with the flag actually flipped to `supabase` against a real Supabase-authenticated
  session (blocked anyway — the 1 migrated user still has no usable password, see
  KNOWN_ISSUES.md's still-outstanding password-reset-email script); flipping
  `VITE_AUTH_BACKEND` to `supabase` in the real, deployed `frontend/.env.production` (the
  actual cutover moment, `PHASE2_CUTOVER_CHECKLIST.md` section 4 — needs its own explicit
  approval, unaffected by anything in this session).

## Firebase -> Supabase migration — Phase 2 complete: users + storage phases run, full relationship/permission verification (2026-08-06)
- User confirmed `0013` had been applied (verified live via a direct column probe on
  `knowledge_notes.content`/`note_type` — both queryable) and explicitly approved running
  the `users` phase followed immediately by the `storage` phase ("start with the users
  phase now and continue with the next phase too - get it done").
- **Pre-flight checks before writing** (this machine has real `supabase/.env` +
  `GOOGLE_APPLICATION_CREDENTIALS` — same machine as the 2026-08-04 session, not a fresh
  clone): re-ran the read-only `verify` phase first — all 10 collections still matched
  Firestore exactly, confirming no drift since 2026-08-04. Checked `supabase.auth.admin.
  listUsers()` before writing — 0 existing Auth users, so no duplicate-email risk.
- **Users phase — `--apply --phases=users`**: 1 real Firestore user
  (`admin@connoisseurauto.co.za`, role `admin`, uid `cPqQe8oWr5VO79fe6ZSMYa278wR2`)
  migrated. Verified live (not just trusting the script's silent-success output): the
  Supabase Auth user was created (`auth.admin.listUsers()` shows it, `user_metadata.
  migrated_from_firebase_uid` set correctly), and the `public.users` profile row has the
  correct `role`, `is_active: true`, the full real `effective_permissions` array (69
  entries, matches Firestore verbatim), `preferences.show_google_calendar: true`, and
  `legacy_firebase_uid` set. `knowledge_notes.created_by` relink: 0/0 (correct — 0 real
  notes exist). Migrated user has no usable password (Firebase hashes can't be imported) —
  needs a password-reset-email step before real login; that delivery script still doesn't
  exist (see `PHASE2_CUTOVER_CHECKLIST.md` section 1 — not built this session, not needed
  yet since nothing is live on Supabase).
- **Storage phase — `--apply --phases=storage`**: genuine no-op, confirmed both before and
  after — `knowledge_media`/`knowledge_documents` both have 0 real Firestore docs (dry-run
  and apply both showed `0 docs`/`copied 0, skipped 0`). No files exist yet to copy.
- **Found and investigated a real-looking gap that turned out to be a non-issue**: while
  reviewing what the storage phase does and does not cover, found `service_records.photos`
  and `job_cards.arrival_photos` are real fields read by `MachineDetail.jsx`/
  `ServiceRecords.jsx`/`JobCardDetail.jsx` but have **no Postgres columns at all** and are
  not in `entityMappings.mjs`. Investigated whether this caused real data loss during the
  earlier entities/relink migration: live Firestore query confirmed **zero** real
  `service_records`/`job_cards` docs have either field populated. Traced why: `frontend/
  src/components/LogServiceModal.jsx` uploads photos into local `photos` state and displays
  them for review, but `handleSubmit`'s `ServiceRecord.create()` payload never actually
  includes `photos` — a pre-existing frontend bug unrelated to this migration, not
  something introduced or fixed here. `job_cards.arrival_photos` is read-only dead code in
  `JobCardDetail.jsx` with no writer anywhere in the codebase (`BookIn.jsx` writes uploaded
  photo URLs into `technician_notes` as text instead). **No data loss, no fix applied** —
  flagged in KNOWN_ISSUES.md as a pre-existing frontend gap, out of migration scope unless
  the user asks to fix the upload feature itself.
- **Full post-migration verification, independent of the script's own claims**:
  - `verify` phase (read-only): all 10 collections match Firestore counts exactly.
  - Direct FK-orphan check across every relationship: `machines.client_id` (6/6, 0
    orphans), `job_cards.client_id`/`machine_id` (4/4, 0 orphans each), `service_records.
    machine_id` (7/7, 0 orphans), `job_card_lines.job_card_id` (3/3, 0 orphans).
  - `public.users`: exactly 1 profile row, no duplicates, matches the 1 real Firestore user.
  - `supabase`: `npm test` 18/18 pass throughout (no code changes this session, only
    execution).
- **Current real state of the live Supabase project**: all real Firestore business data
  (clients, machines, service_records, job_cards, job_card_lines, knowledge_machines, the 1
  real user) is now fully migrated, cross-linked, and content-verified in Postgres. The 4
  knowledge_* sub-collections remain correctly empty (0 real source docs). This is Phase 2
  of the user's plan (Clients/Machines/Job Cards/Service Records/Knowledge Base/Users)
  **complete**. Firebase remains fully untouched and is still the sole live-serving
  backend — no frontend/Android/Functions code was changed.
- **Not done / explicitly next**: Phase 3 (run both systems side-by-side — requires wiring
  `SupabaseAuthProvider`/`supabaseApiClient.js` behind a flag, per `PHASE2_CUTOVER_
  CHECKLIST.md` section 3, which still lists the Google Calendar auth redesign
  (`GOOGLE_CALENDAR_AUTH_REDESIGN.md`) as an unimplemented prerequisite). Also still open:
  password-reset-email script, `sites`/generic-bucket/Android-timing/staging-target
  decisions in the checklist's section 1. None of these were touched this session — this
  session was scoped to finishing Phase 2's data migration only.

## Firebase -> Supabase migration — Google Calendar authentication redesign (design only, 2026-08-05)
- User instruction: treat Google Calendar's Firebase-Auth dependency (found earlier the
  same session, see the "Phase 2 prep continued" entry below) as a first-class migration
  task — do not assume Firebase Authentication remains available after the Supabase
  cutover; design the integration to keep using the Google Calendar API while
  authenticating requests independently of Firebase Auth; continue documenting the
  architecture and migration steps.
- Wrote `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md`: recommends redesigning
  `functions/lib/auth.js`'s `requireUser()` to branch on the bearer token's `iss` (issuer)
  claim — Firebase tokens keep the existing verification path unchanged; Supabase tokens
  get a new path (`supabase.auth.getUser(token)` + a service-role Postgres permission
  lookup) returning the identical return shape, so none of the 8 functions' call sites in
  `functions/index.js` change. This "issuer-routed dual verification" design means the
  frontend's eventual `VITE_AUTH_BACKEND` flag flip and a Cloud Functions redeploy never
  need to be coordinated as one atomic event. Verified the exact scope by reading the real
  code first, not assuming: confirmed via `functions/index.js` that 7 of 8 functions
  actually call `requireUser`/check permissions (`calendar.google.connect/view/
  calendars.select/disconnect` — exact keys, not guessed) and that the 8th
  (`googleCalendarCallback`) is browser-navigated, carries no bearer token, and is secured
  by the OAuth `state` parameter instead — it needs no changes at all for this redesign.
- Cross-referenced the new doc from `docs/migration/FIREBASE_DEPENDENCIES.md` (section 2)
  and added it as a new blocking prerequisite step (3.0) in
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`, gating step 3.1's `SupabaseAuthProvider`
  wiring.
- **Design only — nothing implemented.** No changes to `functions/` or `frontend/` code
  this session. Implementation (new `@supabase/supabase-js` dependency in `functions/`, new
  `SUPABASE_SERVICE_ROLE_KEY` Firebase Secret, `functions/lib/auth.js`/`functionsClient.js`
  code changes, a `firebase deploy --only functions`) is listed as its own ordered,
  approval-tagged step list in the design doc — each step (especially the deploy) still
  needs its own explicit go-ahead per CLAUDE.md section 12 when the time comes.
- User separately confirmed they will apply `supabase/migrations/
  0013_knowledge_subcollections_real_fields.sql` via the SQL Editor before the next
  data-migration session, and asked to push all pending work to git before leaving for the
  day (explicit approval given for the push itself — see git log for the resulting commit).

## Firebase -> Supabase migration — Phase 2 prep continued: knowledge_* schema/storage-copy fix, Firebase dependency audit, checklist refresh (2026-08-05)
- User confirmed the repo/Ruflo tooling cleanup from earlier this session was complete and
  gave explicit scoped instructions: continue Supabase prep, build/verify remaining
  service-layer functionality, document every remaining Firebase dependency, improve
  tests/verification scripts, prepare cutover/rollback docs — explicitly NOT to migrate
  Firestore data, touch Firebase Admin credentials, wire the frontend to Supabase, switch
  `AuthContext`, touch Android, or remove Firebase without separate approval. No live
  Supabase writes were made this session (no `--apply`, no `smoke-test.mjs` run) — all work
  was code/schema-file/documentation only.
- **Closed the knowledge_* sub-collection schema gap deferred on 2026-08-04** (see
  KNOWN_ISSUES.md/DECISIONS.md 2026-08-05 entries for full detail): new
  `supabase/migrations/0013_knowledge_subcollections_real_fields.sql` corrects
  `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents` to
  their real Firestore field names (`content` not `body`, `service_code` not `code`,
  `file_url` not `storage_path`, plus previously-uncaptured `note_type`/`function_name`/
  `original_filename`/`title`). Updated `entityMappings.mjs`'s mapper and
  `supabaseApiClient.js`'s reveal handler to match. **Not yet applied to the real
  project** — needs the user via the SQL Editor, same as every prior migration; safe to
  apply any time before real rows exist in these four tables (still true as of 2026-08-05).
- **Found and fixed a second, independent bug in the same area**: the data-migration
  script's Phase D (storage copy) read the same wrong field name directly off raw Firestore
  docs, bypassing the mapper entirely — the schema fix alone would not have caught it. Even
  with the name corrected, the real field is a Firebase Storage download URL, not a bare
  object path the Admin SDK can use. Fixed via a new unit-tested helper
  `supabase/scripts/lib/firebaseStorageUrl.mjs` (`extractFirebaseStoragePath()`, 6/6 tests)
  and rewrote Phase D to use it, plus added a new step that re-points each migrated row's
  Postgres `file_url` to a fresh Supabase signed URL after a successful copy (previously it
  copied the file but left Postgres pointing at the stale Firebase URL). Untested end-to-end
  against a real file (no real documents exist in either source collection).
- **Wrote `docs/migration/FIREBASE_DEPENDENCIES.md`**: a complete, categorized inventory of
  every Firebase touchpoint — frontend (12 core files + 31 total consumer files, effectively
  the whole app), Cloud Functions (8 functions, Google Calendar only, deliberately staying
  on Firebase), `firestore.rules`, Android (`Core.kt`, `GoogleCalendarRepository.kt`,
  explicitly out of scope this phase), and confirmed Laravel has no real Firebase
  dependency. **Surfaced a real, previously undocumented gap**: Google Calendar's callable
  functions authenticate via a Firebase ID token (`functionsClient.js` + all 8 functions'
  `requireUser` guard) — if/when `AuthContext` cuts over to Supabase, this breaks unless
  redesigned, and nothing in the existing runbook/checklist accounted for it. Added to
  `PHASE2_CUTOVER_CHECKLIST.md` section 1 as a new decision item, called out as a blocker
  for the `SupabaseAuthProvider` wiring step specifically.
- **Refreshed `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`**: updated its stale
  (2026-08-03) status header to reflect the entities/relink completion and `0008`-`0013`
  migrations; marked data-migration steps 1-6 as done with dates; added the Google Calendar
  auth-token gap; corrected the "staging target" item to note `CAPDATABASE` now holds real
  migrated data, not an empty test project; verified (by reading `smoke-test.mjs` directly,
  not assuming) that its cleanup logic only ever deletes rows by the exact `id` it captured
  from its own inserts — safe to re-run alongside real data, not a blanket wipe.
- Verified: `supabase`: `node --check` on all 4 changed/new script files, `npm test` 18/18
  (was 12, +6 new for the storage-URL helper). `frontend`: `npm run lint`/`typecheck`/
  `test`/`build` all clean (build succeeds via `.env.production`'s real Firebase keys; the
  plain `.env` on this machine currently lacks Firebase dev keys — a local `npm run dev`
  gap, not a regression, not fixed since it would need real credentials).
- Repo hygiene: removed 2 more stray 0-byte Ruflo/Claude-Flow tooling artifacts (`({,-`,
  `updatePassword(newPassword)`) matching the same recurring pattern noted in prior
  sessions — not application code.
- Did NOT: run `--apply` or any live write against the real Supabase project; run
  `smoke-test.mjs` live; touch `AuthContext.jsx`/`apiClient.js`/`App.jsx`; touch Android;
  remove any Firebase code; request or handle Firebase Admin credentials.

## Firebase -> Supabase migration — entities + relink phases complete, content-verified (2026-08-04)
- User confirmed `0012` applied "100% success." Verified live via a throwaway probe
  insert (immediately deleted) that `machines.client_id` is now nullable before retrying
  anything.
- Retried `--apply --phases=entities,relink,verify --only=machines,service_records,
  job_card_lines,knowledge_machines` (scoped deliberately to avoid re-inserting the
  already-successful `clients`/`job_cards` from the prior partial run). **All 4 succeeded
  this time**: machines 6/6, service_records 7/7, job_card_lines 3/3, knowledge_machines
  3/3. The relink pass also self-healed `job_cards.machine_id` (0/4 the first time,
  since `machines` didn't exist yet; 4/4 now that it does).
- Ran a full `--phases=verify`: **all 10 collections match Firestore counts exactly**,
  including the 4 always-empty knowledge_* sub-collections (0=0, correctly not a
  mismatch).
- Went one step further than count-matching: pulled real rows back from Postgres by
  `legacy_firestore_id` and checked actual content, not just counts —
  a real (non-test) machine's `client_id` traced correctly to its real client
  (`company_name: "abc 123"`); a real service record's `work_performed` text matches the
  original Firestore doc verbatim; a real job card's `client_id` AND `machine_id` both
  correctly relinked, with `machine_id` matching the exact machine verified moments
  earlier. This is genuine content verification, not just row-count matching.
- **Current real state of the live Supabase project**: `clients`, `machines`,
  `service_records`, `job_cards`, `job_card_lines`, `knowledge_machines` all fully
  migrated and correctly cross-linked. `knowledge_notes`/`knowledge_service_codes`/
  `knowledge_media`/`knowledge_documents` still correctly empty (no real Firestore data
  exists for them — not a gap). `users` phase and `storage` phase have NOT been run
  (each needs its own separate go-ahead per the runbook — not attempted this round).
  Firebase remains completely unmodified and is still the only live-serving backend;
  nothing in `frontend/`/`mobile-android/` has been touched.
- User is moving to work from a different machine ("home") next. **Important portability
  note, not yet resolved**: `supabase/.env` (Supabase keys) and the Firebase
  service-account JSON key (`GOOGLE_APPLICATION_CREDENTIALS`, currently at
  `C:\Users\Gerhard\Documents\cap database firebase files\...json` on this machine) are
  both gitignored/local-only by design and will NOT travel via `git clone`/`git pull` to
  the home machine. Continuing the migration script from home requires recreating both
  there (same values) before any further `--apply`/`--phases=verify` run works. Purely
  documentation/code work (which is everything else in this repo) is unaffected and
  works immediately after a clone.

## Firebase -> Supabase migration — first real --apply, partial success, one more real bug found+fixed (2026-08-04)
- User (about to step away) said "continue with the phases, I want the database to work
  soon" and separately confirmed `0009`-`0011` applied "100% success." Verified live
  (read-only) that all three migrations' new columns exist and are queryable before
  attempting any write.
- Ran the first-ever `--apply --phases=entities,relink,verify` against the real project.
  **Note**: the harness's own permission classifier blocked this exact command (and even
  the read-only `verify` phase) once earlier in the session — did not attempt to route
  around it, reported it to the user, and it was not blocked on this later attempt.
- **Result: partial success, verified via the read-only `verify` phase, not just the
  script's own claims:**
  - `clients`: 6/6 inserted. `job_cards`: 4/4 inserted, `client_id` FK relinked to the
    real new client uuids for all 4. Both confirmed Firestore=Postgres via `verify`.
  - `machines` (0/6), `service_records` (0/7), `job_card_lines` (0/3), `knowledge_machines`
    (0/3): **every insert failed** with a Postgres `NOT NULL constraint` violation.
    Confirmed via `verify` that all four tables are still at 0 rows — nothing partial or
    corrupt was written, the inserts simply never committed.
- **Root cause, a real design bug**: the script's two-phase pattern (Phase A inserts
  entities with FK columns unset, Phase B `UPDATE`s them afterward via
  `legacy_firestore_id`) only works if the FK column is nullable.
  `job_cards.client_id`/`machine_id` already were (why job_cards succeeded first try);
  `machines.client_id`, `service_records.machine_id`, `job_card_lines.job_card_id` were
  not. Separately, `knowledge_machines.name` (the old vestigial pre-`0011` column) is
  still `NOT NULL`, but the `0011`-rewritten mapper no longer supplies it at all.
- Fixed via new `supabase/migrations/0012_nullable_fks_for_two_phase_insert.sql` — drops
  `NOT NULL` on those 4 columns (does not weaken the FK `references` constraint itself,
  only the nullability, matching the existing `job_cards` precedent). **Not yet applied**
  — needs the user via the SQL Editor, same as every prior migration.
- Once `0012` is applied, re-running `--apply --phases=entities,relink,verify` should
  complete `machines`/`service_records`/`job_card_lines`/`knowledge_machines` — safe to
  re-run since `clients`/`job_cards` already succeeded and re-running only affects the 4
  tables still at 0 rows (no duplicate-insert risk for the two that already worked, since
  those aren't re-attempted... **verify this assumption before re-running**: the script
  does not currently check "already migrated" before inserting -- if `--only` isn't used
  to scope the retry to just the 4 failed tables, re-running the full entities phase would
  attempt to re-insert clients/job_cards too and likely hit unique-constraint errors on
  `legacy_firestore_id`. Use `--only=machines,service_records,job_card_lines,
  knowledge_machines` for the retry, not a bare re-run of everything.
- Still not done: `users`/`storage` phases (need separate go-ahead per the runbook, not
  attempted this round), any frontend wiring, any Firebase changes.

## Firebase -> Supabase migration — full remaining-collections spot-check found 4 more real gaps (2026-08-04)
- User chose "finish spot-checking the other 4 collections" over going straight to
  `--apply`. Good call: dumped every real doc (not just the dry-run's one-sample-per-
  collection summary) in `clients`/`machines`/`service_records`/`knowledge_machines` via
  read-only temp scripts (deleted after use, no writes) and diffed the union of real field
  names against what the mapper/schema actually capture.
- **`clients`: clean, no gap.** Every field in the schema matches every field on all 6 real
  docs exactly.
- **`machines`: missing `warranty_expiry`.** Real, on all 6 docs (sometimes `""`), used by
  `MachineForm.jsx`/`MachineDetail.jsx` (warranty-active/expiring logic). Fixed via
  `supabase/migrations/0009_machines_warranty_expiry.sql`.
- **`service_records`: missing `service_date`/`work_performed`/`findings`.** All three
  real, confirmed via both actual creation forms (`LogServiceModal.jsx`, `ServiceForm.jsx`)
  — `service_date` is required (submit disabled without it) in both. Fixed via
  `supabase/migrations/0010_service_records_missing_fields.sql`.
- **`knowledge_machines`: the schema was completely wrong**, not just missing a field.
  `0001_initial_schema.sql` had `name`/`model`/`description`; the real field set (confirmed
  on all 3 live docs AND `KnowledgeMachineForm.jsx`/`KnowledgeMachineDetail.jsx`) is
  `manufacturer`/`model_name`/`variant`/`product_code`/`category`/`summary`/
  `supported_refrigerants` (array)/`technical_specifications` (map)/`main_functions`
  (array) — no overlap at all with the old columns. Migrating against the old schema would
  have silently blanked every real knowledge-base entry. Fixed via
  `supabase/migrations/0011_knowledge_machines_real_fields.sql` (adds the real columns,
  does NOT drop the old vestigial ones — a separate, more invasive decision left for
  later) and a full rewrite of that mapper entry.
- **Separately, and more severe in a different way: found a latent bug that would have
  hard-failed `--apply` regardless of the above.** `?? null` does not catch empty strings,
  and date-typed fields come through Firestore as `""` (not absent) when a date `<input>`
  is left blank — confirmed live: 4 of 6 real `machines` docs have
  `installation_date: ""`. Inserting `""` into a Postgres `date` column errors. Fixed
  defensively across every date field in the mapper (not just the one proven broken today)
  via a new `toDateOrNull()` helper in `entityMappings.mjs`.
- Added tests for every fix (`entityMappings.test.mjs` now 10/10, was 8/8) and updated two
  existing tests whose fixtures assumed the old (wrong) `knowledge_machines` shape.
- Verified: full dry run re-run against real Firestore data after all fixes —
  `knowledge_machines` sample now shows real fields, all date fields show `null` instead
  of `""` where blank, `job_cards` still correct from the earlier fix. `npm test` 10/10,
  `node --check` on both changed files clean.
- **Migrations `0009`/`0010`/`0011` have NOT been applied to the real project yet** —
  needs the user to run them via the SQL Editor, same as `0001`-`0008`.
- Not investigated further this round (flagged, not fixed, since 0 real rows exist for any
  of them right now — no data-loss risk yet): while checking `knowledge_machines`,
  `KnowledgeMachineDetail.jsx` revealed real field-name mismatches in the 4 sub-collections
  too — `knowledge_notes` uses `content`, not `body`; `knowledge_media`/
  `knowledge_documents` store an uploaded `file_url` (a full download URL from
  `UploadFile`), not a `storage_path`, plus an `original_filename` the schema doesn't
  capture; `knowledge_service_codes` has a `function_name` field the schema doesn't have
  at all. See KNOWN_ISSUES.md — fix before these tables ever hold real data, not urgent
  today.

## Firebase -> Supabase migration — first live dry-run, found+fixed a real job_cards schema gap (2026-08-04)
- User provided Firebase Admin credentials: a service-account JSON key at
  `C:\Users\Gerhard\Documents\cap database firebase files\capdatabasefb2-firebase-adminsdk-fbsvc-2193141cfc.json`
  (verified structurally — `type`/`project_id`/`client_email` checked, `private_key`
  presence confirmed — without ever printing the key itself into this session). Left in
  place outside the repo on purpose; referenced via `GOOGLE_APPLICATION_CREDENTIALS` in
  `supabase/.env` (gitignored). `migrate-firestore-to-postgres.mjs` updated to copy that
  var into `process.env` from the `.env` file if not already exported, since
  google-auth-library reads it directly from `process.env`, not from anything passed to
  `admin.initializeApp()`.
- Ran the **first-ever dry run** of the migration script (all 5 phases, read-only,
  writes nothing) against the real, live Firestore data. Real counts: 6 clients, 6
  machines, 7 service_records, 4 job_cards, 3 job_card_lines, 3 knowledge_machines, 0 in
  the other 4 knowledge_* collections, 1 user (`admin@connoisseurauto.co.za`, role
  `admin`). `verify` phase correctly reported mismatches against the still-empty Postgres
  tables (expected — nothing written yet, this is the verify phase working correctly).
- Per the checklist's "spot-check a handful of real records" step, inspected two flagged
  records directly against raw Firestore (temp read-only scripts, deleted after use, no
  writes): one `job_card_lines` doc came back with `line_total: 0` in the dry-run
  sample. Direct inspection showed the raw Firestore doc has **no** `line_type`/
  `line_total` field at all — confirmed via `frontend/src/pages/JobCardDetail.jsx`'s
  `handleAddLine()` that the real UI has always written both on every create, so this is
  an old/synthetic record (job number prefixed `JOB-CODEX-E2E-...`, i.e. from an automated
  test harness), not a live schema gap — Postgres's existing column defaults
  (`'Labour'`/`0` from `0001`) handle it correctly. No fix needed here.
- **Found a real, universal gap while checking the parent job card**: `job_cards` docs
  have `job_number` and `date_received` fields that `0001_initial_schema.sql` never gave
  Postgres columns for. Confirmed via a direct read of all 4 real `job_cards` docs that
  every one has both fields populated (not test-only), and via grep that they're actively
  read/written by `BookIn.jsx`, `JobCardDetail.jsx`, `Jobs.jsx`, `InvoiceQueue.jsx`, and
  `MachineDetail.jsx` (including `BookIn.jsx`'s default sort `"-date_received"`). Without
  this fix, every real job card would have silently lost its job number and received date
  during migration. Fixed via new `supabase/migrations/0008_job_cards_missing_fields.sql`
  (adds both columns + indexes) and updated `supabase/scripts/lib/entityMappings.mjs`'s
  `job_cards` mapper to include them. Added a new unit test covering this in
  `entityMappings.test.mjs` (8/8 pass now, was 7/7).
- Verified: `cd supabase && npm test` 8/8 pass; `node --check` on all 3 scripts; re-ran
  the dry run scoped to `job_cards` after the fix — `job_number`/`date_received` now
  appear correctly in the mapped sample row. `frontend` lint/typecheck unaffected (no
  frontend files touched this round).
- **`0008` has NOT been applied to the real Supabase project yet** — needs the user to
  run it via the SQL Editor, same as `0001`-`0007`, before any real `--apply` of the
  `job_cards` phase.
- Still did NOT: run `--apply` (still needs its own explicit go-ahead per the runbook);
  touch `frontend/`/`AuthContext.jsx`/`apiClient.js`/`App.jsx`; touch Android.

## Firebase -> Supabase migration — pulled overnight work, verified, fixed a private-bucket URL bug (2026-08-04)
- Pulled commit `009ad93` from `origin/main` (work done on another clone overnight):
  migrations `0006`/`0007` (both confirmed applied to the real project), live smoke test
  18/18 passing across 4 permission namespaces, `frontend/src/api/supabaseApiClient.js`
  (unwired), `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`, an expanded (still unexecuted)
  migration script with a unit-tested `entityMappings.mjs` and a read-only `verify` phase.
- Did not take the commit message/memory notes at face value — re-verified independently
  on this machine (which has real `frontend/.env`/`supabase/.env`, unlike the clone that
  produced this commit, closing a gap it had flagged): `frontend` lint/typecheck/build/
  test all clean; `supabase` deps install, its new unit tests pass (7/7), all 3 scripts
  `node --check` clean; read `0006`/`0007` SQL directly and confirmed both are sound (the
  `0007` trigger fix doesn't open an anonymous-escalation path, since RLS's own `USING`
  clause already blocks unauthenticated updates before the trigger runs).
- **Found and fixed a real bug** reviewing `supabaseApiClient.js`:
  `integrations.Core.UploadFile` called `getPublicUrl()` on the `documents` bucket, but
  `0004_storage_buckets.sql` makes every bucket private (`public: false`) — that URL
  shape 400/403s on a private bucket. Fixed to use `getSignedUrl()` (7-day expiry)
  instead, matching every other private-bucket read path. Flagged a related but separate
  design gap inline (not fixed, no caller exists yet to need it): a signed URL expires,
  unlike Firebase's effectively-permanent `getDownloadURL()` token — whoever wires this
  route to a real feature should re-sign on read rather than persist `file_url` long-term.
  Verified via `frontend` lint/typecheck/build/test after the fix.
- Repo hygiene: same recurring Ruflo/Claude-Flow tooling-artifact pattern noted before
  (`supabase/.claude/` duplicate cache dir, `supabase/updatePassword(newPassword)` —
  lifted verbatim from a code comment just written) — removed both, not application code.
- Still blocked exactly as before: migration script not executed (Firebase Admin
  credentials still not provided), `0001`-`0007` not touched further, checklist's open
  `[decision]` items not yet resolved by the user.

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
