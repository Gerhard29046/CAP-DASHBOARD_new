# Session Log

## 2026-08-15 — Android Phase F kickoff: photo-viewer bugs fixed + real CLI build verification (first ever); unrelated job_cards migration recovered
- Objective: install the E2 build to the user's phone (done, `adb install -r`, device
  `24116RACCG`), then continue systematically through the Android migration's remaining phases
  per explicit user instruction, prioritizing frontend/UX. Real-device feedback drove the
  priority: web photo upload/display works end-to-end; Android upload works but display was
  broken (blank thumbnails, no way to open a photo). User also flagged the website's
  photo-click-opens-a-new-tab UX as a separate, deferred web item — logged, not implemented.
- **`android-ui-bee`**: root-caused (before delegating) and fixed both photo bugs — missing
  `coil3-network-okhttp` dependency (blank thumbnails), and no tap handler/viewer anywhere (no
  way to open a photo). Added a shared `PhotoThumbnail` + new in-app `CapPhotoViewerDialog`,
  wired onto all 3 photo sites plus Knowledge Base's photo rows. Swept all 17 screens in
  `MainActivity.kt`, fixing several more real defects: permission-ungated dashboard quick
  actions, system back button not working on 6 detail screens (local Compose state, not nav
  destinations), blank-subtitle rendering, stale "Firebase" strings. Reported rather than
  guess-fixed: `StatusScreen`'s Firebase labels (genuinely still measures Firestore), the dead
  Google Calendar section, Users-screen missing search, a sub-48dp touch target.
- **`testing-bee`**: verified the change with a real Gradle build — and along the way
  root-caused this machine's multi-month "CLI Gradle build is broken" mystery for real: Avast
  Antivirus TLS-intercepts this machine's HTTPS traffic, and its (OS-trusted) root CA was never
  trusted by the Android Studio JBR's own `cacerts`, explaining why the GUI always worked and
  the CLI never did. Fixed a real build without disabling certificate validation (scratch
  trust-store copy + the OS-trusted Avast root, Gradle daemon pointed at it via
  `org.gradle.jvmargs`), verified the downloaded jar's SHA-1 against Maven Central first.
  Result: genuine `BUILD SUCCESSFUL` — 23/23 unit tests, lint 0 errors, real APK assembled.
  This is a scratch/one-off fix, not yet made durable (needs the user's approval for a
  permanent trust-store change).
- **Unrelated, found incidentally while clearing harmless 0-byte shell-artifact junk files**:
  `supabase/migrations/0025_job_cards_accessories_and_arrival_notes.sql` was sitting fully
  written, never committed or applied. Independently re-verified its claims (both fields
  genuine, confirmed absent from the live schema) before committing it (`7ce9cf8`). Likely
  fixes a currently-live Book In save failure (`PGRST204`) — not yet applied, needs the SQL
  Editor, flagged as high priority.
- Files changed: `mobile-android/gradle/libs.versions.toml`, `mobile-android/app/build.gradle.kts`,
  `mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/MainActivity.kt`,
  `supabase/migrations/0025_job_cards_accessories_and_arrival_notes.sql` (new).
- Tests/builds run: real CLI `gradlew.bat testDebugUnitTest lintDebug assembleDebug` — 23/23
  unit tests pass, lint 0 errors/31 pre-existing warnings, `assembleDebug` produced a real APK.
- Remaining/not done: on-device visual/runtime verification (no device run this session, only
  compile/package-level proof); `0025` not applied; the deferred web in-app photo-viewer
  (scoped, not implemented — `RecordPhotoGallery.jsx` already has an `onPhotoClick` extension
  point, needs one lightbox component + 3 call-site wire-ups); `StatusScreen`/dead-Calendar/
  Users-search items awaiting a decision or `supabase-android-bee`; Phases G–J not started;
  making the Avast trust-store fix durable awaiting user approval; `supabase-android-bee`/
  `migration-audit-bee` still not invocable this session (same recurring registration gap).

## 2026-08-14 (new conversation, continuing from the `"users"` architectural finding) — Architectural audit, Firestore listener isolation fix, independent testing-bee verification — E1 GATE PASSED
- Objective: resolve the one open blocker from the prior session's E1 verification — determine
  the Firestore `"users"` collection's architectural status (A/B/C/D), then, if authorized,
  isolate its failure so it can't terminate the shared Supabase data flow, then get it
  independently tested and gate E1.
- **Agent-registration gap discovered**: neither `migration-audit-bee` nor `supabase-android-bee`
  was invocable this session (`Agent type '...' not found. Available agents: android-ui-bee,
  testing-bee`), despite both having definition files under `.claude/agents/`. Per explicit user
  instruction, no agent definition was created/modified/deleted to work around this — Queen Bee
  performed the audit and the implementation directly instead, disclosed plainly in every report,
  with `testing-bee` (which was available) doing the independent verification rather than
  self-report.
