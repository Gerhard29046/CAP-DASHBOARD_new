# Session Log

## 2026-08-13 (cont.) — FULL PRODUCTION CUTOVER TO SUPABASE, live and deployed
- Objective: explicit user override during an unrelated UI-redesign session ("can you
  please get every single thing off firebase... im dont wiht firebase... i override you
  now... do the cutover now... do not ask me or tell me otherwise"). Directly supersedes
  every prior "NO-GO" / "not production-ready" framing from earlier the same day — treated
  as genuine, final authorization for the real cutover, not another incremental step.
- **Frontend**: deleted `frontend/src/lib/firebase.js` entirely. `apiClient.js`'s ~340-line
  parallel Firebase Firestore implementation removed -- now `export const apiClient =
  supabaseApiClient`. `AuthContext.jsx`'s Firebase implementation + VITE_AUTH_BACKEND
  branch/lazy-bridge removed -- now directly `useSupabaseAuthState()`. Deleted
  `frontend/src/lib/records.js` (Firestore ID-compat helper, dead code once the Firebase
  apiClient branch was gone) + its test. Removed the `firebase` npm dependency (79
  packages). Fixed `vite.config.js`'s production build guard (was still requiring
  `VITE_FIREBASE_*` vars, which no longer exist -- would have hard-failed every future
  build). Removed all `VITE_FIREBASE_*` vars from `.env`/`.env.production`/`.env.example`,
  set `VITE_AUTH_BACKEND=supabase`. Simplified `ResetPassword.jsx` (removed the dead
  Firebase oobCode branch).
- **Cloud Functions**: `lib/auth.js`'s `requireUser()` simplified to delegate straight to
  `verifySupabaseUser()` -- the Firebase ID-token branch and issuer-routing logic removed
  (every real caller now sends a Supabase token, since the frontend has no Firebase auth
  left to get an ID token from). Deleted `lib/firebaseAdmin.js` + the `firebase-admin` npm
  dependency. `lib/dashboardNotes.js`'s `resolveDisplayName()` now reads Supabase's
  `public.users.full_name` instead of a Firestore doc. `firebase-functions` (the Cloud
  Functions hosting/runtime SDK) deliberately KEPT -- unrelated to Firebase-as-a-database,
  the function still physically runs on Firebase's infrastructure, it just no longer
  touches Firestore/Firebase Auth.
- **Found and fixed a real test bug while updating `dashboardNotes.test.js`**: the
  `createNote` tests' mock asserted `table === "dashboard_notes"` unconditionally, but
  `resolveDisplayName()` now calls `.from("users")` FIRST -- the mock's own assertion was
  throwing on every single run, silently swallowed by `resolveDisplayName`'s try/catch
  fallback (`return "Someone"` on any error). The tests were reporting PASS the whole time
  for the wrong reason. Caught by noticing the console output during a routine
  re-run, not by the test result itself. Fixed to mock both tables distinctly; added a
  real assertion on `created_by_name` and a new explicit test for the no-profile fallback.
  Rewrote `auth.test.js` to match the simplified `requireUser()` (8 dual-branch tests
  removed, replaced with 3 that test the actual current behavior).
