# Decisions

## 2026-08-16 — Android's Firebase→Supabase migration reaches completion; Firebase removed entirely from `mobile-android/`
- Decision: with `"users"` (the last Firestore-routed collection, see the two 2026-08-14 entries
  below) moved onto Supabase earlier the same day (`b8aaaee`), and the Status screen's health
  check moved off a now-stale Firestore probe (Phase 11, `2eb9f33`), every real reason for
  Firebase to remain in the Android codebase was gone. Rather than leave the dead code/
  dependencies in place indefinitely, removed them in one dedicated commit (`408fe0e`):
  `observeFirestoreCollection()`, `FirebaseModule`, `AuthRepository`'s Firebase Auth login
  bridge, `SUPABASE_MIGRATED_TABLES` (no longer meaningful with one backend), the now-unused
  Firebase-specific error-mapping functions, the `firebase-*` Gradle dependencies, the
  `google-services` plugin, and `app/google-services.json`.
- Reason: per this project's own git-discipline convention (see the 2026-08-13 dashboard-notes
  entries below for the same pattern), dead code accumulates real cost even when inert —
  confusion for future readers, a larger attack/audit surface, and an actively misleading
  `CLAUDE.md`/architecture picture (section 6.2 said "remains on Firebase" right up until this
  decision). Once the underlying blocker (Firestore data dependency) was gone, there was no
  reason to defer the cleanup further.
- Verification, not just assertion: a full **clean** Gradle build (`BUILD SUCCESSFUL`);
  `:app:dependencies --configuration debugRuntimeClasspath | grep -i firebase` returning zero
  output; the actual built APK extracted and all 9 dex files + `AndroidManifest.xml` +
  `resources.arsc` grepped for "firebase" case-insensitively, zero matches; APK size dropped
  ~4.6MB (26,286,963 → 21,668,520 bytes), consistent with a whole SDK actually leaving the
  package rather than just source-level removal. Unit test baseline correctly dropped 23→16 (the
  7 deleted tests belonged to `ObserveFirestoreCollectionFailurePolicyTest.kt`, which tested the
  now-deleted function — not a coverage regression).
- Affected files/systems: `mobile-android/app/src/main/java/.../Core.kt`, `app/build.gradle.kts`,
  root `build.gradle.kts`, `gradle/libs.versions.toml`, `app/google-services.json` (deleted),
  `app/src/test/.../ObserveFirestoreCollectionFailurePolicyTest.kt` (deleted). `CLAUDE.md`
  (sections 6.2/6.3/6.4/9 and the Supabase/Firebase coding-convention subsections) and
  `mobile-android/README.md`/`docs/migration/FIREBASE_DEPENDENCIES.md` updated to match.
- Consequences: any future Android work can assume a single backend (Supabase) with no Firebase
  fallback path to reason about. The old Firebase project (`capdatabasefb2`) and its data are
  **not** affected by this — that's a separate, still-open, user-owned decision (archive/keep/
  delete), unrelated to removing the Android app's *code* dependency on it (see CLAUDE.md 6.3).
- Reversal conditions: none anticipated — this closes out a migration that was already
  substantially complete; reintroducing Firebase would need a new, separate decision with its
  own justification, not a reversal of this one.