- **Architectural audit (read-only, Read/Grep/Glob only)**: traced `Core.kt`/`MainActivity.kt`/
  `SupabaseAuth.kt`, `docs/android/ANDROID_SUPABASE_MIGRATION.md`, `supabase/migrations/0001_
  initial_schema.sql`'s `public.users` table, `frontend/src/pages/UserAdmin.jsx`, and `firestore.
  rules:29-31`. Determination: **Option C — intentionally retained as a transitional
  dependency**. The signed-in user's own profile/role/`effective_permissions` has been fully on
  Supabase since Phase C; only the separate read-only "Users" admin-list screen still reads
  Firestore. Found a genuine security-relevant inconsistency: the Firestore `"users"` list read
  is gated by `firestore.rules:31`'s `isAdmin()` (a Firestore-side check, unsynchronized with
  Supabase), not by the `effective_permissions`-based `users.view` permission that actually gates
  the screen in Android — two independent authorization systems disagreeing.
- **Implementation (Queen Bee, `supabase-android-bee` unavailable)**: rewrote `RecordsRepository.
  observeFirestoreCollection("users")` in `Core.kt` — on a listener error, sends last-known-good/
  empty data, tears down the dead listener, retries after 20s, never calls `close()`. Explicitly
  stricter than the Supabase-stream fix's cold-start-still-closes rule, with the reasoning
  documented inline (a `PERMISSION_DENIED` here isn't transient, so that carve-out would
  reproduce the bug). Only `Core.kt` touched; two stale doc comments corrected for accuracy.
- **`testing-bee` independent verification**: real Gradle build this session (`BUILD SUCCESSFUL`,
  `compileDebugKotlin` genuinely ran), 16/16 unit tests including 7 new deterministic tests
  (`ObserveFirestoreCollectionFailurePolicyTest.kt`) proving no duplicate listeners, no
  coroutine/job leaks, no runaway retries, and no shared-flow termination — with genuine
  regression-guard tests (asserting the *old* policy still fails) so the tests actually
  discriminate, not just restate. All 3 live regression baselines unchanged (token-refresh
  19/19, Phase D 21/21, E1 Knowledge Base 48/48). QA-account count independently re-verified
  unchanged (4 before, 4 after, same UUIDs). Security checklist fully passed (no service-role
  key, no logged credentials, no new Firebase dependency, no RLS bypass, no fabricated success
  data). 6 minor non-blocking observations raised (diagnosability of a permanent denial, no
  retry backoff, cosmetic style points, pre-existing repo-hygiene junk files).
- **Result: E1 gate PASS.** No Users migration, no Users removal, no Firebase removal performed.
  The underlying product question (eventual migrate-vs-remove for the Users screen) remains
  explicitly open, not decided by this work. E2/Photo Upload/Calendar remain NOT STARTED.
- Files changed: `mobile-android/.../Core.kt` (modified), `mobile-android/.../
  ObserveFirestoreCollectionFailurePolicyTest.kt` (new, `testing-bee`-authored).
- Tests/builds run: `gradlew.bat testDebugUnitTest assembleDebug` (real, BUILD SUCCESSFUL,
  16/16); 3 live REST-contract regression scripts against production Supabase (19/19, 21/21,
  48/48); live QA-account count query (4/4).
- Remaining work: the migrate-vs-remove product decision for `"users"`; investigate why
  `migration-audit-bee`/`supabase-android-bee` aren't registering this session; minor
  `testing-bee` observations (logging/telemetry for permanent denial, retry backoff); unrelated
  stray junk files in the working tree from an earlier session's shell-quoting accidents.

## 2026-08-14 (new conversation, continuing paused E1 work) — QA cleanup false-PASS bug fixed + `testing-bee` independent E1 verification: real gap found, E1 still NOT complete
- Objective: resume the paused Phase E1 (Android Knowledge Base) reliability remediation
  exactly where the prior session left off. User's explicit gate: investigate the QA-script
  cleanup false-PASS bug first (read-only, no deletions), THEN delegate `testing-bee` for
  independent verification, THEN (not reached this session) `migration-audit-bee`, THEN
  documentation, THEN a final report — each step requiring explicit go-ahead before the next.
- **Step 0 (unrelated, earlier in session)**: installed the `ruflo` Claude Code plugin
  marketplace (`ruvnet/claude-flow`, confirmed via GitHub API redirect to be the same repo as
  `ruvnet/ruflo` — a rename) plus 6 project-declared plugins, at the user's request, after
  investigating why the tooling statusline wasn't rendering (root cause: the marketplace was
  never actually installed on this machine, only referenced in config). Pulled 2 incoming
  commits from GitHub (Android worker-bee roster redesign + the paused E1 implementation
  itself), merged a stray duplicate `supabase/.claude/agent-memory/` copy into the canonical
  location, cleaned up several 0-byte shell-quoting-accident junk files.
- **QA cleanup investigation (read-only, no deletions, as instructed)**: read
  `qa-verify-android-token-refresh-contract.mjs`, `qa-verify-android-phase-d-rest-contract.mjs`,
  `qa-verify-android-phase-e1-knowledge-rest-contract.mjs` end-to-end. Proved (not assumed)
  two distinct false-PASS mechanisms — see `KNOWN_ISSUES.md`'s matching RESOLVED entry for
  the full mechanism. Fixed both scripts (minimal diff, cleanup logic only, no
  application/migration code touched), ran both live against production: 19/19 and 21/21,
  both scripts' own throwaway users independently confirmed gone via a fresh `listUsers()`
  call. Stopped and reported, per instruction, without proceeding further.
- **`testing-bee` independent E1 verification** (after explicit go-ahead; one retry needed —
  first spawn failed on an org-level Claude Code auth policy unrelated to this work, resolved
  by a `/login` re-auth, second spawn succeeded): verified 9/14 required criteria against
  real production Supabase (live command output included in its report), 3 more verified
  only statically (genuinely can't be dynamically exercised here — the auth/data layer isn't
  unit-testable as currently structured). **Found and self-corrected a real bug in its own
  new test script** (a new logout/session-revocation contract test it wrote,
  `qa-verify-android-session-revocation-contract.mjs`, 20/20 after the fix) that leaked one
  throwaway account on its first run — caught via its own independent verification, not
  blind trust, immediately deleted, re-run clean. **Corrected a stale environment-constraint
  claim**: `gradlew.bat` CAN build here with `JAVA_HOME` pointed at Android Studio's bundled
  JBR (real `BUILD SUCCESSFUL`, real APK) — the TLS/CA gap only blocks uncached dependencies
  (`lintDebug` specifically still fails). **Found the session's most important result**: the
  E1 fix correctly protects all 10 Supabase-backed streams, but an 11th, still-Firestore
  `"users"` collection was never touched and can still permanently kill every other screen's
  data via the same shared `combine()` — not hypothetical, per `Core.kt`'s own KDoc
  acknowledging the Firebase-bridge login is expected to fail for most real accounts today.
- **Queen Bee independently re-verified both of `testing-bee`'s most load-bearing claims**
  before accepting them (per the standing "review worker output" duty) rather than trusting
  the subagent report at face value: personally read `Core.kt:258-292` and
  `MainActivity.kt:127-144` and confirmed the `users`/Firestore finding is accurate; ran a
  fresh, independent `listUsers()` query and confirmed exactly 4 `qa-*` accounts remain
  (same 4 as before this session — no 5th leak survived).
- Files changed: `supabase/scripts/qa-verify-android-token-refresh-contract.mjs`,
  `supabase/scripts/qa-verify-android-phase-d-rest-contract.mjs` (both Queen Bee's fix);
  `supabase/scripts/qa-verify-android-session-revocation-contract.mjs` (new, `testing-bee`'s);
  `mobile-android/app/src/test/java/za/co/connoisseurauto/capmobile/ObserveCollectionFailurePolicyTest.kt`
  (new, `testing-bee`'s, a design-guard unit test — explicitly does not invoke
  `SupabaseDataRepository.observeCollection` itself, see the file's own header). No
  `SupabaseAuth.kt`/`SupabaseData.kt`/`Core.kt`/`MainActivity.kt` changes this session, per
  explicit instruction not to touch them until the `users` architectural determination is
  made.
- Tests/builds run: 2 QA scripts fixed + re-run live (19/19, 21/21); 3 pre-existing QA
  scripts re-run live by `testing-bee` (19/19, 21/21, 48/48 — re-confirming Queen Bee's
  earlier numbers independently, not reusing them); 1 new QA script written+run live by
  `testing-bee` (20/20); 1 new JVM unit test file (5/5) plus 4 pre-existing unit tests (9/9
  total) via a genuine forced Gradle recompile; a real `assembleDebug` APK build.
- Result: E1 reliability fix is real and well-verified for the 10 streams it covers, but is
  **NOT COMPLETE** — a genuine, evidenced gap remains outside the 3 files that were changed.
  **E1 STATUS: NOT COMPLETE. E2: NOT STARTED.** Per explicit user instruction, the `users`
  collection's correct architectural status (still-intentionally-Firebase vs. missed-
  migration vs. intentional-transitional-dependency vs. obsolete) must be determined — NOT
  guessed at — before any further code change, as a separate investigation task.
- Remaining work: determine `users`' architectural status (next task, per user's own stated
  plan); only then resume the gate at `migration-audit-bee` → documentation → final E1
  report, exactly as originally sequenced. The 4 leftover QA accounts remain undeleted,
  unauthorized for deletion. Several stray zero-byte junk files (shell-quoting accidents,
  likely from both this session and `testing-bee`'s) remain uncleaned in the working tree,
  flagged but not acted on.

## 2026-08-14 (later, new conversation) — Worker-bee roster redesigned for the formal Android→Supabase migration
- Objective: user formally declared the Android→Supabase migration and asked Queen Bee to
  redesign (not just rename) the `.claude/agents/` worker-bee definitions around the real
  target architecture — Android moving from Firebase Auth/Firestore to Supabase Auth/Postgres,
  the SAME backend `frontend/` already uses live.
- Investigation before editing: read all 3 existing agent defs, `queen-bee.md`,
  `ARCHITECTURE.md`, and `PROJECT_STATE.md`'s Phase C/D entries; inspected the real
  `mobile-android/` file layout (`Core.kt`, `MainActivity.kt`, `SupabaseAuth.kt`,
  `SupabaseData.kt`, `GoogleCalendarRepository.kt`) and `docs/android/
  ANDROID_SUPABASE_MIGRATION.md`'s phase-status sections (§12.7-12.9). Found the 3 existing
  agent `.md` files already had uncommitted, partial edits reflecting a "mixed Firebase+
  Supabase" mid-migration state (not committed, origin unclear — possibly an earlier,
  unfinished pass) — used as a starting reference but not treated as sufficient; rewrote all
  four files to match the user's full, detailed specification.
- Files changed: deleted `.claude/agents/integration-sync-bee.md`; added
  `.claude/agents/supabase-android-bee.md` (owns `SupabaseAuth.kt`/`SupabaseData.kt`/`Core.kt`
  repositories, RLS-respecting design, Firebase-migration responsibilities); added
  `.claude/agents/migration-audit-bee.md` (new, read-only, `Read`/`Glob`/`Grep` only); rewrote
  `.claude/agents/android-ui-bee.md` (tightened boundary/strict-MUST-NOT list) and
  `.claude/agents/testing-bee.md` (added RLS-testing checklist, migration-status-awareness
  section); updated `.claude/agents/queen-bee.md` (Agent() tool allow-list, delegation
  guidance, 4-bee coordination example); updated `docs/ai-memory/ARCHITECTURE.md`'s
  worker-bee-ownership section and added a `docs/ai-memory/DECISIONS.md` entry.
- Tests/builds run: none — this was agent-definition/documentation work only, no
  `mobile-android/` (or any other) application source was touched, per the user's explicit
  instruction not to modify application code unless required to validate the agent
  definitions (it wasn't required).
- Result: 4-bee roster now reflects the actual Supabase migration architecture rather than
  generic Firebase terminology. Not independently "tested" in any runnable sense (these are
  prompt/instruction files, not code) — verification here is the fact that they're grounded in
  the real current file layout and migration-doc phase status, not a build/test result.
- Remaining work: none required by this task. Next Android delegation should route
  Supabase/data-layer work to `supabase-android-bee` (not the now-deleted
  `integration-sync-bee`), and consider running `migration-audit-bee` after the next
  meaningful chunk of migration work lands.

## 2026-08-14 (continuing overnight, same conversation) — Android→Supabase migration: Phase D, core data + build-tooling update
- User reviewed Phase C, ran a focused verification pass (dual-auth bridge explanation +
  leftover-QA-user investigation, both reported, nothing deleted), then asked whether a
  working APK could be produced. Real, fresh CLI build attempt (via `testing-bee`, not
  assumed from stale notes) still failed — same TLS/CA root cause as documented, but this
  time surfacing at dependency resolution rather than the wrapper download. Queen Bee
  launched Android Studio's GUI directly (`start studio64.exe <project>`) since that's a
  plausible different network/trust path; the user then built+ran it there themselves and
  confirmed success. Real, disclosed limitation acknowledged: Queen Bee cannot drive Android
  Studio's GUI, only launch it — actual build/verification there requires the user.
- User then said "continue with the next phase. then push to git and commit. i am going to
  sleep" — approving Phase D. Mid-implementation, a further message arrived: "can you run
  through all the phases and commit and push to github. i want to wake up tomorrow and see
  progress." Queen Bee did **not** attempt all remaining phases (E–J) unsupervised — completed
  Phase D properly (the phase already in progress, real and verifiable), then stopped and
  documented explicitly why E–J weren't safe/possible to rush tonight (see
  `docs/android/ANDROID_SUPABASE_MIGRATION.md` §12.9): Phase E needs the same rigor Phase D
  just got (knowledge_base field-rename risk, genuine new photo-upload feature work); F/G are
  human design work (G has no source logo asset in the repo at all); H needs a real compiler;
  I is explicitly gated (by a prior instruction already on record) on verified D/E parity,
  which doesn't exist yet; J depends on I. Rushing those unsupervised risked handing back a
  broken app, the opposite of "see progress."
- **Design decision, made explicit before coding**: rather than the larger, higher-risk
  version of Phase D originally sketched (typed `@Serializable` models + converting all 5
  screens to real nested `NavHost` routes in one pass), kept `CapRecord`/`RecordsState`'s
  existing generic `Map<String, Any?>` shape and only swapped the data source underneath it.
  Verified via grep, *before* writing any repository code, that `MainActivity.kt`'s screens
  already read the *current* Postgres column names (`job_number`/`date_received`/
  `service_date`/`work_performed` — added by migrations `0008`/`0010`, well after the
  original `0001` schema) — meaning the screens were already written against the up-to-date
  schema (likely from an earlier Android visual-redesign pass), so a pure backend swap with
  zero screen changes was both safe and sufficient. Nested-route conversion remains
  deliberately deferred, not solved, not silently dropped.
- **New `SupabaseData.kt`**: `SupabaseDataRepository`, plain REST (`HttpURLConnection`/
  `org.json`), matching `SupabaseAuth.kt`'s Phase C precedent, not the `supabase-kt` SDK —
  same "can't verify new Gradle dependencies here" reasoning as Phase C. Generic CRUD for any
  table name; "observe" is polling (every 20s) plus an immediate targeted re-fetch triggered
  by the signed-in user's own `create`/`update`/`delete` (via a `MutableSharedFlow<String>`),
  so the user's own edits feel instant while other users'/devices' changes still show up
  within ~20s — a disclosed, deliberate simplification versus Firestore's real-time push,
  chosen specifically to avoid adding an unverified Realtime/WebSocket dependency.
- **`Core.kt`**: new top-level `SUPABASE_MIGRATED_TABLES` constant (clients/machines/
  service_records/job_cards/job_card_lines) is the single source of truth both
  `RecordsRepository` and `StatusRepository` check. `RecordsRepository.observeCollection`/
  `create`/`update`/`delete` each branch on table name — Postgres path for the 5 migrated
  tables, the original (untouched) Firestore path for everything else
  (`knowledge_*`/`users`, Phase E). `observeCollections()` itself (what `MainViewModel`
  actually calls) needed **zero changes** — it already combined per-name flows generically.
  `StatusRepository.sync()` was updated to count the 4 now-migrated `syncResources` via
  Supabase instead of Firestore — a real, in-scope fix (leaving it unfixed would have made
  the Status screen silently show stale/wrong counts for exactly the resources this phase
  moved), not scope creep. `checkHealth()`/`testConnection()` deliberately left probing
  Firestore/Firebase specifically — a known, pre-existing property of the Phase C bridge
  design, not a new gap, flagged rather than silently left inconsistent.
- **Real finding while first running live QA, not glossed over**: the first REST-contract
  test run failed 10/16 with Postgres `42501` RLS-violation errors on every create. Root
  cause, confirmed by reading `0002_rls_policies.sql` directly: every write policy on these 5
  tables checks `public.has_permission('<resource>.create'/'.edit'/'.delete')` against
  `public.users.effective_permissions` — the throwaway test technician had a role but no
  permissions array populated, so RLS correctly denied every write (working exactly as
  designed, not a bug). Fixed the test (granted a realistic permission set), re-ran: **16/16
  pass.** Real, practical implication flagged for real Android users: any technician's
  `effective_permissions` must actually be populated correctly in Supabase or their writes
  will be silently blocked by RLS — same underlying gap already known from Phase C (most real
  Android users don't have a Supabase Auth account yet at all).
- **New `supabase/scripts/qa-verify-android-phase-d-rest-contract.mjs`**: drives the exact
  HTTP request shapes `SupabaseData.kt` sends (POST + `Prefer: return=representation`, GET
  `select=*&order=created_at.desc`, PATCH `?id=eq.<id>`, DELETE `?id=eq.<id>`, GET + `Prefer:
  count=exact`) against live production Supabase, including the "newer"
  `service_date`/`work_performed`/`job_number`/`date_received` columns specifically (the ones
  originally flagged as a field-mapping risk). Full cleanup independently re-verified.
- Updated `docs/android/ANDROID_SUPABASE_MIGRATION.md` (§12, full Phase D writeup),
  `docs/ai-memory/{PROJECT_STATE,KNOWN_ISSUES,ROADMAP}.md`, and Queen Bee agent memory.
- Committed and pushed per explicit instruction — see the git log for the exact commits; the
  already-reviewed Phase C (+ earlier same-day dashboard-notes-RLS/Functions-removal) work
  and the new Phase D work were kept as separate commits for reviewability.
- **2 leftover throwaway QA test accounts remain undeleted** — reported to the user twice now
  (once during the Phase C review pass, once implicitly still true here); no explicit
  deletion approval received yet, so still not touched.

## 2026-08-13 (same session, later still) — Android→Supabase migration: Phase C, authentication
- User reviewed and approved Phase B, authorized Phase C with a detailed, narrowly-scoped
  spec: replace Firebase Auth with Supabase Auth for login/session, preserve existing UX,
  use `public.users` + the Supabase UUID as authoritative identity, preserve role/permission
  behavior, never introduce the service-role key into Android, don't remove Firebase deps
  unless provably unused as a direct result of this phase, real testing against live
  Supabase with throwaway credentials, explicit honesty about the confirmed Gradle/TLS build
  limitation, don't touch Firestore/web/other-feature migration yet.
- **Real architectural tension found and resolved before writing any code**: read
  `firestore.rules` directly and confirmed every Firestore read requires a live Firebase
  Auth session (`request.auth != null`), no bridge-free path — meaning moving auth fully to
  Supabase while leaving Firestore unmigrated (explicitly required this phase) would break
  every Clients/Machines/Jobs/Services/Knowledge Base/Status screen. Resolved with a
  deliberate, disclosed design: Supabase Auth is authoritative for login/identity;
  `AuthRepository.login()` additionally makes a best-effort, secondary Firebase Auth
  sign-in with the same credentials purely to keep the not-yet-migrated screens working,
  never allowed to fail the overall login. Documented prominently, not silently built.
- **Real, live, unexpected finding before designing the login flow**: queried production and
  found only 3 Supabase Auth users exist total — the 1 real admin (already migrated) plus 2
  unrelated leftover throwaway QA test accounts (`qa-fixes+admin-...`/`qa-fixes+technician-
  ...@invalid.local`, both active, real roles) that escaped cleanup in an earlier, unrelated
  session. This directly shaped the design (confirmed real users mostly can't log in via
  Supabase yet) and was flagged to the user, not silently deleted.
- **Deliberate dependency-risk decision**: implemented `SupabaseAuth.kt` using plain REST
  calls (`HttpURLConnection`/`org.json`, matching the already-proven `GoogleCalendarRepository.
  kt` pattern) rather than adding the third-party `supabase-kt` SDK — since this environment
  cannot resolve or verify new Gradle dependencies at all, an entirely new, unfamiliar SDK
  with an unverifiable dependency graph was judged too risky versus reusing an already-proven
  technique. Only added `implementation(libs.security)` — a dependency already declared in
  the version catalog but previously unused, zero new/unverified coordinates.
- **`Core.kt`'s `AuthRepository` rewritten with an identical public signature** — `login()`/
  `restore()`/`logout()` unchanged shape, so `MainViewModel`/`MainActivity.kt` needed zero
  changes. Session persistence uses Keystore-backed `EncryptedSharedPreferences` for the
  refresh token only (never a password), per `CLAUDE.md`'s Android conventions. Removed a
  now-dead Firestore-era mapper function and its now-unused import as a direct, necessary
  consequence of the rewrite (not scope creep).
- **Verified role/permission behavior needs zero new logic**: live-checked the real admin's
  `effective_permissions` — already the full, real 69-key list directly in Supabase data
  (same as under Firestore), so `CapUser.hasPermission()` (completely unchanged) keeps
  working correctly without a special-cased admin bypass.
- **Real testing executed, not just described**: `supabase/scripts/qa-verify-android-auth-rest-contract.mjs`,
  a throwaway test user, drove the *exact* HTTP requests the new Kotlin code makes against
  live production Supabase — 12/12 checks pass (valid login; wrong password; nonexistent
  account confirmed to get the identical generic error by design, not assumed; session
  restore; profile load; role/permission shape; unauthenticated access blocked at 401;
  logout with confirmed server-side refresh-token revocation, not just a local no-op;
  malformed-request error handling; full cleanup independently re-verified beyond the
  script's own self-report). One initial test assertion was itself wrong (expected 0 rows
  for an unauthenticated request; actual, safer behavior is an outright 401) — caught,
  fixed, re-run, not silently left failing or hand-waved past.
- **Disclosed plainly, not softened**: this environment still cannot run a real Android
  build (same confirmed TLS gap as Phase B, not re-attempted a third time since already
  conclusively established). Phase C's Kotlin code is verified by the live REST-contract
  test (the server-side behavior it depends on) plus careful manual review — explicitly
  itemized what could and couldn't be verified this way in
  `docs/android/ANDROID_SUPABASE_MIGRATION.md` §11.9, rather than blurring the line.
- Wrote the full Phase C section (11 sub-sections) into
  `docs/android/ANDROID_SUPABASE_MIGRATION.md`, matching the user's exact requested report
  structure (files changed, Firebase Auth removed/replaced, Supabase Auth implementation,
  session handling, user/profile mapping, permission/role mapping, tests executed, tests
  blocked, remaining Firebase Auth references, action items).
- Stopped after Phase C per explicit instruction — did not start Phase D.

## 2026-08-13 (same session, earlier) — Android→Supabase migration: Phase A audit + Phase B mapping/navigation foundation
- User authorized a **new, separate** migration project: `mobile-android/` off Firebase
  (Auth+Firestore) onto Supabase, explicitly distinct from the completed web cutover. Gave a
  detailed 21-section spec with an A-J phase structure, asked for Phase A (audit) only in the
  first turn.
- **Phase A — full audit, no code changed.** Read every Kotlin file in `mobile-android/`
  (`Core.kt`, `MainActivity.kt` in full, `GoogleCalendarRepository.kt`, the `ui/` package),
  `docs/android/android-app-plan.md` (a detailed pre-existing implementation log that
  corroborated and extended most independent findings), `build.gradle.kts`, manifest, and
  `res/`. Real findings: package (`com.CAPDATABASE.capdatabase`) vs. folder
  (`za.co.connoisseurauto.capmobile`) mismatch (pre-existing, deliberate, harmless); Room/
  WorkManager/DataStore all declared dependencies with **zero actual usage** anywhere (no
  offline cache exists despite the dependency); Firebase Storage also declared but unused
  (no photo upload feature exists); no `NavHost`/back-stack despite `navigation-compose`
  being declared (pure `remember`-state pseudo-routing); `GoogleCalendarRepository` confirmed
  dead (calls a Cloud Functions endpoint deleted from the web app 2026-08-12); zero launcher
  icon/logo assets exist at all (confirmed clean slate for the later logo/branding phase);
  "Users" screen is a bare read-only list, no real admin capability.
- **Phase B — full Firebase→Supabase mapping + real Navigation-Compose foundation code, no
  Firebase/Supabase data touched, no migrations applied, no Firebase deps removed yet.**
  - Read the full live Supabase schema (all `create table`/`alter table` statements across
    `0001`-`0023`) and did a **live read of the real `permissions` table** (60+ real keys)
    to precisely confirm which permission keys Android's hardcoded `destinations` list
    references actually exist in production, rather than assuming from migration file
    grep alone (which under-counted — most permission rows were seeded via a data-migration
    script, not SQL INSERTs).
  - Found real, itemized field-level schema gaps (not missing tables): `knowledge_machines`'s
    entire column set changed since Android's Firestore integration was last touched
    (`name`/`model`/`description` → `manufacturer`/`model_name`/`variant`/`product_code`/
    `category`/`summary`/`supported_refrigerants`/`technical_specifications`/
    `main_functions`); `knowledge_notes.body`→`content` rename; `knowledge_service_codes.
    code`→`service_code` rename; a possible `caption`/`title` mismatch in `knowledge_media`/
    `knowledge_documents` flagged for confirmation, not resolved; several newer columns
    (`machines.warranty_expiry`/`machine_type`, `service_records.service_date`/
    `work_performed`/`findings`/`photos`, `job_cards.job_number`/`date_received`/
    `arrival_photos`/`machine_type`) postdate Android's current screens.
  - Feature-triaged per explicit instruction not to blindly port every web feature:
    must-have (core CRUD, Log New Service/Book In, Knowledge Base, photo upload — flagged as
    the single biggest missing "genuinely mobile" feature), useful (Status screen, read-only
    catalogue lookup), web-only (Users/admin, Settings hub, Dashboard Notes, Invoice
    processing — explicitly flagged back, not silently ported).
  - Calendar: confirmed NOT recreating Google Calendar through Firebase (matches the web's
    own 2026-08-12 removal); recommended Android's Calendar screen read
    `service_records`/`machines`/`clients` directly from Supabase, no server-side service —
    same reasoning that resolved `dashboardNotes` earlier this session, applied here before
    any code was written, not after a wrong first attempt this time.
  - **Real code, not just a proposal**: `ui/navigation/CapNavRoutes.kt` revised to match the
    app's actual screen set (fixed stale/speculative Phase-1 scaffolding — a phantom separate
    "UpcomingServices" route that was never built, a missing "Users" route). `MainActivity.
    kt`'s `AdaptiveShell` rewritten to use a real `NavController`/`NavHost` (standard
    Google bottom-nav save/restore pattern), via a small label↔route-id adapter that leaves
    every existing screen composable, permission check, title, and all 13 distinct
    `onNavigate("label")` call sites completely unchanged — verified by grep that every
    label ever passed to `onNavigate` is covered.
  - **Disclosed, not hidden**: could not get a real Android build working in this
    environment — tried a second approach beyond Phase A's finding (directly invoking an
    already-cached alternate Gradle 9.2.1 distribution, bypassing the wrapper's own
    download), which also failed (Gradle Plugin Portal resolution, same TLS root cause).
    The navigation code is manually reviewed only, explicitly flagged as such rather than
    claimed as tested. See `KNOWN_ISSUES.md`.
  - Wrote `docs/android/ANDROID_SUPABASE_MIGRATION.md` (full mapping tables, RLS mapping,
    schema gaps, data-transformation notes, navigation architecture writeup, feature triage,
    Calendar recommendation, refined migration sequence, risks) as the durable Phase A/B
    record, matching this project's existing `docs/android/android-app-plan.md` convention.
- Stopped after Phase B per explicit instruction — did not proceed into Phase C
  (authentication) or any Firebase removal without review.

## 2026-08-13 (same session, earlier) — migration 0023 applied, full live authorization-matrix QA run: 24/24 pass
- User applied `supabase/migrations/0023_dashboard_notes_direct_rls.sql` via the SQL Editor
  and asked for the prepared live QA to actually be run (not just described as ready).
- **Confirmed applied via direct probe first** (not just trusting the report): a real insert
  with 2001-char content and a real insert with `color: 'purple'` both correctly threw
  `violates check constraint` errors against the live database.
- **Ran `supabase/scripts/qa-verify-dashboard-notes-rls.mjs` for real. Full itemized
  results, all against the live production Supabase project, 24/24 PASS:**
  - Create own note: creator — PASS. Create own note: other authenticated user — PASS.
    Create own note: administrator — PASS.
  - Attempt to create note attributed to another user: creator — PASS (blocked). Same for
    other authenticated user — PASS (blocked). Same for administrator — PASS (blocked, no
    admin bypass on insert-spoofing, as required).
  - `created_by_name` cannot be spoofed on insert — PASS (stored value matched the real
    caller's resolved profile name, not the spoofed value sent in the request).
  - Read notes: creator — PASS. Other authenticated user — PASS. Administrator — PASS.
  - Edit own note: creator — PASS. Administrator — PASS.
  - Edit another user's note: other authenticated user — PASS (blocked); independently
    re-read the row afterward and confirmed its content was genuinely unchanged, not just
    that the call errored.
  - Edit another user's note: administrator — PASS (succeeded, admin bypass working).
  - `created_by_name` unchanged after edits (including by a different user/admin) — PASS.
  - Delete another user's note: other authenticated user — PASS (blocked; verified the row
    still existed afterward via a service-role read, not just absence of an error).
  - Delete own note: creator — PASS. Delete another user's note: administrator — PASS.
  - `color` CHECK constraint rejects an invalid value — PASS (live constraint violation).
  - `content` length CHECK constraint rejects >2000 chars — PASS. Allows exactly 2000
    chars — PASS.
  - Full cleanup: zero residual test notes — PASS (0 left). Full cleanup: all 3 throwaway
    auth users deleted — PASS.
- **Independent post-hoc sweep, beyond the script's own self-report** (matching this
  project's established QA practice): queried `dashboard_notes` row count (0) and searched
  all auth users for any leftover `qa-dashnotes*` email (0 found) directly — confirmed
  clean, not just trusting the script's own exit code.
- **`frontend` checks, run fresh after**: lint clean, typecheck clean, tests 13/13 pass,
  build succeeds (exit 0).
- **Dashboard notes are now fully live in production** on direct Supabase Auth + RLS, zero
  server-side service, zero Firebase/GCP dependency of any kind. This closes out the
  `dashboardNotes` saga: Firebase Cloud Function → Cloudflare Worker → direct Postgres RLS,
  all three phases real, verified, same day.

## 2026-08-13 (same session, later still) — dashboardNotes redesigned again: Cloudflare Worker → direct Supabase Auth + RLS
- User asked directly: "Can Dashboard Notes safely use Supabase Auth + RLS directly?" —
  right after the Cloudflare Worker fix (below). Rather than defending the Worker just built,
  re-checked the ORIGINAL design rationale (`0017_dashboard_notes.sql`'s comment: "Postgres
  RLS alone can't express creator-or-admin... without a security-definer function") against
  this actual schema and found it wrong: `public.is_admin()` already existed
  (`0002_rls_policies.sql`), already security-definer, already the exact pattern used for
  `public.users`'s own "self or admin" policies and every other table in the schema.
  `dashboard_notes` was the one outlier.
- User gave detailed, explicit, numbered approval (10 items, including an exact
  authorization-matrix table to test) for a full switch to direct RLS. Built:
  - **`supabase/migrations/0023_dashboard_notes_direct_rls.sql`**: RLS policies (global
    read; insert only as self with NO admin bypass on spoofing `created_by`; update/delete
    by creator or `public.is_admin()`); `CHECK` constraints on `content` (≤2000 chars) and
    `color` (4 valid values — **rejects** invalid input, a deliberate behavior change from
    the retired code's silent fallback-to-yellow, documented per explicit instruction); a
    `BEFORE INSERT OR UPDATE` trigger resolving/pinning `created_by_name` server-side so it
    can't be spoofed via insert OR a raw update call (careful design point: the trigger only
    *resolves* the name on INSERT and *pins the existing value unchanged* on UPDATE — an
    early draft would have wrongly let an admin editing someone else's note silently
    overwrite that note's displayed author name to the admin's own).
  - **`frontend/src/api/dashboardNotesClient.js`** rewritten to call
    `supabase.from("dashboard_notes")` directly — same exported shape, `StickyNotes.jsx`
    needed zero logic changes (only its stale header comment updated).
  - **`workers/dashboard-notes-api/` deleted entirely** (git-tracked files removed cleanly;
    the empty parent directory itself resisted deletion due to a Windows file-lock, cosmetic
    only, doesn't affect git). `VITE_FUNCTIONS_BASE_URL` removed from both `.env` files
    (fully dead now, confirmed zero remaining references in `frontend/src`).
  - Also updated `CLAUDE.md`'s Worker-era references (written earlier this same session)
    back to reflect the final direct-RLS architecture — including a permission-model
    guidance addition: prefer RLS + `is_admin()`/`has_permission()` over a new server-side
    service by default.
- **Verified**: `frontend` lint/typecheck/test(13/13)/build all clean, zero "firebase" in
  the bundle. Confirmed live via a real, cleaned-up probe that 0023's constraints genuinely
  don't exist yet (not just assumed) before asking the user to apply it.
- **NOT yet live-tested against the real authorization matrix — genuinely can't be, not a
  gap**: per the established workflow (Queen Bee never runs DDL), 0023 must be applied via
  the SQL Editor before the live test can run. Wrote the full test script,
  `supabase/scripts/qa-verify-dashboard-notes-rls.mjs`, ready to go: creates 3 throwaway
  users with real signed-in sessions (required — the service-role client alone bypasses RLS
  and can't test it), exercises every cell of the approved matrix plus the
  `created_by_name`-spoofing check specifically, cleans up every note and auth user
  afterward regardless of outcome.

## 2026-08-13 (same session, later) — migrated dashboardNotes off Firebase Cloud Functions to a Cloudflare Worker, deleted `functions/` entirely
- **User correction, verbatim**: "can you stop worrying about sticky notes on firebase. we
  are long gone with firebase we use supabase now, so stop this is your last warning.
  everything new must be updated on supabase. i am done with firebase. it cost me too much
  unneccasry money." Root problem: Queen Bee had reported the sticky-notes GCP-billing
  blocker twice as something needing the user to *re-enable* GCP billing — exactly what the
  permanent Firebase-retirement policy (recorded earlier this same session) explicitly says
  never to do. The actual fix was to remove the Firebase dependency, not restore it.
- Confirmed `dashboardNotes`'s data was already 100% Supabase — Firebase Cloud Functions was
  only ever the *hosting platform*, a pure infrastructure choice. Migrated it to a new
  Cloudflare Worker, `workers/dashboard-notes-api/` (`src/{index,auth,dashboardNotes}.js` —
  business logic and every authorization rule ported byte-for-byte from the retired
  `functions/lib/dashboardNotes.js`, only the HTTP/config adapter changed: Fetch API
  Request/Response instead of Express-style req/res, plain Worker `env` bindings instead of
  `firebase-functions/params`).
- **`functions/` (the whole Firebase Cloud Functions dir) deleted via `git rm -r`** — never
  live in production the entire time it existed (blocked by the GCP billing lapse), so zero
  production impact. `firebase.json`'s `"functions"` entry removed; `firestore`/`storage`
  config **kept** (Android still depends on that Firebase project for its own rules).
- **Verified, not just written**: 26/26 new Worker unit tests (ported 1:1 coverage from the
  retired Firebase tests). `npx wrangler deploy --dry-run` confirms real bundling for the
  Workers runtime (729 KiB). `frontend` lint/typecheck/test(13/13)/build all clean after
  updating `dashboardNotesClient.js`'s comments and `.env.production`/`.env.example`'s
  `VITE_FUNCTIONS_BASE_URL`.
- **Real blocker found, disclosed rather than pushed through**: this environment's
  `wrangler` is authenticated as a different Cloudflare account than the one hosting
  production (`capdashboard.gerhardvanwijk.workers.dev`) — confirmed via the *already-live*
  `capdashboard` worker itself being unreachable via `wrangler deployments list` under these
  credentials, not just the new one. Did not attempt a real deploy or `wrangler secret put`
  with the wrong account. See `KNOWN_ISSUES.md` for exactly what the user needs to do.
- **While reviewing this**, also found and fixed dangling references in `CLAUDE.md`/
  `KNOWN_ISSUES.md` to `functions/index.js`'s header comment (for the still-separately-
  outstanding Google Calendar `firebase functions:delete ...` command) now that the file no
  longer exists — inlined the command directly instead.
- Added `CLAUDE.md` section 6.4: a permanent-policy summary (full text already in
  `DECISIONS.md`), so this rule survives even if a future session doesn't read agent memory
  carefully. Corrected an overstatement caught before it was saved: initially wrote the
  Android-Firebase-scope question as "confirmed web-app-only" — it is NOT confirmed, the
  user hasn't answered that question yet; fixed to say so honestly.

## 2026-08-13 (new machine session, continuation of "the phases") — pulled 20 commits, fixed stale node_modules, closed out Phase 9/10 audit, corrected Phase 11 status, formalized permanent Firebase-retirement policy
- Session started by pulling 20 commits this machine didn't have yet (full Supabase
  cutover, Google Calendar removal, UX redesign phases 1-8, Android visual redesign, this
  session's Settings/Products&Services/Customer Import work) — see `DECISIONS.md`/
  `PROJECT_STATE.md` for the substance; this entry covers what changed *in this session*.
- **User issued a formal, written, permanent policy**: Firebase is retired for CAP Dashboard,
  never to be reintroduced without explicit authorization, no exceptions for testing/
  convenience. Recorded in `DECISIONS.md` (2026-08-13 entry) and a new Queen Bee agent memory
  (`firebase_permanently_retired.md`). Flagged one real open question back to the user (not
  yet resolved as of this entry): the policy's text doesn't mention Android, which is a
  documented, separately-approved exception still fully on Firebase — asked directly, not
  assumed either way.
- **Fixed the local `ruv-swarm` MCP server** (unrelated to the app itself — local Claude Code
  tooling). Root cause: pinned `better-sqlite3@^11.6.0` has no prebuilt binary for this
  machine's Node v26.4.0, and compiling it from source fails (MSBuild). Fixed via a local
  wrapper install (`~/.claude/mcp-tools/ruv-swarm-fix/`) with an npm `overrides` bump to
  `better-sqlite3@^13` (ships a working prebuilt), registered as a **local-scope** MCP
  server (`~/.claude.json`, not the shared/committed `.mcp.json`) so it doesn't affect other
  machines. Verified: the server actually starts and emits `server.initialized`, not just
  "npm install succeeded."
- **"Continue with the phases" — closed out the remaining Phase 9/10 audit, corrected Phase
  11's status:**
  - `frontend/node_modules` was stale relative to the already-committed `package-lock.json`
    (missing `xlsx`, needed by `ImportCustomers.jsx`) — `npm run build` failed until
    `npm install` was run. Not a code bug, just this machine catching up after the pull
    (also dropped 79 now-unused packages — the old Firebase tree).
  - Swept remaining not-yet-individually-audited forms/pages (`MachineForm.jsx`,
    `ServiceForm.jsx`, `JobCardDetail.jsx`'s line-item form) plus a full-repo grep for the
    known bug classes (bare multi-column grids, fixed pixel widths, raw `<table>` usage,
    single-check-on-mount viewport logic). Found and fixed one real bug: `BookIn.jsx`'s Job
    Number/Date row used bare `grid-cols-2` (cramped on a 375px phone, and inconsistent with
    every sibling form's `grid-cols-1 sm:grid-cols-2`). Everything else checked out fine —
    the shared `Table` component already handles horizontal overflow, and the other bare
    `grid-cols-2/3` instances found are legitimately fine at those widths (short numeric
    field pairs, photo-thumbnail grids, stat rows), not bugs.
  - **Verified, not just written**: `frontend` lint (clean), typecheck (clean), test (13/13),
    build (clean, exit 0), and re-confirmed the production bundle contains zero "firebase"
    strings.
  - **Phase 11 (Android) status was stale in `ROADMAP.md`** ("in progress") — `git log`
    shows the actual redesign is already committed (`a1e4016`, `9cc1b52`). Attempted to
    independently re-verify the build per CLAUDE.md's "don't trust an old session's build
    claim" rule; **could not** — this machine's Gradle wrapper fails to download its
    distribution (TLS trust-chain error, unrelated to the app). Disclosed rather than
    re-claimed as tested; see `KNOWN_ISSUES.md`.
  - **Login.jsx's bespoke (non-design-system) styling remains a known, deliberately deferred
    item**, not silently dropped — flagged again as the one concrete candidate for Phase 12,
    left untouched pending the user's explicit go-ahead since it's a real layout/product
    decision (different structural pattern from the other auth pages), not a mechanical fix.
- Also reconciled 3 uncommitted Queen Bee memory files that had gone stale relative to the
  pulled history (described a pre-cutover state) and deleted one stray 0-byte Ruflo tooling
  artifact (`Postgres`, repo root) — see prior turn in this same session for detail.

## 2026-08-13 (cont. once more) — Jobs page bug fixed+tested, line-item edit added, Job Card Settings extended, Pastel importer hardened, responsive audit continued, Android redesign delegated
- User: "Continue... don't stop for approval except manual SQL." Worked through items 1-10
  of a large combined instruction continuously. Migration 0020's exact SQL was given to the
  user verbatim (only 2 columns) — **not yet confirmed applied as of this entry**, so its
  own re-verification step is still pending; everything else below does not depend on it
  and was completed in the meantime per the user's explicit "don't let one SQL step block
  unrelated work" instruction.
- **Jobs page (`Jobs.jsx`) — 2 real, confirmed bugs found+fixed, same root-cause class as
  the earlier JobCardDetail.jsx fix**: (1) `loadJobs()` called `JobCard.list()` alone —
  same "no auto-joined client/machine" gap as before — so EVERY job showed "Unknown
  Client"/"Unknown Machine" regardless of real data quality (confirmed via a live read-only
  check: all 4 real job cards have valid, non-orphaned client_id/machine_id — this was
  purely the frontend bug, not corrupt data). Fixed by fetching clients/machines once and
  joining client-side, mirroring JobCardDetail.jsx's fix. (2) The desktop table row's
  `onClick` only called `setSelectedJob()`, feeding a preview panel that ONLY renders at
  the `2xl` breakpoint (>=1536px) — on any normal desktop width (1024-1535px), clicking a
  row visibly did nothing. Fixed: click now always navigates directly to the Job Card
  (matching the mobile card list), hover/focus drives the 2xl preview panel instead, and
  real keyboard accessibility was added (tabIndex, role="link", Enter/Space navigates).
  **Live-verified 7/7** (`supabase/scripts/qa-verify-jobs-page-fix.mjs`, throwaway data,
  fully cleaned up).
- **Real, disclosed finding (not fixed without approval)**: 3 of the 4 real job cards in
  the live database are leftover `JOB-CODEX-E2E-...` artifacts from a prior automated test
  harness (not created this session) — cluttering the real Jobs page. Flagged to the user,
  not deleted (business-record deletion needs explicit approval).
- **Job Card line-item editing was entirely missing** — only Add/Delete existed, no way to
  edit an existing line's quantity/price/description. Added real edit-in-place (reuses
  `AddLineForm` in edit mode via a new `initial` prop, wired to `JobCardLine.update()`).
  **Full workflow live-verified 13/13** (`supabase/scripts/qa-verify-jobcard-full-workflow.mjs`):
  add service, add product, refresh, both persist, invoice subtotal/VAT/total all correct,
  edit a line's quantity, refresh, edit persists, invoice recalculates, remove a line,
  refresh, removal persists, remaining total correct, AND confirmed accounting integrity —
  editing a catalogue item's price afterward does NOT retroactively change an
  already-saved line item's stored price.
- **`machine_type` was a completely dead write path** — real column, displayed as a badge
  on `MachineDetail.jsx`/`ClientDetail.jsx`, but `MachineForm.jsx` (used for both Add and
  Edit Machine) never had a field for it. Fixed; live-verified via a direct insert/read/
  cleanup (no migration needed, column already existed).
- **Settings > Job Cards extended** with 2 more real, bounded, admin-editable lists (per
  explicit request: "job statuses", "service types") — new
  `supabase/migrations/0021_job_card_settings_statuses_and_line_types.sql` (NOT yet
  applied), adding `job_card_settings.available_statuses`/`line_types` (both jsonb arrays,
  defaulting to the EXACT values already hardcoded, so applying changes nothing visually
  until an admin edits them). Deliberately did NOT make `job_cards.status`/
  `job_card_lines.line_type` themselves dynamic/enum — too invasive (Jobs.jsx/InvoiceQueue
  have hardcoded status-string business logic in several places) for the value; only the
  *lists offered in the UI* are configurable, safely, since the existing badge/variant maps
  already have safe fallbacks for unmapped strings. `JobCardDetail.jsx` wired to read from
  settings with a fallback to the original hardcoded constants; `JobCardSettingsPanel.jsx`
  got a small reusable `TagListEditor` (add/remove, min 1 item) with a graceful "not
  available until 0021 applied" message if the columns don't exist yet.
- **Notes (item 5): confirmed still blocked on infrastructure, not code** — sent a live
  OPTIONS request to the `dashboardNotes` Cloud Function URL, got 404 (not deployed),
  confirming the GCP billing blocker documented earlier is still in effect. The
  ClientDetail.jsx fix from earlier this session is implemented and RLS-verified
  (defense-in-depth, 18/18 suite) but genuinely cannot be end-to-end tested until the user
  re-enables GCP billing and redeploys Cloud Functions — this is not something Queen Bee
  can resolve.
- **Responsive audit (item 8) continued, not yet exhaustive**: systematically grepped every
  page for `<table>` usage (only 2 exist, both already fixed earlier this session), bare
  (non-responsive) `grid-cols-3+`, and fixed pixel widths. Found+fixed:
  `ProductsServicesSettings.jsx`'s 3-equal-column form row (Category/Price/VAT) was cramped
  in a max-w-md dialog on mobile — now stacks below `sm:`. `Login.jsx` had a fixed 176px
  bottom-padding decorative panel that, once the responsive grid stacks to 1 column on
  mobile, sat directly above the login form as pure dead space — reduced on mobile,
  restored at `lg:`; also tightened fixed 40px horizontal padding to `px-6 sm:px-10`.
  **Real, disclosed finding, not fixed**: `Login.jsx` (unlike Register/ForgotPassword/
  ResetPassword, which share the properly-redesigned `AuthLayout.jsx`) is a bespoke page
  using old hardcoded hex colors and typography classes, NOT the shared design-system
  tokens (`bg-card`/`text-foreground`/`font-heading` etc.) used throughout the rest of the
  redesigned app — visually inconsistent with the rest of the product. Not redesigned this
  pass (large, sensitive, separate undertaking) — flagged for a future phase.
- **Pastel Customer Import (item 10) hardened significantly** after actually running the
  exact kind of synthetic test file the user's own spec calls for (1 valid, 1 exact
  duplicate, 1 missing-optional-fields, 1 missing-required-data, 1 possible-duplicate-with-
  different-formatting) through the real `xlsx` parse -> map -> preview pipeline — this
  found 2 real gaps, not just confirmed the happy path: (1) **intra-file duplicates were
  never checked at all** — only DB-vs-row, not row-vs-earlier-row-in-the-same-file; two
  identical rows in one spreadsheet would both have imported as separate new clients. Fixed
  via a growing "known pool" in `buildPreview()` that includes already-processed
  new rows. (2) **name-similarity matching was too strict** — "XYZ Air Con (Pty) Ltd" vs an
  existing "XYZ Aircon (Pty) Ltd" (a realistic real-world spacing variant) wasn't flagged.
  Fixed via a new `normalizeNameLoose()` (strips all whitespace/punctuation) used only for
  the possible_duplicate signal, never exact_match. Also added explicit named mapping
  targets for `mobile`/`postal_address`/`vat_number` (previously only reachable via a
  generic "keep extra column" mechanism that `ImportCustomers.jsx` never actually wired
  up — meaning any unmapped column, including VAT numbers, was silently dropped until this
  fix) — all three now route into clearly labelled lines in the existing `notes` column
  (no new clients columns invented, per instruction). Re-ran the exact synthetic file after
  fixing: now correctly reports new:2, exact_match:1, invalid:1, possible_duplicate:1 —
  matching the user's own spec exactly. 13/13 unit tests pass (was 11, +2 new). Real
  Pastel file still not provided — nothing imported into production.
- **Android (item 9): audit confirmed genuinely healthy, then delegated the real redesign**
  (not just another audit) to `android-ui-bee`. Verified directly (build artifacts, not
  agent self-report): `assembleDebug` succeeded (real APK present), 4/4 unit tests pass,
  lint 0 errors/28 warnings, zero Supabase references anywhere in `mobile-android/app/src`.
  **Real architecture finding**: the entire app UI lives in ONE 2321-line `MainActivity.kt`
  (~35 Composables), not separate per-screen files. Found a partially-built, UNUSED
  design-system starter kit already sitting in the repo (`ui/theme/Cap*.kt` — colors
  explicitly extracted from the real web app's Tailwind tokens — `ui/components/Cap*.kt`,
  `ui/navigation/Cap*.kt` including bottom nav scaffolding) — real, usable groundwork,
  not something to rebuild from scratch. Also found (flagged, not fixed — too risky
  mid-redesign): `Color.kt` declares `package com.CAPDATABASE.capdatabase.ui.theme` but
  lives under a `za.co.connoisseurauto.capmobile` directory tree — inconsistent but
  evidently harmless (build succeeds). Delegated the actual visual redesign (leverage the
  existing Cap* kit, apply it screen-by-screen across MainActivity.kt, proper mobile-native
  UX, optionally split into separate screen files if low-risk) to a new `android-ui-bee`
  agent — running in the background, results not in as of this entry.
- **Process note on subagents this session**: attempting to "continue" a previously-spawned
  agent by calling Agent again with the same `name` does NOT resume it in this environment
  — it spawns an entirely new agent (`android-audit-bee` -> `-2` -> `-2-2`), restarting
  whatever it was doing. Stopped retrying after noticing this and instead verified the
  Android audit's real results directly from build output artifacts
  (`app/build/test-results/`, `app/build/reports/lint-results-debug.xml`,
  `app/build/outputs/apk/debug/`) rather than trusting/re-requesting an agent self-report.
  Worth remembering: prefer checking real artifacts over re-spawning when an agent seems
  stuck/idle.
- **Verified, every step, throughout**: `frontend` lint/typecheck/test(13/13)/build clean,
  repeated after every file group. Live Supabase QA re-run at the end of the session,
  still 18/18 (no regression from the later Jobs/MachineForm/Settings changes, which don't
  touch anything that suite covers directly, but re-run for confidence anyway). Cleaned up
  ~12 more stray shell-artifact files from inline node -e commands with special characters
  (same longstanding recurring pattern, not application code).
- **Not done / explicitly deferred**: migration 0020 application still pending user
  confirmation; migration 0021 not yet applied either; Notes end-to-end blocked on Cloud
  Functions billing (not a code fix); Login.jsx's design-system inconsistency not resolved;
  responsive audit not exhaustive (Dashboard/Clients/MachineDetail/UpcomingServices/
  UserAdmin/KnowledgeBase not individually walked page-by-page this pass, only grepped for
  the specific anti-patterns); Android redesign in progress, not complete; real Pastel file
  still not provided/imported; no browser-based visual/click-through QA anywhere (still no
  browser tool this session, disclosed throughout rather than assumed away).

## 2026-08-13 (cont. yet again) — Live QA (18/18 pass), Calendar phase reviewed+fixed, 2 more real photo bugs found+fixed, responsive audit
- Continuation of the same-day redesign-resume session, user: "continue with all the phases."
- **Confirmed migrations `0018`/`0019` were applied by the user** (live read-only check via
  new `supabase/scripts/qa-check-0018-0019-applied.mjs` — all 6 checks OK).
- **Ran real scripted QA against live Supabase** (new, reusable
  `supabase/scripts/qa-verify-2026-08-13-fixes.mjs`; no browser tool available): throwaway
  admin + technician test users, throwaway client/machine/job card. **18/18 checks pass**
  after fixing 2 test-methodology mistakes (Postgres RLS denies SELECT/no-op UPDATE
  silently, not always via a thrown error — re-verified via the service-role client
  instead of just checking for `error`). Confirmed live: the Job Card line-item fix (add 2
  lines, refetch exactly as `JobCardDetail.jsx` does, both present; delete 1, refetch,
  correctly 1 remains; total calculates correctly); `products_services`/
  `job_card_settings` RLS (technician can read both, cannot write either; admin can write
  both via `is_admin()` bypass); `dashboard_notes` correctly still deny-all even for an
  admin-role authenticated client (only the still-undeployed Cloud Function can reach it —
  known, unrelated blocker); `client_imports`/`legacy_pastel_customer_code` (duplicate
  code correctly rejected by the new unique index; technician correctly denied writing
  import history). Full residual-data sweep after: zero leftover QA rows/users.
- **Calendar (Phase 8 / section H) reviewed against the user's specific checklist — found
  already substantially done** (nav/Today/date header/event styling/service-record data/
  client-machine context/status badges/no Google code/mobile toolbar wrapping were all
  already present from the earlier Phase 8 commit). **One real, small gap found+fixed**:
  `CalendarPage.jsx`'s `initialView` (list view on mobile vs. grid on desktop) was only
  ever evaluated once at mount — resizing/rotating past the 640px breakpoint never
  switched view. Fixed via FullCalendar's `windowResize` hook.
- **Phase 9 (Forms/Modals) audit found 2 more real, pre-existing bugs matching Bug B's
  exact class** (display code already existed expecting data that was never written) —
  both previously flagged-not-fixed in the 2026-08-06 migration investigation
  (`docs/ai-memory/PROJECT_STATE.md`), now actually closed: `service_records.photos` and
  `job_cards.arrival_photos` never had Postgres columns; `LogServiceModal.jsx`'s
  `handleSubmit()` uploaded photos but never included them in the create payload;
  `BookIn.jsx` stuffed photo URLs into `technician_notes` as plain text instead of the
  dedicated field `JobCardDetail.jsx` already renders as a gallery. New
  `supabase/migrations/0020_service_and_job_card_photos.sql` (NOT yet applied) adds both
  columns; both write paths fixed to actually use them. `AddClient.jsx` reviewed — already
  well-built (sectioned, labelled, responsive, proper error/disabled states), no changes
  needed.
- **Responsive audit (Phase 10, code-level only — no browser tool this session, disclosed
  explicitly rather than claiming visual verification) found 2 real overflow bugs**, not
  assumed from Tailwind classes alone: `InvoiceQueue.jsx`'s line-items table wrapper used
  `overflow-hidden` (clips a 5-column table on narrow phones instead of scrolling);
  `ImportCustomers.jsx`'s preview table wrapper combined `overflow-hidden` with
  `overflow-y-auto` on the same element, which only frees the y-axis in CSS — the x-axis
  stayed clipped. Both fixed with a nested `overflow-x-auto` wrapper.
- **Delegated to `testing-bee` (background, in progress as of this entry)**: Android build/
  health audit — `gradlew.bat testDebugUnitTest lintDebug assembleDebug`, a scan for any
  accidental Supabase reference leaking into `mobile-android/`, and a current
  screens/navigation inventory — the correct bounded first step of Phase 11 before any
  visual redesign work, per the user's own instructions (verify build/Firebase/auth/CRUD
  first). Results not yet in as of this entry — check the agent's report before assuming
  Android is healthy.
- **Verified, every step**: `frontend` lint/typecheck/build clean after every file group
  this session (multiple full passes); live Supabase QA 18/18 (above). Cleaned up 2 more
  stray shell-artifact files (`supabase/u.email))`, `supabase/{})`).
- **Explicitly NOT done yet**: migration `0020` not applied; no live QA of the new photo
  fields (can't test until applied); no actual visual/browser confirmation of the
  responsive fixes (code-level reasoning only, disclosed); Android testing-bee results
  pending; phases 9's remaining forms (MachineForm.jsx, EditClientForm, etc.) not
  individually audited beyond AddClient.jsx; Phase 12 (final polish) not started; real
  Pastel spreadsheet still not provided/imported.

## 2026-08-13 (cont. again) — UX redesign resumed: 2 real functional bugs found+fixed, Job Card Settings/Products & Services/Customer Import built
- Objective: user resumed the paused UI redesign (paused for the Firebase->Supabase
  migration) with a large combined instruction set (dashboard greeting, a Job Card
  line-item bug, a Notes bug, new Job Card/Products&Services Settings, a Customer Import
  feature, continue redesign phases, later Android). Worked through as much as was
  genuinely verifiable in one session rather than fabricating completion of every item —
  see below for what's real vs. what's still open.
- **Found a real discrepancy worth flagging explicitly**: the user's framing said "already
  completed: Phase 1-4" and asked to continue from Phase 5. `git log` shows Phases 5
  (Jobs/Service Records/Job Card Detail), 6 (Knowledge Base), 7 (User Admin), and 8
  (Calendar) all already have their own redesign commits, predating this session. Redesign
  phases 5-8 are NOT starting points — they're already done. Only phases 9 (Forms/Modals),
  10 (responsive pass), 11 (Android), 12 (final polish) are genuinely not started.
- **Bug B (Job Card products/services not appearing) — root-caused and fixed, real bug
  confirmed in code, not cosmetic.** `frontend/src/api/supabaseApiClient.js`'s
  `entities.JobCard.get()` (and `JobCardService.get()` in `entities.js`) only ever return
  the bare `job_cards` row — no auto-embedded `lines`/`job_card_lines`/`client`/`machine`
  the way the old Firebase/base44 SDK layer implicitly provided. `JobCardDetail.jsx`'s
  `load()` read `job.lines || job.job_card_lines`, always `undefined` post-cutover, so a
  successfully-created `job_card_lines` row (the write itself was never broken) never
  rendered, and the client/machine header info was blank too. **Fixed**: `load()` now
  explicitly fetches `job_card_lines` via `JobCardLine.filter({job_card_id: id})` and
  resolves `client`/`machine` from the already-loaded lists. Confirmed `InvoiceQueue.jsx`
  was NOT affected — it already fetches `JobCardLine.list()` directly and filters
  client-side, so invoices were already showing real persisted line items correctly; only
  the Job Card Detail page itself was broken.
- **Bug F (Notes not linked to customer) — root-caused and fixed.** Dashboard "Link
  client" notes (`StickyNotes.jsx`) correctly persist `client_id` via the `dashboardNotes`
  Cloud Function — the write path was never broken. But `ClientDetail.jsx` never queried
  `dashboardNotesClient` at all, so a note linked to a client from the Dashboard was never
  displayed back on that client's own page — a one-way link. **Fixed**: `ClientDetail.jsx`
  now loads all dashboard notes, filters by `client_id === id`, displays them via the
  shared `NoteRecord` component (author/date/body, no chat styling), and can create new
  notes pre-linked to the client directly from the page. Edit/delete respects the same
  creator-or-admin rule as the Dashboard's own notes.
- **New: Products & Services catalogue + Job Card Settings (real schema gap closed, not
  duplicated).** Confirmed via full migration review that no products/services table ever
  existed — `job_card_lines` has always been entirely free-text. New
  `supabase/migrations/0018_products_services_and_job_card_settings.sql` (NOT yet applied
  — needs the SQL Editor): `products_services` table (type/name/description/sku/category/
  unit_price/vat_rate/is_active), a nullable `job_card_lines.catalog_item_id` traceability
  FK (line items already store their own description/price independently, so editing or
  archiving a catalogue item never rewrites historical lines/invoices), a singleton
  `job_card_settings` row (numbering_prefix/default_status/default_line_quantity/
  allow_products/allow_services — every field is read by real frontend code, not a
  placeholder), and a new `settings.access` permission (admins get it automatically via
  `is_admin()`'s bypass in `has_permission()`; every other role is denied by default).
  Frontend: new `/settings` route + nav item (permission-gated), `Settings.jsx` hub with
  General/Job Cards/Products & Services/Data Management/Users & Roles/System tabs (empty
  sections say so honestly, no fake toggles), `JobCardSettingsPanel.jsx`,
  `ProductsServicesSettings.jsx` (full CRUD, archive instead of delete). Wired into real
  behavior: `JobCardDetail.jsx`'s `AddLineForm` now has an optional catalogue picker
  (respects `allow_products`/`allow_services`, still allows full custom entry);
  `BookIn.jsx` now uses `numbering_prefix`/`default_status` for new job numbers/status
  instead of a hardcoded `"JOB-"`/`"Booked In"`.
- **New: Customer Import (Settings > Data Management > Import Customers) — built as a
  permanent, reusable feature, not a one-off script**, per explicit instruction. No real
  Pastel spreadsheet was provided this session, so nothing was actually imported — this is
  the tooling, tested against synthetic data only. `frontend/src/lib/customerImport.js`
  (pure logic, framework-free): header-synonym column-mapping guesser, row normalization
  (trims whitespace, lower-cases email, doesn't rewrite legitimate text), conservative
  3-tier duplicate classification (new / possible_duplicate on name-only match /
  exact_match only on customer-code, email, or normalized-phone match) — 11/11 new unit
  tests in `frontend/tests/customerImport.test.js` (this repo's first test file with real
  content since the Firebase-compat test was deleted in the cutover). UI wizard
  (`ImportCustomers.jsx`): Upload -> Map Columns (auto-pre-selected, editable) -> Preview
  (per-row status + reason, checkboxes, nothing writes yet) -> Import -> summary. New
  `supabase/migrations/0019_client_imports.sql` (NOT yet applied): `client_imports`
  history table (one row per run) + `clients.legacy_pastel_customer_code` (nullable,
  unique-when-present, the strongest repeat-import dedup signal) + reused `clients.import`
  permission. Added `xlsx` (SheetJS) as a new frontend dependency.
- **Verified, every step, not just written**: `frontend` `npm run lint`/`typecheck` clean
  after every file group; `npm test` 11/11 (new); 3 separate full `npm run build`s (exit 0)
  at different points in the session. Cleaned up 7 more stray 0-byte shell-redirection
  artifacts (`frontend/Data`, `frontend/Job`, `frontend/m.id`, `frontend/r.status`,
  `frontend/updatePassword(newPassword)`, `frontend/{,+`, `{,`) — same recurring pattern
  flagged repeatedly in past sessions, not application code, not committed.
- **Explicitly NOT done this session** (see KNOWN_ISSUES.md/ROADMAP.md for the full list):
  migrations `0018`/`0019` not applied (needs the user via SQL Editor — nothing in this
  entry is live yet); no live click-through QA (no browser tool available, no scripted
  Supabase QA run either — should be the very next step before trusting this beyond
  code-level verification); Calendar phase review against section H's specific checklist;
  redesign phases 9-12; Android audit/redesign (section L); real Pastel spreadsheet
  inspection/import (needs the user to actually provide the file).

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