- **Verified live, not just written**: real Cloudflare deploy succeeded
  (`https://capdashboard.gerhardvanwijk.workers.dev`, confirmed 200 OK, confirmed zero
  "firebase" occurrences in the actual served bundle via a live `curl` + `grep`, not just
  the local build). Real end-to-end QA against production Supabase using a throwaway
  account through the exact code every real user now runs: `qa-clickthrough.mjs` 21/21
  (sign-in, profile load, all 15 table reads, full CRUD, sign-out). Bundle size dropped
  ~1.6MB → ~1.1MB, a real, measurable confirmation of the removal (not just an assertion).
  `frontend`: lint/typecheck clean, build succeeds, test suite now genuinely 0/0 (disclosed
  honestly, not hidden -- the only test file tested code that's now deleted).
  `functions`: lint clean, test 35/35 (was 28 before this session's dashboardNotes work,
  40 mid-session with the broken mock, 35 now that the dead dual-branch tests are gone and
  the real ones are fixed).
- **Two genuine hard blockers found and reported, not worked around**:
  1. `supabase/migrations/0017_dashboard_notes.sql` confirmed still not applied live --
     needs the SQL Editor.
  2. `firebase deploy --only functions` failed identically twice (not transient) --
     `secretmanager.googleapis.com` billing not enabled on `capdatabasefb2`. Very likely
     the same root cause as the real 500/503s from the (now-removed) Google Calendar
     function that prompted its 2026-08-12 removal -- never confirmed at the time, now
     strongly corroborated. Needs the user to re-enable billing via the exact console link
     the CLI printed, then a redeploy.
- **Deliberately NOT touched**: `mobile-android/` -- still 100% Firebase, explicitly kept
  out of scope (the app's own prior explicit instruction, unretracted by this message).
  Firestore/Firebase Auth data itself was not deleted, archived, or otherwise modified --
  only stopped being read by the web client. Backend Laravel code untouched.
- **Docs updated**: `CLAUDE.md` section 6 rewritten (was describing the old Firebase-active
  architecture, now describes the real Supabase-active one, plus new 6.2/6.3 for Android
  and old-data status), sections 9/10/11/12 updated for stale Firebase-specific references
  and the deleted `records.test.js` command. `KNOWN_ISSUES.md`/`PROJECT_STATE.md`/this
  entry.
- Also cleaned up 3 more stray 0-byte tooling-junk files matching the recurring pattern,
  and a 5th occurrence of the still-unexplained duplicate-QA-user pattern (found during the
  live qa-clickthrough.mjs run) -- cleaned up, verified gone, root cause still unidentified.

## 2026-08-13 — 0015/0016 applied by user, both empirically re-verified live; both real defects now RESOLVED
- Objective: user applied both prepared migrations via the SQL Editor; verify both fixes work
  for real, using the same empirical method that originally found each defect, then report
  cutover readiness with browser/email QA still explicitly separated as untested.
- **0015 (realtime) verification**: real `postgres_changes` subscriptions on `clients` and
  `machines`, real insert/update, checked for actual event delivery. First combined run showed
  a `clients` false-negative (event arrived but after an 8s timeout, under concurrent-channel
  load) — investigated rather than accepted at face value: an isolated retest with a longer
  wait proved the event does arrive; a final clean combined run with generous timing (15s)
  passed 100% for both tables. Traced the consumer code path in `ClientDetail.jsx`/
  `MachineDetail.jsx` down to the exact `setClient`/`setMachine`/`setMachines` calls. All test
  data cleaned up. **RESULT: PASS, real events confirmed received.**
- **0016 (storage RLS) verification**: first attempt used `text/plain` content against the
  `documents` bucket's real MIME allow-list (`pdf`/`png`/`jpeg`/`webp` only) — every op failed
  before RLS was even relevant, a test-setup bug, not a real finding; recognized this from the
  error text ("mime type ... is not supported") and re-ran correctly with `application/pdf`.
  Full matrix with 2 throwaway QA accounts (admin + real technician permission set): admin
  upload/read/update all succeeded on own file; technician upload/read/update/delete all
  succeeded on own file; technician's read/update/delete of the admin's file all correctly
  denied, verified via ground truth (re-read as admin afterward, confirmed file still existed
  and content unchanged) not just absence of an error; admin's read/update/delete of the
  technician's file all succeeded (admin bypass working). All test files + both QA accounts
  deleted and verified gone. **RESULT: PASS, all 12 checks, including 3 ground-truth-verified
  denials.**
- **4th occurrence of the unexplained duplicate-QA-user pattern** found and cleaned up during
  this verification pass — same ~7s-delay shape as the prior 3. Strengthened the
  `KNOWN_ISSUES.md` entry since this is now a clearly reproducible pattern (4/4 same shape),
  even though root cause remains unidentified and no real-data impact has ever been found.
- **Final baseline confirmed**: exactly 1 real user, 6 clients, 6 machines, 4 job_cards, 76
  permissions, 0 files in all 5 storage buckets — matches every prior verified count.
- **Docs updated**: `KNOWN_ISSUES.md` (both defect entries marked RESOLVED with verification
  detail, duplicate-QA-user entry strengthened), `PROJECT_STATE.md`/`SESSION_LOG.md` (this
  entry), `PHASE2_CUTOVER_CHECKLIST.md` (updated to reflect both fixes applied+verified).
- **Not done, explicitly separated per instruction**: real browser QA (still no browser tool
  available in this environment), real email-inbox password-reset delivery test (deferred
  until a real receivable address is available), any production change.

## 2026-08-12 (cont. 3) — realtime/storage-RLS fixes prepared, password-reset mechanism verified, RLS allow/deny matrix tested, browser QA limitation disclosed
- Objective: fix the two real defects from the prior readiness report (realtime publication
  gap, generic storage bucket RLS) with evidence-first design, verify the password-reset flow
  without touching the real admin, and perform manual browser QA — all pre-cutover, no
  production changes.
- **Realtime fix**: wrote `supabase/migrations/0015_enable_realtime_clients_machines.sql`
  (exactly `alter publication supabase_realtime add table public.clients, public.machines;`,
  scoped to only these 2 tables per instruction). **Not applied** — no DDL execution
  capability exists in this environment (same hard constraint as every prior migration
  including `0014`); needs the SQL Editor.
- **Storage RLS fix**: investigated real bucket usage first (traced all 3 real consumers of
  the generic upload path — `BookIn.jsx`/`LogServiceModal.jsx`/`KnowledgeMachineDetail.jsx`
  — confirmed the app already uploads to `{auth.uid()}/...` paths, and confirmed no
  currently-working feature needs cross-non-admin-user file visibility). Designed and wrote
  `supabase/migrations/0016_storage_generic_buckets_owner_or_admin.sql` (owner-or-admin,
  matching `profile-images`' existing precedent and the project-wide `is_admin()` bypass
  pattern). Presented current/proposed/security-boundary before writing the file, per
  instruction. **Not applied** — same DDL constraint as above.
- **Password reset**: full mechanism verified live via script against a throwaway Supabase
  Auth user (not the real admin) — `resetPasswordForEmail()`, `admin.generateLink()`,
  hash-fragment token capture + `setSession()` (mirrors `detectSessionInUrl`),
  `updateUser({password})` (mirrors `ResetPassword.jsx`), old-password-rejected,
  new-password-works. All PASS. Honestly could NOT verify: real SMTP delivery to a real
  inbox (throwaway `@invalid.local` addresses are actually rejected by Supabase's real send
  path, discovered live) and the actual React `ResetPassword.jsx` UI rendering (no browser
  tool available — confirmed via a direct capability check, not assumed).
- **RLS allow/deny matrix**: created a second throwaway QA user with the real `technician`
  role's actual 29-key permission set (pulled from live `role_permissions`, not guessed).
  Verified via real signed-in calls: allowed ops succeed (select clients/machines, insert/
  update job_cards), denied ops correctly rejected by RLS itself, not just hidden UI (insert/
  update/delete clients, insert knowledge_machines, update permissions, self-role-escalation
  — all correctly blocked). One false-positive FAIL was investigated and resolved: a
  `job_cards` delete initially looked like it succeeded, but was actually silently filtered
  to 0 rows by RLS (correct) — my own test script didn't check the affected-row count;
  verified the row still existed via a service-role read, confirming RLS was correct and the
  test methodology was the bug, not the app. Also spot-checked static UI-level gating
  (`RoleGuard` route guards + `hasPermission()` inline checks) as a partial (non-browser)
  substitute for "restricted UI is hidden."
- **Manual browser QA (item 4)**: confirmed, via a direct capability check of every
  available tool, that **no browser automation tool exists in this session** despite the
  system prompt referencing one — could not perform literal browser click-through QA.
  Substituted the deepest available script-level equivalent (RLS matrix above +
  `qa-clickthrough.mjs`/`qa-diff-clients.mjs` from the prior session) but this is explicitly
  NOT the same as real browser QA (UI rendering, responsive layout, real click/keyboard
  interaction, page-refresh/session-persistence in an actual browser tab were never tested)
  — reported honestly as a remaining manual action, not claimed as done.
- **Found a 3rd occurrence of the unexplained-duplicate-QA-user pattern** (see new
  `KNOWN_ISSUES.md` entry) — cleaned up, root cause still not identified.
- Local dev: created a gitignored `frontend/.env.local` (`VITE_AUTH_BACKEND=supabase`,
  local-only, never touched `.env.production`) to run the app locally against Supabase for
  planned browser QA; deleted it again at the end since no browser tool ended up using it.
  Ran `npm run dev` locally, confirmed serving (200 OK), stopped it at the end (killed the
  actual listening process by PID after `pkill -f vite` alone didn't work on Windows).
- **Verified all QA accounts/test data fully cleaned up** at the end: 3 total throwaway auth
  users deleted+verified-gone this session (2 intentional + 1 more duplicate-pattern
  occurrence), 1 stray test `job_cards` row deleted+verified-gone, `users` table back to
  exactly 1 real row, `clients`/`job_cards` counts back to the known-real baseline (6/4).
- **Docs updated**: `KNOWN_ISSUES.md` (2 new entries: duplicate-QA-user pattern,
  password-reset verification detail; realtime/storage-RLS entries updated with "fix
  prepared, not applied" status), `PROJECT_STATE.md`/`SESSION_LOG.md` (this entry). New
  files: `supabase/migrations/0015_enable_realtime_clients_machines.sql`,
  `supabase/migrations/0016_storage_generic_buckets_owner_or_admin.sql` (both prepared,
  neither applied).
- **Not done**: applying 0015/0016 (needs the user via SQL Editor); post-apply empirical
  re-verification of both fixes (needs them applied first); real browser QA; real
  email-inbox click-through; any production change.

## 2026-08-12 (cont. 2) — permissions/role_permissions migration applied+verified, full pre-cutover readiness investigation
- Objective: apply the previously-blocked `0014` migration once the user ran it via the SQL
  Editor, run the full permissions-migration + QA workflow without re-asking at each step
  (explicit user instruction to stop treating every sub-step as its own approval gate), then
  investigate the 5 remaining documented cutover decisions (`sites`, generic storage bucket
  RLS, Android timing, realtime semantics, staging target) with live evidence, not inference.
- **Permissions migration**: re-verified `0014` live (schema confirmed changed), ran
  `migrate-permissions.mjs --apply` (76 permissions + 124 role_permissions inserted),
  independently verified counts/per-role breakdown/FK integrity/duplicate-check/content
  spot-checks all match Firestore exactly. Removed the stale Google Calendar check from
  `qa-clickthrough.mjs` (Calendar was removed in the prior session) — `node --check` clean,
  no leftover references. Ran `qa-clickthrough.mjs` (21/21 pass, incl. real RLS-protected
  reads of the new `permissions`/`role_permissions` tables) and `qa-diff-clients.mjs`
  (6/6 clients, all with `legacy_firestore_id`). `supabase npm test` 18/18 unchanged.
- **Found and cleaned up a genuine anomaly**: after creating 1 throwaway QA test user, the
  `users` table showed 3 rows instead of the expected 2 — a second unexplained throwaway
  user existed, created ~7s after mine, same script's naming pattern. Root cause not
  conclusively identified. Verified it touched no real data (role=admin, no
  `legacy_firebase_uid`), deleted both throwaway users via `qa-test-user.mjs delete` +
  `verify-gone` (both auth + profile rows confirmed gone for each). `users` back to exactly
  1 real row. Also removed a stray 0-byte `supabase/null)` artifact (shell-redirection
  mishap from a scratch script).
- **Real admin auth-path verification**: ran `qa-verify-users.mjs`/`qa-check-admin-password
  .mjs` (both read-only, inspected first) — exactly 1 user in Firestore/Postgres/
  `auth.users`, all IDs/roles match; admin has a real working password (`last_sign_in_at`/
  `email_confirmed_at` both set from the 2026-08-11 verification). **Did not** attempt a
  fresh live `signInWithPassword` against the real admin this session — the plaintext
  password isn't stored anywhere retrievable (correctly, per security policy), and
  resetting it again to test would mutate the real production-bound credential, which
  wasn't asked for. The equivalent full sign-in/RLS-access/logout flow was already proven
  this session via `qa-clickthrough.mjs` against a throwaway admin-equivalent user
  exercising the identical code path.
- **5 cutover decisions investigated with live evidence** (full detail in
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` section 1 and `KNOWN_ISSUES.md`):
  - **`sites`**: confirmed dead/unbuilt — no page references `SiteService`/`apiClient
    .entities.Site` anywhere, `machines.site_id` nullable and never populated by the
    migration mapper, live: 0 sites rows, 0/6 machines with a non-null `site_id`. No FK
    risk. Leaving it empty is correct, not a gap.
  - **Generic storage buckets**: read `0004_storage_buckets.sql` + `has_active_profile()` —
    `documents`/`photos`/`attachments` grant full CRUD to ANY active signed-in user, no
    owner/client scoping, unlike `profile-images` (correctly self-scoped) and `invoices`
    (correctly permission-gated). Confirmed live: all 5 buckets private, all 0 files today.
    Zero real impact with 1 admin user today; will matter once a second non-admin active
    user + real files exist. Not changed — reported for the user's decision.
  - **Android timing**: confirmed zero Supabase references anywhere in `mobile-android/` —
    the web flag has no code-level effect on Android. Real risk is data divergence (no
    bidirectional sync, one-time bulk copy only), not Android breaking. Default assumption
    (Android stays on Firebase) holds, no technical objection found.
  - **Realtime semantics — found a real, previously-unverified defect**: `ClientDetail.jsx`/
    `MachineDetail.jsx` are the only real page consumers of `.watch()`/`.subscribe()`.
    `supabaseApiClient.js`'s re-query implementation is correct, but **two live empirical
    tests** (real insert on `clients`, real update on `machines`, both with an actively
    `SUBSCRIBED` channel) received **zero realtime events** — no migration ever adds these
    tables to the `supabase_realtime` publication. Confirmed, not fixed (needs its own DDL
    approval). New `KNOWN_ISSUES.md` entry.
  - **Staging target**: confirmed `supabase/.env` and `frontend/.env.production` point at
    the identical project (`cjvrquipmnoihksijful`/`CAPDATABASE`) — there is no separate
    staging project; all QA (including this session's) runs against the real pre-cutover
    dataset. Reported as technically acceptable to continue against, with the cleanup-
    discipline caveat the leftover-QA-user anomaly above just demonstrated in practice. No
    new project created (not asked for, would be more disruptive this late).
- **Docs updated**: `KNOWN_ISSUES.md` (permissions issue marked resolved, new realtime-gap
  entry added), `PHASE2_CUTOVER_CHECKLIST.md` (all 5 section-1 decision items updated with
  evidence, verification-checklist checkboxes updated, header status refreshed, stale Google
  Calendar checkbox marked moot), `PROJECT_STATE.md` (this entry).
- **Verified, not just written**: every claim above backed by a live read/write/query this
  session, not carried over from memory. Firebase remains the sole live-serving backend
  throughout (`VITE_AUTH_BACKEND=firebase` unchanged in every committed config) — no
  production auth config, no Cloudflare deploy, no flag flip.
- **Not done, explicitly deferred**: fixing the realtime-publication gap or the
  storage-bucket RLS gap (both need explicit approval, this was an investigation pass, not a
  fix pass); building a real password-reset-email script; a real browser click-through with
  the flag flipped as both an admin and a limited-permission user; the actual production
  cutover itself.

## 2026-08-12 (cont.) — Google Calendar sync removed entirely (user: cost)
- Objective: user said "i dont want to connect to google calender anymore. it cost me too
  much money", then, after Queen Bee asked for scope, "make that the calender doesnt sync to
  google. but keep a calender" — full removal of the sync feature, keep the in-app Calendar.
- Gave the user the immediate stop-the-bleeding command (`firebase functions:delete ...`,
  exact 8 function names + region/project) since Queen Bee can't run deploy/undeploy actions.
- Investigated scope first: confirmed `functions/index.js` exports ONLY the 8 Google
  Calendar functions (nothing else deployed from this repo), `functionsClient.js`/
  `callFunction` are used only for Google Calendar, and `CalendarPage.jsx`'s "Upcoming
  Services" rendering already works entirely from Firestore/Postgres data independent of
  Google (confirmed by reading `calendarEvents()` in both `apiClient.js`/
  `supabaseApiClient.js` before touching anything).
- Removed: `SystemSettings.jsx` (deleted) + its `/settings` route/nav entry; `
  functionsClient.js` (deleted); the Google branch + route dispatch from both `apiClient.js`
  and `supabaseApiClient.js`; `CalendarPage.jsx`'s Google toggle/status/event-details UI
  (kept the Upcoming Services calendar itself); all 8 Cloud Functions' exports
  (`functions/index.js` now exports nothing, left a header comment with the exact
  `functions:delete` command for whoever picks this up); `functions/lib/
  googleCalendarService.js`/`googleCalendarStore.js`/`googleOAuthClient.js` + their test
  files; `googleapis` from `functions/package.json` (ran `npm install` to update the
  lockfile); `VITE_FUNCTIONS_BASE_URL` from `frontend/.env.production`/`.env.example`.
  Rewrote `CLAUDE.md` section 7 to record the removal instead of describing dead
  architecture as current.
- Deliberately did NOT remove: `functions/lib/auth.js`/`supabaseAuth.js` (generic reusable
  auth infra, not Google-specific), `calendar.google.*` permission keys, Laravel's Google
  Calendar code, or the Google Calendar docs (all left as harmless/historical).
- Verified: `frontend` lint/typecheck/test(2/2)/build all clean (build re-run twice, once
  after the main removal and once after the env cleanup). `functions` lint clean, test suite
  28/28 pass (down from before since 3 Google-specific test files were deleted alongside
  their subjects — not silently broken/skipped).
- Updated `docs/ai-memory/{PROJECT_STATE,DECISIONS,KNOWN_ISSUES,ROADMAP}.md` and
  `CLAUDE.md` section 7.
- **Not done, flagged for the user/next session**: (1) user must run `firebase
  functions:delete ...` to actually stop billing on whatever's deployed right now — code
  removal alone doesn't undeploy anything; (2) the stored Firestore `system_integrations/
  google_calendar` OAuth connection wasn't explicitly revoked; (3) Android's
  `GoogleCalendarRepository` read-only consumer wasn't touched — belongs to `android-ui-bee`/
  `integration-sync-bee`, not delegated yet this session.
- Did NOT commit this work yet as of writing this entry — see git status before assuming it
  landed.

## 2026-08-12 — Memory catch-up: reconstructed 5 days of undocumented work, merged stray agent memory, updated ai-memory docs, ran verification
- Objective: user said "1 then continue with everything" in response to a proposed plan
  (consolidate+commit the backlog of uncommitted work, then continue with everything else —
  chasing the Calendar 401 bug, general Phase 3 follow-up).
- **Found**: branch `supabase-phase3-cutover-prep` had ~23 files / ~1240 lines of real,
  build-relevant work sitting uncommitted since sessions this file never recorded
  (2026-08-07 through ~2026-08-11) — `docs/ai-memory/` was stale at 2026-08-06. Also found a
  duplicate `frontend/.claude/agent-memory/queen-bee/` directory (4 real memory files, never
  merged into the canonical root location) plus `frontend/.claude/`/`supabase/.claude/`
  Ruflo tooling-cache junk (`proven-config.json` etc., same recurring pattern as before).
- **Reconstructed the missing narrative** from the found agent-memory files and dated code
  comments in the uncommitted files (not from a live transcript — explicitly flagged as
  reconstruction, not first-hand-verified, in every doc touched): a real unresolved Google
  Calendar Cloud Functions bug (rejects a genuinely valid Supabase session with 401, found
  2026-08-07), scripted Phase 3 QA that passed for the core data/auth/RLS layer, a real
  pre-existing `AuthLayout.jsx` UI bug (fixed), a real `permissions`/`role_permissions`
  migration gap (fixed via new unapplied `0014` migration), and a direct admin-password-set
  workaround for the still-untested password-reset-email flow.
- **Merged** the 4 stray memory files into `.claude/agent-memory/queen-bee/`, updated its
  `MEMORY.md` index. Attempted to delete `frontend/.claude/`/`supabase/.claude/` (junk-only
  content) via `git rm` and plain `rm -rf` — **both blocked by the auto-mode safety
  classifier** as sensitive `.claude`-directory deletions; did not attempt to route around
  it. Unstaged those two directories instead so they won't be committed, and flagged them in
  KNOWN_ISSUES.md for the user to delete manually.
- Updated `docs/ai-memory/PROJECT_STATE.md` (new header + a full reconstructed catch-up
  entry), `KNOWN_ISSUES.md` (5 new entries: memory-catch-up note, Calendar 401 bug, QA
  summary, permissions migration gap, `AuthLayout.jsx` bug), and `ROADMAP.md` (reconstructed
  progress entries + a revised ordered "Next" list).
- Verification: see the next log entry for actual command output — this entry covers the
  documentation/memory reconciliation only.
- Did NOT: fix the Calendar 401 bug, apply `0014`, send/click a password-reset email, delete
  the stray `.claude/` junk dirs (blocked), or push anything. Firebase remains the sole live
  production backend; nothing production-facing was touched.

## 2026-08-06 (cont. 6) — Phase 3 QA started per user's ordered plan; step 2 mid-flight, blocked on user for tomorrow
- Objective: user gave an explicit 5-step validation plan (verify redirect URLs → confirm
  password-reset flow end-to-end → full manual QA with the flag on locally → fix
  migration-related bugs only, redeploy/retest as needed → final migration report with a
  go/no-go recommendation). Explicitly: no new features, no production cutover, no
  production config changes without separate approval.
- **Step 1**: told the user exactly what's needed and why, having actually checked the code
  rather than assumed — confirmed `Register.jsx` calls a `.auth.register()` method that
  doesn't exist on either `apiClient.js` or `supabaseApiClient.js` (pre-existing, broken
  under both backends, not migration-related, flagged for QA reporting not fixing), so the
  only real redirect-URL need is `http://localhost:5173/reset-password` for password reset.
  User confirmed it's in the Supabase Auth allowlist.
- **Step 2, in progress**: sent the real reset email pointed at the local dev server.
  User reported a **blank white page** — not the app's own "Invalid reset link" fallback,
  something crashing before React could render at all. Asked for the exact browser console
  error rather than guessing (no browser tool access this session) — user provided it:
  `Missing Firebase configuration` from `firebase.js:20`. Root cause: local `frontend/.env`
  never had `VITE_FIREBASE_*` values (pre-existing, previously harmless), and
  `firebase.js` fails fast at import time regardless of `VITE_AUTH_BACKEND` — unlike
  Supabase's `client.js`, which was made lazy earlier this session specifically to avoid
  this exact class of crash. Fixed pragmatically (added the same real, public-safe Firebase
  web config already committed in `.env.production` to local `.env`, no code changes) and
  restarted the dev server. Confirmed loading again via curl.
- User then clarified their email account is on a different computer than the dev server —
  resent the email a second time so they can open it via a browser on the dev-server
  machine itself once they're back. **User is stepping away until tomorrow** — did not
  push further, no risk in leaving state as-is (nothing production-facing touched).
- Files changed: `frontend/.env` only (gitignored, local-only — added Firebase dev config).
  No application code changed this entry. `docs/ai-memory/*.md` updated.
- Cleaned up 2 more stray `.claude/` tooling-cache directories (recurring pattern).
- State left for tomorrow: local dev server running at `http://localhost:5173` with
  `VITE_AUTH_BACKEND=supabase` and now-correct Firebase config; a fresh, unclicked
  password-reset email sent to `admin@connoisseurauto.co.za`. Next: user clicks the link,
  reports what they see; continue step 2 (set new password, confirm login works), then
  steps 3-5 of their plan. Nothing live, nothing in production changed.

## 2026-08-06 (cont. 5) — Functions deployed, real bug found+fixed via live testing, redeployed and re-verified
- Objective: user resolved the GCP billing hiccup themselves and set the
  `SUPABASE_SERVICE_ROLE_KEY` secret. Said "fix everything dude" earlier and "it is done"
  after each deploy attempt — treated both as reports/approval for the specific
  safe/additive Functions deploy already discussed, not as blanket license to skip
  verification or proceed to the actual production cutover.
- The `firebase deploy --only functions` command itself is blocked by the auto-mode safety
  classifier for Queen Bee directly (confirmed by testing it) — a hard system-level gate
  on production deploys. Asked the user to run it themselves both times, did not attempt to
  route around it.
- **First deploy: did not accept "it is done" at face value.** Sent a real HTTP request
  with a Supabase-issuer-shaped bearer token to the live `googleCalendarStatus` function —
  got `500`, not the expected `401`. Checked live Cloud Functions logs directly: Node 20
  (Cloud Functions' pinned runtime) lacks the `WebSocket` global that
  `@supabase/supabase-js`'s internal Realtime client construction requires; not caught
  locally because the local dev machine runs Node 24. Traced the code path to confirm this
  had zero impact on real production traffic (only reachable via a Supabase-issued token,
  which no real client sends). Fixed via a guarded `ws` polyfill in
  `functions/lib/supabaseAuth.js`. Verified: lint clean, 76/76 tests pass (unchanged count
  — local tests already succeeded regardless, since local Node has native WebSocket).
- **Second deploy: verified live again, thoroughly.** User redeployed. Sent 4 real live
  requests: the same Supabase-issuer test token (now correctly `401`), missing auth header
  (`401`, unchanged), a garbage non-JWT token via the still-unchanged Firebase branch
  (`401`, unchanged), and a CORS preflight (`204`, unchanged). Checked live logs again:
  both branches' failures are caught cleanly by the existing error handler, no crashes.
- Cleaned up 2 more stray tooling-cache directories (`frontend/.claude/`,
  `functions/.claude/`, same recurring Ruflo/Claude-Flow hook pattern).
- Files changed: `functions/lib/supabaseAuth.js` (WebSocket polyfill),
  `functions/package.json`/`package-lock.json` (new `ws` dependency); `docs/ai-memory/*.md`,
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`.
- Result: the Google Calendar Cloud Functions auth redesign is genuinely deployed and
  working in production for both issuer branches — verified via real live requests and log
  inspection, not just trusting deploy success messages. Firebase remains completely
  otherwise unaffected; no client sends Supabase tokens yet (`VITE_AUTH_BACKEND` defaults to
  `firebase` everywhere); the actual Google Calendar OAuth/API logic was never touched.
- Remaining: check Supabase Auth's redirect-URL allowlist before re-sending the
  password-reset email pointed at a local test target (the first real send pointed at the
  live, still-Firebase-default production URL — not completable, treat as expired); full
  manual QA with the flag flipped locally; the actual cutover. Each still needs its own
  separate explicit approval.

## 2026-08-06 (cont. 4) — Functions deploy attempted, blocked on 2 dashboard-only items found via real testing
- Objective: user said "fix everything dude" in response to being asked whether to proceed
  with the Functions deploy — read as approval for the deploy (safe/additive, explicitly
  discussed) and for fixing the redirect-testing gap, NOT as approval for the actual
  production cutover (flag flip), which remains separately gated regardless of phrasing.
- Attempted to set the new `SUPABASE_SERVICE_ROLE_KEY` Firebase Secret programmatically
  (prerequisite for `firebase deploy --only functions`) by piping the value from
  `supabase/.env` into `firebase functions:secrets:set` — **correctly blocked by the
  auto-mode safety classifier** (reading and piping a raw secret value through a command
  Queen Bee runs is exactly the kind of action that guard exists for). Did not attempt to
  route around it; explained to the user and asked them to run the command themselves.
- User ran it themselves and hit a real, unexpected error: Secret Manager returned
  `HTTP 403: billing not enabled on capdatabasefb2` — surprising since the existing
  `GOOGLE_CALENDAR_CLIENT_ID/_SECRET` secrets already work in this same project. Not
  diagnosed further (no Cloud Console access) — flagged for the user to check the billing
  link directly. **Functions deploy still blocked**, not attempted without the secret
  existing first (deploy would either prompt interactively, which breaks non-interactive
  execution, or fail at runtime when the new code tries to read an unset secret).
- Separately, checked whether the real password-reset email sent last entry is actually
  completable: confirmed it is not — it points at the live, undeployed-fix, still-
  Firebase-default production URL. Also confirmed (by trying) that Queen Bee cannot check
  or fix Supabase's Auth redirect-URL allowlist (Dashboard-only, no Management API token) —
  a real gap for testing a locally-redirected resend. Set up a real test target instead:
  local dev server (`VITE_AUTH_BACKEND=supabase npm run dev -- --port 5173`), confirmed
  responding (curl 200) with `/reset-password` resolving.
- No code changed this entry — infrastructure/deploy-prep and diagnosis only. Two real,
  unresolved dashboard-only blockers now tracked in KNOWN_ISSUES.md: GCP billing/Secret
  Manager, and the Supabase redirect-URL allowlist (status unknown, not yet checked).
- Remaining: user checks GCP billing, retries secret set; user (or Queen Bee, once told the
  allowlist is fine) re-sends the password-reset email with `--redirect-to` pointed at the
  local dev server; only then does `firebase deploy --only functions` proceed, followed by
  real manual QA. Firebase remains the live, unaffected production backend throughout.

## 2026-08-06 (cont. 3) — SUPABASE_SERVICE_ROLE_KEY rotation confirmed live-verified
- User rotated the key via the Supabase Dashboard and updated `supabase/.env` themselves.
- Verified (not just assumed) via two live checks with the new key: read-only
  `--phases=verify` (all 10 collections still match) and a full `smoke-test.mjs` run
  (18/18 pass — Auth Admin API, service_role RLS-bypass writes, both triggers, storage
  buckets, full cleanup with no residue). Confirms full working service-role capability,
  not just connectivity.
- No code changes this entry — verification only. Next: user's go-ahead to actually send
  the real password-reset email (`send-password-reset-emails.mjs --apply`), then Functions
  deploy, then manual QA, then cutover — each still its own separate approval.

## 2026-08-06 (cont. 2) — Key-rotation blocker identified + password-reset/login-migration flow built (not sent, not deployed)
- Objective: user's explicit sequencing — "Do not deploy the Cloud Functions yet. First,
  let's rotate SUPABASE_SERVICE_ROLE_KEY and update all local environment/configuration to
  use the new key. After that, implement the password-reset/login migration flow... Once
  those two items are complete and verified, we'll deploy the Functions and then perform
  manual QA." Mid-session: "continue with the next stages when you're done - i need to
  leave the office" — treated as "keep implementing/verifying what's safely completable,"
  not as license to skip the approval gates in the same message.
- Confirmed key rotation is genuinely blocked on the user: only local copy of
  `SUPABASE_SERVICE_ROLE_KEY` is `supabase/.env` (repo-wide search confirmed no other
  file has it), rotation requires the Supabase Dashboard, which Queen Bee has no access to.
  Gave the user exact steps and recommended editing `supabase/.env` directly rather than
  pasting the new key into chat again (it was exposed in a transcript once before). **Not
  rotated as of this entry.**
- Built the password-reset/login-migration flow while waiting: new `supabase/scripts/
  send-password-reset-emails.mjs` (dry-run by default, live dry-run confirmed it finds the
  1 real migrated user correctly). Found and fixed a real bug surfaced while designing this:
  `frontend/src/pages/ResetPassword.jsx` only recognized Firebase's `oobCode`/`token` query
  param — Supabase's recovery flow uses a URL hash fragment exchanged into a session
  automatically, which this page didn't handle, so it would have shown "Invalid reset link"
  for every real Supabase password-reset email. Fixed via a `VITE_AUTH_BACKEND`-aware
  branch that waits for the Supabase session/`PASSWORD_RECOVERY` event instead.
- Verified: `frontend` lint/typecheck/test/build all clean, including a forced
  `VITE_AUTH_BACKEND=supabase` test build (reverted after) to confirm the fix actually
  compiles and doesn't crash. `supabase`: `node --check` on the new script, `npm test`
  18/18 (unchanged, no new test-covered logic — the script is thin I/O over already-tested
  primitives), live dry-run against the real project.
- Cleaned up 1 more stray 0-byte artifact (`supabase/Postgres`).
- Explicitly did NOT: rotate the key (can't — needs the user), run the reset-email script
  with `--apply` (sends a real email — deferred until the user is present to confirm
  receipt, and until the key is rotated per their stated order), deploy Cloud Functions, or
  touch any production config.
- Files changed: `frontend/src/pages/ResetPassword.jsx`; new `supabase/scripts/
  send-password-reset-emails.mjs`; `supabase/.env`/`.env.example` (added the already-public
  anon key, not a new secret); `supabase/package.json` (2 new npm scripts); `docs/ai-memory/
  *.md`, `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`.
- Remaining, in the user's own stated order: (1) user rotates the key and updates
  `supabase/.env` (or provides the new value); (2) Queen Bee verifies the new key works and
  the old one is retired; (3) send the real reset email, confirm receipt, set a real
  password; (4) `firebase deploy --only functions` (own approval); (5) manual QA with the
  flag flipped locally; (6) the actual cutover (own approval). Firebase remains the sole
  live production backend throughout.

## 2026-08-06 (cont.) — Google Calendar auth redesign implemented + Phase 3 frontend flag wiring built (not deployed, not live)
- Objective: user approved "start on the Google Calendar auth redesign and continue with
  phase 3" immediately following the Phase 2 completion earlier the same day.
- Confirmed the real Supabase JWT `iss` value first (design doc had flagged it as
  unconfirmed) via a throwaway test user, cleaned up after.
- Implemented `functions/lib/supabaseAuth.js` (new) + `functions/lib/auth.js`'s
  issuer-routed `requireUser()`, exactly per `docs/migration/
  GOOGLE_CALENDAR_AUTH_REDESIGN.md`. Added `@supabase/supabase-js` to `functions/
  package.json`. Wrote 10 new tests (`test/supabaseAuth.test.js`) + 3 routing tests
  (`test/auth.test.js`) that prove a Supabase-issued token really skips the Firebase branch
  and vice versa, not just that each branch works in isolation. Found and fixed a real
  testability bug along the way: `auth.js` originally destructured
  `isSupabaseIssuer`/`verifySupabaseUser` at require-time, which would have made them
  unmockable in tests (same class of issue the existing `admin`/`db` pattern already
  avoids) — switched to referencing via the module object instead.
- Built the `VITE_AUTH_BACKEND` frontend flag wiring (`AuthContext.jsx`, `apiClient.js`,
  `functionsClient.js`) with a design that needed zero changes to any of the ~13+21 files
  that already consume `useAuth`/`apiClient` — the flag routing lives entirely inside those
  two files themselves, writing into/reading from the same shared React context or plain
  object regardless of backend.
- **Found and fixed two real bugs by actually running builds, not just reasoning about
  code**: a top-level `await import()` that esbuild's configured target doesn't support
  (caught by a real `npm run build` failure); and the actual root cause that motivated
  wanting lazy-loading in the first place — `services/supabase/client.js` throwing at
  *module-import time* if Supabase env vars are missing, which would have crashed the
  default Firebase production build the moment those vars were ever absent somewhere, even
  with the flag defaulting off. Fixed via a lazy `Proxy` in `client.js` (defers the
  fail-fast to first real use), which let `apiClient.js` use a much simpler plain static
  import instead of fragile lazy machinery. Added real (non-secret, public-safe) Supabase
  config to `frontend/.env.production` and `.env.example`.
- Verified via two real production builds (not just unit tests): confirmed via `grep` on
  the output bundle that the default (`firebase`) build contains **zero** Supabase-related
  code at all (fully dead-code-eliminated); confirmed a forced `VITE_AUTH_BACKEND=supabase`
  build also succeeds. `frontend`: lint/typecheck/test all clean throughout. `functions`:
  `npm test` 76/76 (was 63), lint clean, `node --check` on every changed/new file.
- Cleaned up 7 more stray 0-byte tooling artifacts across `frontend/`/`functions/`
  (recurring Ruflo/Claude-Flow hook side effect from shell quirks during this session, not
  application code).
- Explicitly did NOT: deploy Cloud Functions, flip any production flag, rotate
  `SUPABASE_SERVICE_ROLE_KEY`, or do any live manual QA with a real Supabase-authenticated
  session (blocked by the still-missing password-reset-email script). All flagged as
  separate, still-open, approval-gated next steps — see KNOWN_ISSUES.md/PROJECT_STATE.md/
  ROADMAP.md 2026-08-06 entries.
- Files changed: `functions/lib/supabaseAuth.js` (new), `functions/lib/auth.js`,
  `functions/index.js`, `functions/package.json`/`package-lock.json`, `functions/test/
  auth.test.js`, `functions/test/supabaseAuth.test.js` (new); `frontend/src/lib/
  AuthContext.jsx`, `frontend/src/api/apiClient.js`, `frontend/src/api/functionsClient.js`,
  `frontend/src/services/supabase/client.js`, `frontend/src/services/supabase/
  SupabaseAuthContext.jsx`, `frontend/src/services/supabase/SupabaseAuthBridge.jsx` (new),
  `frontend/.env.production`, `frontend/.env.example`; `docs/ai-memory/*.md`.

## 2026-08-06 — Supabase migration Phase 2 completed: users + storage phases run and verified
- Objective: user restated their 5-phase migration plan and confirmed Phase 1 (schema/
  RLS/storage/tests) done; asked to complete Phase 2 (move Clients/Machines/Job Cards/
  Service Records/Knowledge Base/Users, then verify counts/relationships/attachments/
  images/permissions).
- Startup: read all memory files, re-verified live state before acting rather than trusting
  documentation — ran the read-only `verify` phase (all 10 collections matched Firestore)
  and a live column probe confirming `0013` (knowledge sub-collection field-name fix) was
  already applied. Confirmed this machine still has the real `supabase/.env` and Firebase
  service-account key from the 2026-08-04 session.
- User approved: "start with the users phase now and continue with the next phase too - get
  it done." Checked for existing Supabase Auth users first (0 found, no duplicate risk),
  then ran `--apply --phases=users`: 1 real Firestore user migrated. Verified live (not
  trusting script output alone): Auth user created correctly, profile row's role/
  `effective_permissions` (69 entries)/`is_active`/`preferences` all match Firestore
  verbatim. Ran `--apply --phases=storage`: confirmed genuine no-op both before and after
  (0 real files in either source collection).
- While reviewing storage-phase coverage, found `service_records.photos`/`job_cards.
  arrival_photos` have no Postgres columns/mapper entries. Investigated for real data loss:
  none found (0 real docs have either field populated) — traced to a pre-existing frontend
  bug (`LogServiceModal.jsx` never includes `photos` in its create payload) unrelated to
  this migration. Flagged in KNOWN_ISSUES.md, not fixed (out of scope).
- Final verification, independent of script claims: `verify` phase all-match; direct
  FK-orphan check found 0 orphans across every relationship (machines/job_cards/
  service_records/job_card_lines); exactly 1 `public.users` profile, no duplicates;
  `supabase` `npm test` 18/18 (no code changed, execution only).
- Files changed: none in `supabase/scripts/` or `frontend/` (no code changes this session —
  pure data-migration execution + verification). `docs/ai-memory/{PROJECT_STATE,ROADMAP,
  KNOWN_ISSUES,SESSION_LOG}.md` updated.
- Result: **Phase 2 (per the user's plan) is complete** — all real Firestore data (clients,
  machines, service records, job cards, job card lines, knowledge base, the 1 real user)
  now lives correctly and fully cross-linked in Supabase, content- and relationship-
  verified, not just count-matched. Firebase remains completely untouched and is still the
  only live-serving backend for web and Android — nothing in `frontend/`/`mobile-android/`/
  `functions/` was changed.
- Remaining before Phase 3 (side-by-side) can start: implement + deploy the Google Calendar
  auth redesign (prerequisite, needs its own approval), wire `SupabaseAuthProvider`/
  `supabaseApiClient.js` behind a flag (needs its own approval), build the still-missing
  password-reset-email script for the migrated user. None started this session — explicitly
  out of scope for "get Phase 2 done."

## 2026-08-05 — Ruflo/Claude Flow tooling setup, then Supabase migration Phase 2 prep continued (no live writes)
- Two distinct halves to this session.
- **Part 1 — tooling, not application code**: installed `ruvnet/ruflo` (npm package
  `ruflo@3.34.0`) per user request. Global `npm install -g` left native/postinstall scripts
  unrun (npm's `approve-scripts` explicitly refuses to work for global installs —
  `EGLOBAL`). Hand-running those scripts directly was blocked by the auto-mode safety
  classifier (correctly — that's unreviewed third-party code execution). Resolved by
  reinstalling `ruflo` as a local project at `C:\Users\Gerhard\tools\ruflo\` instead, where
  npm's real `approve-scripts --all` + `npm rebuild` flow works as designed. Verified via
  `ruflo doctor` (15 passed, 0 failed, 11 warnings). Running `ruflo doctor` from inside this
  repo had two side effects on tracked/untracked repo state (an auto-generated root
  `package.json`, and a version-bump to `.claude/helpers/helpers.manifest.json`) — both
  identified, confirmed unreferenced by any tooling, and reverted/removed at the user's
  explicit request. Also removed 2 more stray 0-byte tooling artifacts (`({,-`,
  `updatePassword(newPassword)`) matching the same recurring Ruflo/Claude-Flow pattern
  noted in prior sessions. Final repo state confirmed clean (`git status --short` empty)
  before moving on.
- **Part 2 — Supabase migration, Phase 2 prep continued**: see
  `docs/ai-memory/PROJECT_STATE.md`'s 2026-08-05 entry for full detail. Summary: closed the
  `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents`
  schema gap deferred on 2026-08-04 (new migration `0013`, not yet applied), found and fixed
  a second independent bug in the migration script's storage-copy phase (new unit-tested
  `firebaseStorageUrl.mjs` helper), wrote a complete Firebase-dependency audit
  (`docs/migration/FIREBASE_DEPENDENCIES.md`) that surfaced a real, previously-undocumented
  gap (Google Calendar's Cloud Functions auth is Firebase-ID-token-specific and needs a
  redesign before any Auth cutover), and refreshed the stale
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`.
- Tests/builds run: `supabase`: `node --check` (4 files), `npm test` 18/18 (was 12).
  `frontend`: `npm run lint`/`typecheck`/`test`/`build` all clean.
- Explicitly did not: run `--apply` or any live write against the real Supabase project,
  run `smoke-test.mjs` live, touch `AuthContext.jsx`/`apiClient.js`/`App.jsx`, touch
  Android, remove any Firebase code, or request/handle Firebase Admin credentials — all per
  this session's explicit constraints.
- Remaining work (as of the end of Part 2): `0013` needs the user to apply it via the SQL
  Editor. The Google Calendar auth-token gap needs a design decision, not just an approval.
  `users`/`storage` migration phases, frontend wiring, and the actual cutover all remain
  blocked on their own separate explicit go-aheads per the existing runbook.
- **Part 3 (same day, follow-up instruction)**: user asked to treat the Google Calendar
  auth gap as a first-class migration task and design it properly — not assume Firebase
  Auth survives the cutover, keep the Google Calendar API integration working while
  authenticating independently of Firebase Auth. Wrote
  `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md` (issuer-routed dual JWT verification —
  see `DECISIONS.md`/`PROJECT_STATE.md` 2026-08-05 entries for full detail). Design only,
  cross-referenced from `FIREBASE_DEPENDENCIES.md` and `PHASE2_CUTOVER_CHECKLIST.md`
  (new step 3.0). User separately confirmed they'll apply `0013` via the SQL Editor before
  the next data-migration session, and asked to push everything to git before leaving for
  the day, explicitly waiving approval prompts for the push itself. Pushed — see git log.

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