- Not done as part of this decision: `mobile-android/app/src/androidTest/.../
  LiveFirebaseSmokeTest.kt` (pre-existing, already-stale instrumented test, doesn't import any
  real Firebase class, didn't need to change for this removal to succeed) — left as disclosed,
  deferred cleanup.

## 2026-08-14 — Android `"users"` Firestore listener gets a stricter-than-Supabase reliability policy (never closes, not even on cold start)
- Decision: `RecordsRepository.observeFirestoreCollection("users")` (`Core.kt`) was fixed to
  never call `close()` on a Firestore listener error — it degrades to last-known-good/empty data
  and retries every 20s. This intentionally diverges from `SupabaseDataRepository.
  observeCollection()`'s policy, which still closes on a failure before the first-ever emission
  (cold start).
- Reason: `"users"` is combined into the same shared `combine()` flow as every must-have Supabase
  table, but is itself an optional, permission-gated legacy screen. Its real failure trigger —
  `firestore.rules:31`'s `allow list: if isAdmin()` disagreeing with Android's Supabase-based
  `users.view` permission check — is not transient; it fails identically on every attempt
  including the first. Applying the Supabase cold-start-closes rule here would have reproduced
  the exact cross-table blast-radius bug this fix exists to close, for the real account it
  affects.
- Affected files/systems: `mobile-android/.../Core.kt` only. No Firestore rules, Supabase schema,
  or product behavior changed.
- Consequences: the Users screen can now silently show stale/empty data indefinitely under a
  permanent authorization failure, with no user-visible or logged signal beyond the empty list
  (flagged by `testing-bee` as a non-blocking follow-up, not fixed this round). No backoff exists
  under a permanent failure (retries every 20s indefinitely while the app is foregrounded) —
  judged acceptable since denied reads are cheap and match the existing Supabase poller cadence.
- Reversal conditions: revisit if `"users"` is ever migrated to Supabase (the whole function goes
  away) or if telemetry/backoff is later deemed necessary.

## 2026-08-14 — `"users"` Firestore collection determined to be an intentional transitional dependency (Option C), not a missed migration or obsolete
- Decision/finding: a read-only architectural audit (Queen Bee, `migration-audit-bee` unavailable
  this session) determined the Android `"users"` Firestore collection is intentionally retained
  during the migration as a transitional dependency — not a forgotten/missed migration item (B),
  and not obsolete/removable (D). The signed-in user's own profile/role/permissions have been
  fully on Supabase (`public.users`) since Phase C; only the separate read-only "Users" admin-list
  screen still reads Firestore.
- Reason: `Core.kt`'s own pre-existing comment already documented this as "a known, disclosed,
  temporary artifact... resolved once Firestore itself migrates in a later phase." The migration
  doc maps `users → public.users` as a real planned equivalent (table already exists, already
  used by web's `UserAdmin.jsx`), but no phase E–J explicitly owns finishing that migration, and
  separately flags the feature as "web-only... borderline-unnecessary" for mobile.
- Consequence: the eventual resolution (migrate the list to `public.users`, vs. remove the screen
  entirely) is a genuine open product decision, deliberately NOT made as part of this finding or
  the subsequent reliability fix.
- Affected files/systems: none directly (audit only); informed the reliability-fix decision above.
- Reversal conditions: n/a — this is a factual determination about current intent, not a policy;
  supersede only if the user makes the migrate-vs-remove decision explicitly.

## 2026-08-14 — Worker-bee roster redesigned for the formal Android→Supabase migration; `integration-sync-bee` replaced by `supabase-android-bee`, new read-only `migration-audit-bee` added
- Decision: `.claude/agents/integration-sync-bee.md` (previously scoped to Android's
  Firestore-only `Core.kt` connection/sync-status logic) was deleted and replaced by
  `.claude/agents/supabase-android-bee.md`, scoped explicitly to Android's Supabase
  Auth/Postgres integration layer (`SupabaseAuth.kt`, `SupabaseData.kt`, `Core.kt`
  repositories/Hilt) — including RLS-respecting query design and migrating remaining
  Firebase-backed screens/repositories onto the shared Supabase backend `frontend/` already
  uses live. Reason: explicit, detailed user instruction ("do not simply rename Firebase
  terms to Supabase — redesign the agent responsibilities and rules around the actual
  migration architecture").
- Decision: added `.claude/agents/migration-audit-bee.md`, a fourth agent with only
  `Read`/`Glob`/`Grep` tools (no `Edit`/`Write`/`Bash`) — an independent, read-only auditor
  that greps the Android project for leftover Firebase architecture, UI-layer database access
  bypassing repositories, Android/web Supabase schema mismatches, exposed credentials, and
  swallowed-error/mock-data anti-patterns, then reports under a fixed heading structure
  (FIREBASE REMAINING / SUPABASE COMPLETE / MIGRATION RISKS / BLOCKERS / LEGACY CODE /
  SECURITY CONCERNS / TESTING GAPS / RECOMMENDED NEXT ACTIONS). Reason: user explicitly
  requested a dedicated auditor to catch migration problems the implementation bees might
  self-report optimistically or simply miss.
- Also updated: `android-ui-bee.md` (tightened its Firebase/Supabase-boundary language and
  strict-boundary "MUST NOT" list per the user's spec), `testing-bee.md` (added an explicit
  RLS-testing checklist, "admin-account success is not proof of correct RLS" rule, and
  migration-status-awareness section), and `queen-bee.md` (updated the `Agent()` tool's
  allowed-agent list, delegation guidance, and cross-agent coordination example for the new
  4-bee roster).
- Scope note: this task only touched `.claude/agents/*.md` and `docs/ai-memory/`
  (`ARCHITECTURE.md`'s worker-bee-ownership section, this file, `SESSION_LOG.md`) — no
  `mobile-android/` application code was changed as part of this redesign.
- Consequence: any future delegation of Android Supabase/data-layer work must target
  `supabase-android-bee`, not `integration-sync-bee` (which no longer exists). Any future
  session auditing Android migration progress should consider using `migration-audit-bee`
  rather than reasoning about migration completeness from memory alone.

## 2026-08-14 — Android Phase D: core data migrated to Postgres via a backend swap, not a full rebuild; stopped before Phase E–J despite a broader instruction
- Decision: `clients`/`machines`/`service_records`/`job_cards`/`job_card_lines` now read/
  write live Postgres (via new `SupabaseData.kt`, PostgREST/plain REST, matching Phase C's
  `SupabaseAuth.kt` precedent) instead of Firestore. Reason: this is the "core data" slice
  the user's own A–J phase plan calls Phase D, and Phase C had already established the
  auth/token foundation it needs.
- Decision: implemented as a pure backend swap underneath the existing `CapRecord`/
  `RecordsState` generic shape, NOT the larger rebuild (typed `@Serializable` models + real
  nested `NavHost` routes for all 5 master-detail screens) originally sketched in
  `ANDROID_SUPABASE_MIGRATION.md` §6/§9. Reason: verified via grep, before writing any
  repository code, that the screens already read the current (post-`0008`/`0010` migration)
  Postgres column names — meaning zero screen changes were needed for a working migration,
  and the higher-risk full rebuild could be deferred rather than rushed in an unsupervised
  overnight session. Reversal condition: revisit typed models + nested routes as their own
  scoped follow-up phase, not blocking Phase D's functional completeness.
- Decision: "observe" (the Firestore real-time-listener replacement) is polling (20s) plus an
  immediate refresh on the signed-in user's own writes, not true real-time push. Reason:
  real-time push over Supabase requires either the `supabase-kt` SDK or a hand-rolled
  Postgres-changes WebSocket client — both judged too much unverified risk to add in an
  environment that can't verify new Gradle dependencies at all, consistent with Phase C's
  same reasoning for auth. Reversal condition: revisit once either the SDK can be verified in
  a working build environment, or a real product need for sub-20s cross-device sync emerges.
- Decision: stopped after Phase D despite the user's later, broader instruction ("run through
  all the phases and commit and push... I want to wake up and see progress"). Reason: Phases
  E–J each have a real, distinct blocker (Phase E needs the same live-verified rigor Phase D
  just got, plus genuine new photo-upload feature work; F/G are human design work and G has
  no source logo asset anywhere in the repo; H needs a real compiler this environment doesn't
  reliably have; I is explicitly gated by a standing prior instruction on verified D/E parity,
  which doesn't exist yet; J depends on I) — attempting all of them unsupervised risked
  handing back a broken, un-buildable app by morning, the opposite of the user's actual goal.
  Full per-phase reasoning: `docs/android/ANDROID_SUPABASE_MIGRATION.md` §12.9. This is an
  explicit, disclosed judgment call, not silent scope-cutting — reversible any time the user
  wants Phase E started.
- Consequences: Phase D is live-REST-verified (16/16,
  `qa-verify-android-phase-d-rest-contract.mjs`) but not independently Queen-Bee-compiler-
  verified — only the user's own Android Studio GUI build (done on the Phase C+D combined
  tree, not re-run after Phase D's specific edits) confirms it actually compiles. Real
  finding surfaced along the way: RLS on these 5 tables requires `effective_permissions` to
  actually be populated per user, not just a role — already-known gap (most real Android
  users lack a Supabase Auth account at all), reconfirmed here at the data-write layer too.

## 2026-08-13 (same session, later still) — Android Phase C: authentication migrated to Supabase Auth, Firebase Auth kept as a temporary bridge
- Decision: `mobile-android/`'s login/session/identity now runs on **Supabase Auth +
  `public.users`**, authoritatively — not Firestore. Implementation: a new
  `SupabaseAuth.kt` (`SupabaseSessionStore` using Keystore-backed
  `EncryptedSharedPreferences` for the refresh token only, never a password;
  `SupabaseAuthRepository` making plain REST calls to Supabase's Auth/PostgREST endpoints,
  matching the existing `GoogleCalendarRepository.kt` pattern rather than adding the
  third-party `supabase-kt` SDK — deliberate, since this environment cannot verify new
  Gradle dependency resolution at all). `Core.kt`'s `AuthRepository` rewritten but kept an
  **identical public signature**, so `MainViewModel`/`MainActivity.kt` needed zero changes.
- **Real architectural finding, resolved deliberately, not glossed over**: `firestore.rules`
  was read directly and confirmed to hard-require a live Firebase Auth session for every
  Firestore read, with no anonymous/bridge path. Since Firestore itself is explicitly out of
  scope this phase (Jobs/Clients/Machines/Services/Knowledge Base unmigrated), moving auth
  fully to Supabase without a bridge would have broken every one of those screens. Resolution:
  `AuthRepository.login()` signs into Supabase (authoritative) then makes a best-effort,
  secondary Firebase Auth sign-in with the same credentials, purely to keep those
  not-yet-migrated screens working. A Firebase-side failure does not fail the Supabase login;
  affected screens fall back to their pre-existing "sign-in required" error state. Temporary,
  disclosed, removed in Phase I once Firestore itself migrates.
- **Real, live, unexpected finding**: only 3 Supabase Auth users exist in production — the 1
  real admin (already migrated during the web cutover) plus **2 unrelated leftover throwaway
  QA test accounts** (`qa-fixes+admin-...`/`qa-fixes+technician-...@invalid.local`, both
  active, real admin/technician roles) that appear to have escaped cleanup in an earlier,
  unrelated session. Flagged to the user directly, not deleted. Practical consequence: real
  Android field-technician users almost certainly cannot log in yet — only the one real admin
  account has a Supabase counterpart, matching the web migration's own already-known,
  still-untested password-reset gap.
- **Verified**: role/permission behavior needed zero code changes — confirmed live that the
  real admin's `effective_permissions` array already contains the full, real 69-key
  permission list directly in the Supabase data (same as it worked under Firestore), so
  `CapUser.hasPermission()` (unchanged) works correctly with no special-cased admin bypass
  needed. A new live REST-contract test
  (`supabase/scripts/qa-verify-android-auth-rest-contract.mjs`) drove the exact HTTP requests
  the new Kotlin code makes against production — **12/12 checks pass** (valid login, wrong
  password, nonexistent account — confirmed to get the identical generic error, by design —
  session restore, profile load, role/permission shape, unauthenticated access blocked,
  logout + confirmed server-side token revocation, malformed-request error handling, full
  cleanup independently re-verified).
- **Real, disclosed limitation, not hidden**: this environment still cannot run an actual
  Android/Gradle build (same TLS gap as Phase B). Phase C's Kotlin code is verified by the
  live REST-contract test (the server-side behavior it depends on) and by careful manual code
  review — **not** by an actual compile/run. Flagged explicitly, itemized in
  `docs/android/ANDROID_SUPABASE_MIGRATION.md` §11.9, not implied to be more tested than it is.
- Affected: new `mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/
  SupabaseAuth.kt`; `Core.kt` (`AuthRepository` rewritten, dead `DocumentSnapshot.
  toCapUser()` removed); `app/build.gradle.kts` (`SUPABASE_URL`/`SUPABASE_ANON_KEY`
  `BuildConfig` fields — anon key only, never service-role; `implementation(libs.security)`,
  an already-declared-but-previously-unused dependency, zero new/unverified ones added).
  `firebase-auth` dependency **not** removed — still genuinely used by `StatusRepository`,
  `GoogleCalendarRepository`, and the bridge itself.
- Consequences: Phase D (core data) is next, explicitly gated on the user's review of this
  phase, per their own phase-by-phase approval structure — not started.

## 2026-08-13 (same session, earlier) — Android Firebase→Supabase migration authorized (separate project)
- Decision: the user explicitly authorized a **separate** migration project — the
  `mobile-android/` client, previously a deliberate, standing exception to the web app's
  Firebase retirement (see this file's earlier 2026-08-13 "permanently retired" entry), will
  now itself be migrated off Firebase (Auth + Firestore) onto Supabase Auth + Postgres/RLS.
  This resolves the open question from earlier in the session ("does the Firebase-retirement
  policy extend to Android?") — the answer is now yes, via an explicit, separate,
  phased authorization, not by extending the web policy's original text.
- **Phase A (audit) and Phase B (Firebase→Supabase mapping + Navigation-Compose foundation)
  complete**, per the user's own explicit phase structure (A through J). Full detail:
  `docs/android/ANDROID_SUPABASE_MIGRATION.md`. Key Phase B findings: no missing Supabase
  tables (every Firestore collection Android reads already has a live counterpart); the real
  gaps are field-level drift (`knowledge_machines`'s entire field set changed under Android
  since its Firestore integration was last touched, plus several smaller field
  additions/renames elsewhere) — see that doc's §4 for the itemized list. Feature-triaged
  (must-have/useful/web-only) rather than blanket-porting every web feature, per explicit
  instruction — Users/administration, the Settings hub, and Dashboard Notes were flagged
  web-only. Google Calendar: confirmed dead (matches the earlier web-side removal), NOT
  recreated through Firebase — recommended a direct Supabase read (no server-side service),
  matching the exact reasoning that resolved `dashboardNotes` earlier this session.
- **Real Navigation-Compose foundation built** (code, not just proposed): `MainActivity.kt`'s
  `AdaptiveShell` now uses a real `NavController`/`NavHost` (Google's standard bottom-nav
  save/restore pattern) instead of a plain `remember`-state string switch — the app's system
  back button now genuinely works for the first time. Scoped deliberately narrow: only the
  14 top-level destinations are wired; the 5 master-detail screens (Clients→ClientDetail
  etc.) still use their existing internal state, deferred to Phase D by design (bundled with
  each screen's actual data-layer swap, not a separate big-bang navigation rewrite).
- **Verification gap, disclosed not hidden**: this environment cannot run a real Android
  build — confirmed via two independent attempts this session (the pinned Gradle wrapper's
  distribution download, and a second attempt using an already-cached alternate Gradle 9.2.1
  distribution, both blocked by the same underlying TLS/CA trust-chain gap on this machine).
  The navigation code change is manually reviewed (every `onNavigate("label")` call site
  cross-checked against the new label↔route-id adapter) but **not compiler-verified**. See
  `KNOWN_ISSUES.md`.
- Consequences: Phase C (authentication) is the next piece of actual implementation work,
  explicitly gated on this review per the user's own phase-by-phase approval structure — do
  not proceed into it, or into any Firebase removal, without that go-ahead.

## 2026-08-13 (same day, earlier) — dashboardNotes redesigned again: Cloudflare Worker → direct Supabase Auth + RLS; `workers/dashboard-notes-api/` deleted — APPLIED AND LIVE-VERIFIED 24/24
- **UPDATE, same day, later**: migration `0023` applied by the user via the SQL Editor.
  Confirmed live via a direct probe (real CHECK-constraint violations on bad input, not
  simulated), then `supabase/scripts/qa-verify-dashboard-notes-rls.mjs` run for real against
  production: **24/24 checks passed** — full authorization matrix, `created_by`/
  `created_by_name` spoofing both blocked, both CHECK constraints verified live, full
  cleanup independently re-confirmed (0 residual notes, 0 residual throwaway auth users).
  `frontend` lint/typecheck/test(13/13)/build all clean afterward. See `SESSION_LOG.md`'s
  matching entry for the itemized pass/fail list. Dashboard notes are fully live now.
- **Trigger**: user question, "Can Dashboard Notes safely use Supabase Auth + RLS directly?",
  after the Worker migration below. Re-investigating rather than defending the just-built
  Worker found the ORIGINAL design's premise wrong: `supabase/migrations/0017_dashboard_notes.sql`'s
  comment claimed "Postgres RLS alone can't express creator-or-admin... without either a
  security-definer function." A security-definer function for exactly this (`public.is_admin()`)
  already existed in `0002_rls_policies.sql` and is already the pattern used for
  `public.users`' own "self or admin" policies and everywhere else in this schema —
  `dashboard_notes` was the only table routed through a server-side service instead of
  reusing it.
- Decision (explicit, detailed user approval — full spec given, see conversation):
  **`supabase/migrations/0023_dashboard_notes_direct_rls.sql`** (written, NOT yet applied —
  needs the SQL Editor) adds real RLS policies (global read; insert only as self, no admin
  bypass on spoofing `created_by`; update/delete by creator or `public.is_admin()`), two
  `CHECK` constraints (`content` ≤2000 chars; `color` in the 4 valid values — **rejects**
  invalid input now instead of the retired code's silent fallback-to-yellow, per explicit
  instruction to document this behavior change), and a `BEFORE INSERT OR UPDATE` trigger
  (`public.set_dashboard_note_created_by_name()`) that resolves `created_by_name` from the
  authenticated caller's own profile on insert and pins it unchanged on every update
  (matching the retired code's behavior exactly, and closing a spoofing gap a raw API call
  could otherwise exploit that RLS syntax alone can't close).
- `frontend/src/api/dashboardNotesClient.js` rewritten to call `supabase.from("dashboard_notes")`
  directly (same exported shape — `StickyNotes.jsx` needed zero logic changes, only a stale
  header comment). `workers/dashboard-notes-api/` (this same day's earlier fix) deleted
  entirely — it was never deployed (see the entry below), so zero production impact.
  `SUPABASE_SERVICE_ROLE_KEY` is no longer used anywhere in the live web app's request path.
- **Verified**: `frontend` lint/typecheck/test(13/13)/build all clean; confirmed live
  (read-only probe, then cleaned up) that 0023's constraints are genuinely not applied yet,
  not just assumed. **NOT yet live-tested against the real authorization matrix** — that
  requires 0023 to be applied first (Queen Bee cannot run DDL). A full test script,
  `supabase/scripts/qa-verify-dashboard-notes-rls.mjs`, is written and ready (3 throwaway
  users — creator/other/admin — real signed-in sessions so `auth.uid()` resolves correctly
  under RLS, exercises every cell of the approved authorization matrix plus the
  `created_by_name`-spoofing test, full cleanup of notes and auth users after). Blocked on
  the user applying 0023; see `KNOWN_ISSUES.md`.
- Consequences: once 0023 is applied, sticky notes work end-to-end with no deploy of
  anything (no Worker, no Cloud Function, nothing beyond the existing `frontend/` Cloudflare
  Worker that already serves the whole app). This closes out the `dashboardNotes`
  saga entirely: Firebase Cloud Function → Cloudflare Worker → direct Postgres RLS, all
  three phases happening the same day, each one a real, verified step, not a false start
  papered over.

## 2026-08-13 (same day, later) — dashboardNotes migrated off Firebase Cloud Functions to a Cloudflare Worker; `functions/` deleted entirely
- **Trigger**: user, sharply, after Queen Bee repeatedly reported "sticky notes still blocked
  on GCP billing" as if re-enabling Firebase billing were the fix — exactly what the
  permanent Firebase-retirement policy (entry below) says never to do. Direct correction:
  "stop worrying about sticky notes on firebase... everything new must be updated on
  supabase... i am done with firebase. it cost me too much unnecessary money."
- Decision: migrated the `dashboardNotes` function (the only remaining Firebase Cloud
  Functions export — data was already 100% Supabase, only the hosting platform was
  Firebase/GCP) to a new Cloudflare Worker, `workers/dashboard-notes-api/`. Business logic
  and authorization rules (global read, creator-or-admin write/delete) are unchanged,
  byte-for-byte ported — only the HTTP/config adapter differs (Fetch API Request/Response
  instead of Express-style req/res; plain Worker `env` bindings instead of
  `firebase-functions/params`' defineSecret/defineString, which required Firebase Secret
  Manager, which required the GCP billing that was blocking this the whole time).
- **`functions/` (the Firebase Cloud Functions dir) was deleted entirely** — `git rm -r
  functions`. It was never live in production (blocked by the GCP billing lapse the entire
  time it existed), so this has zero production impact. `firebase.json`'s `"functions"`
  array entry was removed; `firestore`/`storage`/their emulator config were **kept** —
  `mobile-android/` still depends on that Firebase project (`capdatabasefb2`) for its own
  Firestore rules deployment, a separate, still-open exception (see the policy entry below).
- Affected: new `workers/dashboard-notes-api/` (`src/{index,auth,dashboardNotes}.js`,
  `test/*.test.js`, `wrangler.jsonc`, `package.json`, `eslint.config.js`); `functions/`
  deleted; `firebase.json` (functions entry + its emulator port removed); `frontend/.env.
  {production,example}` (`VITE_FUNCTIONS_BASE_URL` now points at the Worker, not
  `*.cloudfunctions.net`); `frontend/src/api/dashboardNotesClient.js` (header comment only —
  the client itself needed zero logic changes, same REST shape, same bearer-token auth);
  `CLAUDE.md` sections 6/9/10/11/14 updated; this file's Google Calendar entry's dangling
  `functions/index.js` reference fixed (that command is unrelated, still outstanding, now
  self-contained in `KNOWN_ISSUES.md`).
- **Verified**: 26/26 new Worker unit tests pass (ported 1:1 from the retired Firebase
  tests' cases, same coverage — auth verification incl. inactive-profile/missing-profile/
  non-array-permissions edge cases, all 4 CRUD handlers incl. every authorization boundary).
  `npx wrangler deploy --dry-run` confirms it bundles correctly for the Workers runtime
  (729 KiB, `SUPABASE_URL` var binding shown correctly). `frontend` lint/typecheck/test
  (13/13)/build all still clean after the env-file changes.
- **NOT deployed, NOT live yet — real blocker found, not a policy violation**: this
  environment's `wrangler` is authenticated as a **different Cloudflare account**
  (`gerhard.ark.of.war@gmail.com`) than the one hosting the live site
  (`capdashboard.gerhardvanwijk.workers.dev`, implying a `gerhardvanwijk@gmail.com`-owned
  account) — confirmed via `wrangler deployments list` failing with "This Worker does not
  exist on your account" for the *already-live* `capdashboard` worker too, not just the new
  one. Queen Bee deliberately did not attempt a real `wrangler deploy` or `wrangler secret
  put` with these credentials — would either fail loudly or, worse, silently create an
  orphaned Worker under the wrong account. See `KNOWN_ISSUES.md` for what the user needs to
  do (deploy themselves, or `wrangler login` with the correct account in this environment).
  `VITE_FUNCTIONS_BASE_URL` was set to the *predicted* URL, explicitly flagged as unconfirmed
  in a code comment — not asserted as fact.
- **Also still outstanding, unrelated to this migration but same underlying complaint**: the
  actual deployed Google Calendar Cloud Functions (removed in code 2026-08-12) were never
  confirmed deleted from GCP — that's the other real, still-open GCP-billing item. See
  `KNOWN_ISSUES.md`'s Google Calendar entry for the exact `firebase functions:delete`
  command; needs the user (or Queen Bee, once deploy-capable under the right account).
- Consequences: once deployed (correct account) + the `SUPABASE_SERVICE_ROLE_KEY` secret set
  + `supabase/migrations/0017_dashboard_notes.sql` applied (still needed regardless of host —
  unrelated blocker, see `KNOWN_ISSUES.md`), sticky notes will work end-to-end with zero
  Firebase/GCP dependency of any kind.

## 2026-08-13 — Firebase permanently retired for CAP Dashboard (formal, written, non-negotiable policy)
- Decision: the user issued a formal written policy document ("CAP DASHBOARD — PERMANENT
  FIREBASE RETIREMENT & ARCHITECTURE RULES", status PERMANENT/NON-NEGOTIABLE) stating Firebase
  is permanently retired and must never be reintroduced — not as a fallback, not "temporarily,"
  not for convenience, and explicitly not for test/throwaway data either. The authoritative
  architecture is: Cloudflare Workers (frontend/deployment), Supabase Auth (auth), Supabase
  Postgres (database), Supabase RLS (authorization), Supabase Storage (files), Supabase Edge
  Functions/Cloudflare Workers (server-side logic). No new Firebase/GCP resource, dependency,
  env var, credential, or Cloud Function may be created without explicit written user
  authorization — a missing feature, failed test, or deployment problem does not count as
  authorization. If a feature appears to need Firebase, the correct response is to stop and
  design it with Supabase/Cloudflare instead, or report the gap to the user — never silently
  reach for Firebase/GCP, and never enable GCP billing to unblock development.
- Reason: eliminate unexpected/unnecessary Google/Firebase billing dependencies going forward
  (same underlying motivation as the 2026-08-12 Google Calendar removal and the 2026-08-13 full
  web cutover — this formalizes that intent as a standing rule for all future work, not just
  those two specific actions).
- **Scope ambiguity flagged, not yet resolved**: this policy's text refers to "CAP Dashboard"/
  "the application" generically and does not mention Android. `mobile-android/` is currently
  documented (this file's cutover-adjacent history, `PROJECT_STATE.md`, `CLAUDE.md` section
  6.2) as a **deliberate, separately-approved exception** still fully on Firebase Auth +
  Firestore, explicitly kept out of scope of both the original redesign brief and the web
  cutover. Queen Bee has NOT assumed this new policy extends to Android — asked the user
  directly in the same session this was received; do not silently migrate or leave Android
  Firebase code alone based on an assumption either way until that's confirmed. Old
  Firestore/Firebase Auth data itself was also not deleted by the web cutover (still exists,
  unused by web) — this policy does not by itself authorize deleting it.
- Affected: applies to all future Queen Bee/worker-bee decisions for the web app (`frontend/`,
  `functions/`, `supabase/`) — no code changed by this entry itself, it is a standing
  constraint on future work, recorded here and in Queen Bee agent memory
  (`firebase_permanently_retired` in `.claude/agent-memory/queen-bee/`) so it survives context
  resets and doesn't rely on this file being re-read carefully every session.
- Consequences: any future Firebase/GCP resource creation for the web app (new Firestore
  collection, new Cloud Function, new Firebase env var, etc.) is a policy violation and must be
  reported/undone, not adopted, even if it appears to fix an immediate problem.

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
