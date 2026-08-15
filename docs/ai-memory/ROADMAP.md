# Roadmap

## In progress — CAP cross-platform product parity initiative (started 2026-08-15)

Superseding framing as of the user's 2026-08-15 "Complete Android + Web Product Parity & UX
Completion" message (15 phases, explicit parity-audit table required at the end — see
`.claude/agent-memory/queen-bee/feedback_cross_platform_parity_process.md` for the now-standing
process rule this and all future feature work must follow: web first, Android second, explicit
compare, extend not fork, verify full flow, report parity). Maps directly onto the earlier
13-commit list — nothing lost, just reframed with an explicit web-or-both lens per phase.

**Running checklist** (updated as each phase lands, not before):

| Phase | Item | Status |
|---|---|---|
| 1 | Branding/icon (Android launcher+login, web favicon+sidebar+login) | **DONE** — `8f82611`, `1223f38` |
| 1 | Dashboard cards functional (tap Clients/Machines/Open Jobs/Due Services to navigate) | **DONE** — `ccf8e50`, real-build-verified (23/23 tests, 0 lint errors/30 warnings) |
| 1 | Dashboard profile (real name, no hardcoded "Administrator") | **DONE** — Phase G round 1 |
| 1 | Dashboard profile photo | NOT DONE — blocked on Phase 7 (no photo column exists anywhere yet) |
| 2 | Navigation architecture (real routes, back-button rule, no state loss) | **DONE** — `ec13917`, real-build-verified |
| 3 | Book In field parity | **DONE** — `0b7664c`, real-build-verified (23/23 tests, 0 lint errors/30 warnings). All 5 fields (job_number/machine_type/accessories_received/arrival_condition/arrival_condition_notes) added to BookInScreen + JobDetailScreen + JobDialog; real Previous Jobs section |
| 4 | Calendar (day/week/month, CAP data, no Google Calendar) | **DONE** — `e9003b9`, real-build-verified. Deliberate no-grid-library call (web itself drops to agenda view under 640px); bucketed agenda (Overdue/Today/This week/Later this month/Later/Completed) + range filter chips + richer detail (serial/refrigerant/notes/findings/status + cross-links). Reschedule confirmed already existed. |
| 5 | Knowledge Base rework | **PARTIAL** — `600a097`, real-build-verified. List-card summary/refrigerant preview + real photo-grid reuse (PhotoThumbnail/CapPhotoViewerDialog) done. Upload capability deliberately deferred — found a real, live web bug blocking it correctly, see `KNOWN_ISSUES.md`'s matching entry |
| 6 | Notes (`dashboard_notes` on Android) | **DONE** — `1a4bbd5` (data-layer registration) + `03040fb` (full CRUD UI), real-build-verified. Embedded in Dashboard matching web placement; full create/edit/delete against real RLS, no fake data |
| 7 | Account/Profile edit + profile photo (web AND Android — neither has this today) | **DONE**, both platforms, real-build-verified. Migration `0026` written (fixes the pre-existing `profile-images` bucket's RLS, adds `users.photo_path`) but **NOT YET APPLIED** — both UIs work correctly but a real save will fail server-side until the user applies it via the SQL Editor |
| 8 | Users + roles editable | **DONE**, both platforms, real-build-verified — `e703177` (Android), web fix in the same session (see `KNOWN_ISSUES.md`'s matching RESOLVED entry). Prerequisite (`"users"` off Firestore onto Supabase, `b8aaaee`) landed 2026-08-15 and turned out to be the entire remaining Android Firebase data footprint too (see Phase 12 note below). 2026-08-16: found+fixed a real, severe, same-bug-class production bug on web while scoping this (`UserAdmin.jsx` save() sent `name`/`permission_overrides`, neither a real `public.users` column — every web admin save was 400ing) and the Android Users list's own `"name"` titleKey (same root cause, introduced by `b8aaaee` itself). Android: new `UsersScreen`/`UserDetailScreen`, edit-only (account creation is architecturally client-impossible on both platforms — `public.users.id` is a FK to `auth.users(id)`, only populated by a real sign-up trigger — no service_role key in any client), full permission matrix sourced from real `permissions`/`role_permissions` tables (newly added to `SUPABASE_MIGRATED_TABLES`/`permittedCollections`), save payload exactly `{full_name, email, role, is_active, effective_permissions}` matching the real columns on both platforms now. Gradle: `BUILD SUCCESSFUL`, 23/23 tests (unchanged baseline), 0 lint errors/30 warnings, real 26,286,963-byte APK. **Disclosed gap**: the new pure derivation functions (`roleLabel`, `permissionStateBadge`) have no dedicated unit tests — UI-only change, judged lower-risk than the domain/repository logic this project's testing convention targets, but not covered either |
| 9 | Settings (Android; web's hub already exists, extend it) | NOT DONE on Android |
| 10 | Theming/personalization (web AND Android — neither has this today) | NOT DONE |
| 11 | Connection & Sync Status → Supabase-based, real checks | NOT DONE — still literally Firestore |
| 12 | Firebase removed completely from Android | NOT DONE — footprint scoped precisely (see below) |
| 13 | Global responsiveness/UX pass (+ web sanity pass where changed) | NOT DONE |

**Real findings already confirmed by direct code read (not guessed), still current**:
- Book In (`BookInScreen`) missing `job_number`, `machine_type`, `accessories_received`
  (migration 0025's own column!), `condition_on_arrival`, `condition_notes`, and the "Previous
  Jobs for this machine" history section — all present on web's `BookIn.jsx`.
- Notes: zero `dashboard_notes` references anywhere in `mobile-android/` — from-scratch build,
  not a port.
- Profile photo: no `photo`/`avatar` column in `public.users` on **either** platform — genuinely
  new cross-platform feature per the user's Phase 3 framing ("if it exists on neither, build it
  on both"), needs a new migration + Storage bucket/RLS, reusing the existing
  `service-records`/`job-cards` Storage RLS pattern (`0024_photos_bucket_record_scoped_rls.sql`)
  as the template, not inventing a second storage mechanism.
- Users/roles: `public.users`' role/is_active/effective_permissions changes are already
  admin-only, enforced by a server-side trigger (`restrict_self_user_update_trigger`,
  `0002_rls_policies.sql`), not just an RLS policy — since `users` now reads from Supabase
  (`b8aaaee`, landed 2026-08-15), real role editing on Android is just a normal write, no new
  security mechanism to build.
- Settings: web already has a real hub (`frontend/src/pages/Settings.jsx`, tabbed, deliberately
  no fake toggles) — Android's equivalent should follow the same section shape
  (Account/Appearance/Application/Connection/Users/About per the user's own Phase 9 list), and
  extend the web hub with Appearance (theming) rather than inventing a separate pattern.
- **Firebase removal — UPDATE (2026-08-15/16): the actual data-layer footprint described below
  is now already closed by `b8aaaee`.** Tracing every actual Firebase usage in `Core.kt` showed
  the entire remaining footprint was exactly one thing — the `"users"` Firestore collection (+
  the login-time Firebase bridge that exists solely to satisfy `firestore.rules` for that one
  read). `GoogleCalendarRepository` (the other historical consumer) was already deleted (Phase
  G). `b8aaaee` migrated `users` onto `public.users` (already what the web app uses), which
  removes Firebase's entire remaining *data* reason to exist in Android. **What Phase 12 is now
  actually left to do is dead-code/dependency removal, not a data migration**: delete the now
  provably-unreachable `observeFirestoreCollection()` (Core.kt, confirmed unreachable in
  `b8aaaee`'s own commit message — nothing in `permittedCollections` routes there anymore), the
  Firebase Auth login bridge that existed only to satisfy `firestore.rules` for the old `users`
  read, and the Firebase Gradle dependencies themselves — plus a real proof step (grep the built
  APK/dependency tree for any remaining `firebase-*`/`com.google.firebase` reference) before
  declaring it done. Not yet done as of this update — still its own dedicated commit per the
  user's git-discipline instruction, not a side effect of Phase 8.

**Process note, applies going forward**: worker bees hit an account-wide Claude usage limit
mid-session on 2026-08-15 (resets 6:40pm Africa/Johannesburg) — not a bug. Local Gradle builds
don't consume that same limit, so Queen Bee verified left-behind work directly via Bash when
subagents were unavailable, rather than blocking. Worth repeating if it recurs: review the diff
manually for completeness first (check for truncated hunks/orphaned references), then verify
directly.

## Earlier in-progress items
- **Android Firebase→Supabase migration (started 2026-08-13, separate project from the web
  cutover — explicitly authorized by the user).** Phase A (audit) + Phase B (mapping +
  Navigation-Compose foundation) + Phase C (authentication) + **Phase D (core data: Clients/
  Machines/Service Records/Job Cards/Job Card Lines)** + **Phase E1 (Knowledge Base +
  Supabase-stream reliability + `"users"` Firestore listener isolation) — COMPLETE, E1 gate
  PASSED 2026-08-14.** The architectural audit determined `"users"` is intentionally transitional
  (Option C); `Core.kt`'s Firestore listener for it was fixed so its failure can no longer
  terminate the shared data flow, independently verified by `testing-bee` (real Gradle build,
  16/16 unit tests, unchanged regression baselines, unchanged QA-account count). No Users
  migration/removal/Firebase removal was performed — that product decision remains open. See
  `KNOWN_ISSUES.md`'s matching RESOLVED entry and `PROJECT_STATE.md`'s 2026-08-14 entry for full
  detail. **Phases E2–J (remaining secondary
  features incl. photo upload, UI redesign, logo/icon, testing, Firebase removal, final
  build) explicitly NOT started** — user asked Queen Bee to "run through all the phases"
  unsupervised overnight; Queen Bee completed D (real, scoped, live-REST-verified) and
  stopped there rather than rushing E–J with no build verification available — see
  `docs/android/ANDROID_SUPABASE_MIGRATION.md` §12.9 for the itemized reasoning per phase.
  Full detail: `docs/android/ANDROID_SUPABASE_MIGRATION.md`. Login runs on Supabase Auth
  authoritatively (Firebase Auth kept as a temporary bridge for the still-unmigrated
  Firestore screens: `knowledge_*`, `users`); Phase D's data layer (`SupabaseData.kt`) swaps
  the 5 core tables from Firestore to Postgres/PostgREST while keeping every screen's code
  unchanged (same `CapRecord`/`RecordsState` generic shape). Live REST-contract tests: Phase
  C 12/12, Phase D 16/16, both pass against live production Supabase. Real, unresolved
  blocker: no Android build could be run via CLI in this environment (Gradle/TLS gap,
  reconfirmed again this session at a later build stage — dependency resolution, not the
  wrapper download this time) — **however the user separately confirmed a real build+run DID
  succeed via Android Studio's own GUI**, which Queen Bee cannot drive unattended, so Phase D
  is still only manually-reviewed + REST-contract-tested, not Queen-Bee-compiler-verified.
  Real open item: only 1 real user has both a Firebase and Supabase account, so most real
  Android users likely can't log in via Supabase yet; 2 unrelated leftover QA test accounts
  found live in production, flagged to the user, still not deleted (no explicit go-ahead
  received yet). Do not assume Android CLI build-tooling works here without re-checking; the
  Android Studio GUI path is the one known-working path on this machine.

  **UPDATE (2026-08-15): Phase E2 (photo upload) is done** (commit `0c9a068`, both web +
  Android, real-device tested by the user). **Phase F (UI redesign/consistency) is now in
  progress**, prioritized per explicit user instruction to continue systematically through the
  remaining phases with an Android-frontend/UX focus. First Phase F pass (`android-ui-bee`):
  fixed two real photo-viewing bugs found via real-device testing (blank thumbnails — missing
  Coil3 network artifact; no tap-to-view — no viewer existed at all) plus a systematic
  screen-by-screen sweep of all 17 screens in `MainActivity.kt` finding several more real,
  concrete defects (permission-ungated dashboard quick actions, system back button not working
  on 6 detail screens, stale "Firebase" strings, blank-subtitle rendering). Code-reviewed by
  Queen Bee directly (full diff read, cross-checked shared component signatures), **then
  genuinely build-verified by `testing-bee` for the first time via a real CLI Gradle build —
  23/23 unit tests, lint 0 errors, real APK assembled.** Same verification pass also
  root-caused and solved this machine's long-standing CLI-build TLS gap (Avast HTTPS
  interception, not a project defect — see `KNOWN_ISSUES.md`'s new RESOLVED entry; not yet made
  durable, needs the user's approval for a permanent trust-store fix). See `KNOWN_ISSUES.md`'s
  matching 2026-08-15 entries for full detail.

  **Phase G (branding/visual identity) — COMPLETE as of 2026-08-15, all 3 rounds committed
  and real-build-verified** (`477918d`/`3907b62`/`f1ac1fe`): theme/status polish, Dashboard +
  navigation branding, dead Google Calendar UI fully removed (its backend was already gone),
  Login screen premium redesign, forms/empty/loading/error-state consistency, photo tap
  affordance, and — the app's first-ever launcher icon (a derived "C" monogram, no source
  logo asset exists in the repo). A real, build-breaking XML bug in the icon's first draft was
  caught and fixed before commit. **Only genuinely unverified layer across all of Phase G:
  on-device visual/runtime behavior** — every round is compiler/build/lint-verified, not one
  has been seen running on a real screen by anyone in this pipeline. Latest APK installed to
  the user's connected device this session. See `KNOWN_ISSUES.md`'s matching entry for the
  full itemized list of what's still deferred (`StatusScreen` Firebase labels, back-navigation
  affordance consistency) and why. Phases H (testing)/I (Firebase removal)/J (final build)
  not started.

- **UX redesign resumed (2026-08-13, after the Supabase cutover), functional fixes +
  Settings/Products & Services/Customer Import.** See SESSION_LOG.md's matching entry for
  full detail. Status:
  - Done, verified (lint/typecheck/test/build): Dashboard greeting (time-aware, real user
    name, live date/time); Job Card line-item display bug (JobCardDetail.jsx wasn't
    fetching job_card_lines/client/machine at all post-cutover); Notes-not-linked-to-
    customer bug (ClientDetail.jsx never read back Dashboard-linked notes); new
    `products_services` catalogue + `job_card_settings` + `/settings` hub (Job Cards,
    Products & Services tabs real and wired; General/System intentionally empty, no fake
    toggles); new Customer Import feature (Settings > Data Management), 11/11 unit tests,
    reusable for future Pastel exports.
  - **0018/0019 applied, live-QA verified 18/18** (later the same day) — see
    SESSION_LOG.md's matching entry. **New `0020` (service_records.photos/
    job_cards.arrival_photos) not yet applied.**
  - **Done (same day, cont.)**: Calendar reviewed against section H's checklist — already
    substantially satisfied by the earlier Phase 8 commit; one real gap found+fixed
    (mobile/desktop view didn't react to window resize after mount). 2 more real
    pre-existing bugs found+fixed (Phase 9 forms audit): service/job-card photo uploads
    were never actually persisted (display code existed, write path + column didn't) — see
    new migration `0020`. 2 real responsive/overflow bugs found+fixed via code-level
    reasoning (Phase 10, partial): `InvoiceQueue.jsx`/`ImportCustomers.jsx` table wrappers
    clipped horizontal overflow on narrow widths instead of scrolling.
  - **CORRECTED (2026-08-13, continuation session): Phase 11 (Android) is further along than
    "in progress" suggested.** `git log` confirms the actual visual redesign is committed
    (`a1e4016`, `9cc1b52`), not just the pre-redesign health audit — see
    `latest_patch_notes.txt` for its own dated verification claim. **Not independently
    re-verified this continuation session**: this machine's Gradle wrapper can't download
    its distribution (TLS trust-chain failure) — see `KNOWN_ISSUES.md`. Treat the redesign
    as "committed, verified once on a different machine, not re-confirmed here" until either
    this machine's Gradle/TLS gap is fixed or it's re-verified on the machine where it
    previously worked.
  - **Phase 9 (forms)/Phase 10 (responsive) continuation (2026-08-13, later)**: swept the
    remaining forms/pages not yet individually audited (`MachineForm.jsx`, `ServiceForm.jsx`,
    `JobCardDetail.jsx`'s inline line-item form, plus a full-repo grep for bare multi-column
    grids/fixed pixel widths/raw `<table>` usage/single-check viewport logic). Found and
    fixed one real, narrow bug: `BookIn.jsx`'s Job Number/Date row wasn't responsive
    (inconsistent with every sibling form). Nothing else found — the codebase from the prior
    session's redesign work is in genuinely good shape. Full verification: `frontend` lint/
    typecheck/test (13/13)/build all clean, production bundle re-confirmed zero "firebase"
    strings. See `KNOWN_ISSUES.md` for a separate, unrelated fix needed this pass (stale
    `node_modules` after pulling — `npm install` needed `xlsx`).
  - **`0020`/`0021`/`0022` confirmed applied and live (2026-08-13, checked this
    continuation)** — see `KNOWN_ISSUES.md`'s RESOLVED entry;
    `supabase/scripts/qa-check-0020-0021-0022-applied.mjs` (new, reusable) confirmed all 5
    new columns exist with correct default values, not just that the migration "ran."
  - **Not yet done**: no browser-based visual/click-through QA (still no browser tool);
    Phase 12 (final
    consistency polish) not started — the one known candidate item for it is `Login.jsx`'s
    bespoke (non-shared-design-system) styling, deliberately left alone pending the user's
    explicit go-ahead since it's a real layout/product decision, not a mechanical fix; real
    Pastel spreadsheet inspection/import (needs the user to provide the file); Android build
    re-verification (blocked on this machine's Gradle/TLS gap, see `KNOWN_ISSUES.md`).
  - **Discrepancy found (still open)**: the user's framing said phases 1-4 were "already
    completed" and asked to continue from Phase 5 — `git log` shows phases 5-8 already
    have dedicated redesign commits. Treated as substantially done this session (Calendar
    reviewed and gap-fixed); still worth the user's explicit confirmation.

- Firebase -> Supabase migration (Phase 0 done, see PROJECT_STATE.md / DECISIONS.md
  2026-08-03 entries):
  - Done: Postgres schema + RLS migration files (`supabase/migrations/`), client/auth/
    database/storage service scaffolding (`frontend/src/services/supabase/`), env vars
    wired, verified no build/lint/typecheck regression.
  - Done (Phase 1, 2026-08-03): entity service layer (`entities.js`), storage abstraction
    with shared image-optimization (`storage.js` + `lib/imageOptimize.js`), parallel
    `SupabaseAuthContext.jsx` (unwired), migration files `0001`-`0005` (schema, RLS,
    legacy-id columns for both entities and users, storage buckets), and an expanded
    4-phase Firestore->Postgres migration script (entities/relink/users/storage),
    syntax-checked but never executed. `calendar_records`/`invoice_queue` confirmed
    unused, not modeled.
  - In progress (2026-08-03): `0001` confirmed executed successfully by the user;
    `0002`-`0005` being run next, in order, via the Supabase SQL Editor (no DB connection
    string provided — confirmed 2026-08-03). Not yet confirmed successful as of this
    entry.
  - Done (Phase 2 prep, 2026-08-03, while `0002`-`0005` were in progress): fixed a real
    migration-script gap (Phase A was missing 4 live `knowledge_*` collections) found by
    static review — see DECISIONS.md/KNOWN_ISSUES.md. Added new
    `supabase/migrations/0006_knowledge_legacy_ids.sql`, a unit-tested pure mapping module
    (`supabase/scripts/lib/entityMappings.{mjs,test.mjs}`), and a read-only `verify` phase
    to the migration script. Wrote a Phase 2 execution runbook (DECISIONS.md) so
    "proceed with Phase 2" maps to specific, individually-approved steps rather than a
    blanket go-ahead for `--apply`/cutover/Firebase removal.
  - Done (2026-08-03): all 7 migrations (`0001`-`0007`) confirmed applied against the real
    project (`0006` briefly appeared to fail on re-run but was verified live to have
    already fully committed earlier; the file was made idempotent — see KNOWN_ISSUES.md/
    DECISIONS.md). Ran `supabase/scripts/smoke-test.mjs` live (user-approved) — **9/9
    checks pass** after `0007`: RLS deny+allow branches, storage buckets, both triggers,
    and the profile-creation default shape all confirmed working live. Built
    `frontend/src/api/supabaseApiClient.js`, a Supabase-backed drop-in equivalent of
    `apiClient.js`, unwired — verified via `frontend` lint/typecheck/test.
  - Done (2026-08-03): expanded the live smoke test to cover RLS deny+allow across 4
    representative tables/permission namespaces (18/18 pass). Wrote the complete cutover
    plan: `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` — task list, downtime estimate,
    rollback plan, verification checklist. Surfaces open decisions (Android timing, `sites`
    migration source, staging target, generic-bucket permission tightening) and a real gap
    (no password-reset-email delivery script yet, no incremental-sync capability).
  - Done (2026-08-04): user provided Firebase Admin credentials. First-ever live dry run
    of the migration script against real Firestore data. Full spot-check of every real
    doc (not just dry-run samples) in all 6 non-empty collections found and fixed 5 more
    real gaps beyond `job_number`/`date_received` (see KNOWN_ISSUES.md/DECISIONS.md for
    detail): `machines.warranty_expiry`; `service_records.service_date`/
    `work_performed`/`findings`; `knowledge_machines`'s entire schema was wrong (real
    fields are manufacturer/model_name/variant/product_code/category/summary/
    supported_refrigerants/technical_specifications/main_functions); a date
    empty-string-vs-null bug across multiple tables; and NOT NULL FK constraints that
    blocked the script's insert-then-relink pattern for `machines`/`service_records`/
    `job_card_lines`/`knowledge_machines`. Migrations `0008`-`0012` written, applied by
    the user, and live-verified.
  - **Done (2026-08-04): entities + relink phases fully complete.** All 10 collections
    (`clients`, `machines`, `service_records`, `job_cards`, `job_card_lines`,
    `knowledge_machines`, and the 4 correctly-still-empty `knowledge_*` sub-collections)
    migrated and `verify`-confirmed to match Firestore counts exactly. Went beyond
    count-matching: spot-checked real row content and FK relinking by tracing actual IDs
    through Postgres — confirmed correct, not just counted. This is real production data
    now living in Supabase, alongside (not instead of) Firebase, which remains the only
    live-serving backend.
  - Next: `users` phase (creates real Supabase Auth accounts — needs separate
    explicit go-ahead, and a password-reset-email delivery step doesn't exist yet, see
    `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` section 1) and `storage` phase (copies
    real files — also needs separate go-ahead). Then resolve the checklist's other open
    decisions (Android timing, `sites` migration source, staging target, generic-bucket
    permissions) before frontend wiring or any cutover date.
  - **Portability note**: user is switching to a different machine. The migration
    tooling's local secrets (`supabase/.env`, the Firebase service-account key file) are
    gitignored and won't travel via git — see KNOWN_ISSUES.md. Everything else in this
    repo (schema, docs, code) works immediately after a clone on any machine.
  - Blocked on user decision (Phase 2 remainder, destructive/irreversible): `users`/
    `storage` phases, actual cutover of `AuthContext.jsx`/`apiClient.js` to Supabase,
    Firebase removal, Android update. Do not start without explicit go-ahead per
    CLAUDE.md section 12 — see the Phase 2 runbook in DECISIONS.md for the ordered,
    individually-gated steps.
  - Done (2026-08-05, prep continued, no live writes): closed the deferred
    `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents`
    schema gap (new `0013` migration, not yet applied) and a second, independent
    storage-copy bug in the migration script's Phase D (new unit-tested
    `firebaseStorageUrl.mjs` helper). Wrote `docs/migration/FIREBASE_DEPENDENCIES.md` (full
    Firebase touchpoint inventory) — surfaced a real, previously-undocumented gap: Google
    Calendar's Cloud Functions auth is Firebase-ID-token-specific and will break on an Auth
    cutover unless redesigned (not yet scoped). Refreshed
    `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` to current status. See
    `docs/ai-memory/PROJECT_STATE.md`/`DECISIONS.md` 2026-08-05 entries for full detail.
  - Done (2026-08-05, same day, design only): Google Calendar authentication redesign —
    `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md` recommends issuer-routed dual JWT
    verification in `functions/lib/auth.js` (Firebase branch unchanged, new Supabase branch
    via `supabase.auth.getUser()` + service-role Postgres permission lookup, identical
    return shape, zero call-site changes). Added as a new blocking prerequisite (step 3.0)
    before `PHASE2_CUTOVER_CHECKLIST.md` step 3.1 (`SupabaseAuthProvider` wiring). Nothing
    implemented in `functions/`/`frontend/` yet — implementation + deploy are separate,
    still-gated next steps.
  - **Done (2026-08-06): `users` and `storage` migration phases both run and verified —
    Phase 2 (data migration) is now fully complete.** User confirmed `0013` applied (live
    column probe confirmed). Ran `--apply --phases=users`: the 1 real Firestore user
    migrated to a real Supabase Auth account + profile row, content-verified (role/
    permissions/preferences/active-flag all match Firestore exactly). Ran `--apply
    --phases=storage`: confirmed genuine no-op (0 real files exist in either source
    collection). Full independent verification: `verify` phase all-match, zero FK orphans
    across every relationship (machines/job_cards/service_records/job_card_lines), exactly
    1 user profile. Investigated `service_records.photos`/`job_cards.arrival_photos` (real
    UI fields, no Postgres columns, not in the mapper) — confirmed zero real data in either
    field (traced to a pre-existing, unrelated frontend bug where uploaded photos are never
    actually saved to the record) so no data was lost; flagged, not fixed, out of migration
    scope. See PROJECT_STATE.md 2026-08-06 entry for full detail.
  - **Done (2026-08-06): Google Calendar auth redesign implemented + frontend flag wiring
    built — both unit/build-verified, neither deployed nor live.** `functions/lib/
    supabaseAuth.js` (new) + `functions/lib/auth.js`'s issuer-routed `requireUser()` —
    76/76 `functions` tests pass (was 63), including tests that prove the actual routing
    (not just each branch in isolation). `VITE_AUTH_BACKEND` flag wired into
    `AuthContext.jsx`/`apiClient.js`/`functionsClient.js` with zero changes needed to any
    of the ~13+21 consumer files; two real bugs found via testing real builds (not just
    writing code) and fixed: a top-level-await/esbuild-target incompatibility, and a
    module-import-time crash risk in `services/supabase/client.js` (now a lazy Proxy).
    Verified via two real production builds (`VITE_AUTH_BACKEND=firebase` confirmed via
    bundle inspection to contain zero Supabase code at all; `=supabase` confirmed to build
    successfully). See PROJECT_STATE.md 2026-08-06 entry for full detail.
  - **Done (2026-08-06, same day): password-reset/login-migration flow built + a real bug
    fixed.** `supabase/scripts/send-password-reset-emails.mjs` (new, dry-run by default,
    live dry-run verified — found the 1 real migrated user correctly). Found+fixed a real
    bug in `frontend/src/pages/ResetPassword.jsx`: it only recognized Firebase's
    `oobCode`/`token` query param, not Supabase's session-based (URL-hash) recovery flow —
    would have shown "Invalid reset link" for every real Supabase reset email. See
    PROJECT_STATE.md's 2026-08-06 entry for full detail.
  - **Done (2026-08-06): key rotated + verified, real password-reset email sent, Functions
    deployed + a real bug found and fixed via live testing + redeployed and re-verified.**
    See PROJECT_STATE.md's 2026-08-06 entries for full detail. The Google Calendar auth
    redesign is genuinely live now — both issuer branches confirmed working against the
    real deployed functions via multiple live HTTP probes and direct log inspection, not
    just trusting "it is done."
  - **Done (2026-08-07, reconstructed — see PROJECT_STATE.md catch-up entry): scripted Phase
    3 QA ran.** Core auth/data/RLS layer passed end-to-end (throwaway admin test user,
    script-driven since no browser tool was available). **Found a real, unresolved bug**:
    Google Calendar Cloud Functions reject a genuinely valid Supabase session with 401 (only
    rejection paths were tested 2026-08-06) — see KNOWN_ISSUES.md, blocks Calendar QA.
  - **Done (~2026-08-11, reconstructed): found+fixed a pre-existing `AuthLayout.jsx` UI bug**
    (unrelated to migration, dropped every auth page's heading) and a **real migration gap**
    (`permissions`/`role_permissions` never migrated + column mismatch — new `0014`
    migration, NOT yet applied). Set a real password directly for the migrated admin account
    as a workaround for the still-unclicked password-reset-email flow.
  - **Done (2026-08-12): memory catch-up.** ~5 days of the above work was found sitting
    uncommitted; consolidated a duplicate/misplaced agent-memory directory, wrote catch-up
    entries across `docs/ai-memory/`, re-verified and committed. See PROJECT_STATE.md.
  - **Superseded (2026-08-12): Google Calendar sync was removed entirely** (user: cost) —
    see the new top-level item below. The Calendar-401-under-Supabase bug is now moot; the
    Google Calendar auth redesign in `functions/lib/supabaseAuth.js` still exists as generic
    unused infra but is no longer relevant to the migration cutover checklist.
  - Next, in order: (1) user applies `0014` via the SQL Editor, then `migrate-permissions.mjs
    --apply`; (2) a real human clicks a real password-reset email end-to-end (still deferred,
    still outstanding); (3) full manual QA with `VITE_AUTH_BACKEND=supabase` in a local
    build; (4) the actual cutover — flipping the flag in real production config. Each still
    needs its own separate explicit approval. Firebase remains the sole live production
    backend throughout.
- **Google Calendar sync removal (2026-08-12, user decision: cost)**:
  - Done: web UI (`SystemSettings.jsx` + `/settings` route/nav deleted), `apiClient.js`/
    `supabaseApiClient.js` Google routes, `CalendarPage.jsx`'s Google UI (Upcoming Services
    kept), all 8 Cloud Functions' code (`functions/index.js` now exports nothing),
    Google-specific `functions/lib/*`/tests, the `googleapis` dependency. Verified via real
    frontend/functions lint/typecheck/test/build.
  - Not done: user running `firebase functions:delete ...` to actually stop billing on
    whatever's deployed right now; revoking the stored Firestore OAuth connection; Android's
    `GoogleCalendarRepository` removal (needs `android-ui-bee`/`integration-sync-bee`
    delegation, not done yet). See KNOWN_ISSUES.md for the exact follow-up list.
- Android "Connection and Sync Status" feature (per `.claude/agents/android-ui-bee.md`
  and `integration-sync-bee.md`):
  - Done: `StatusRepository`, `ConnectionStatus` enum, and connection-state derivation
    from Firebase exceptions already exist in `Core.kt`.
  - Not done: `ConnectionStatusScreen.kt` UI (indicators, Test Connection button,
    loading/success/error states) not found in the repo — no file matching
    `ConnectionStatusScreen` under `mobile-android/`.
  - Not done: read-only lightweight reachability check against Firestore
    (`integration-sync-bee`'s scope) — presence not verified this session; re-check
    `Core.kt` for a dedicated Test Connection method before assuming it's missing vs.
    just not yet named that way.

## Blocked
- ~~Google Calendar going fully live~~ — **moot as of 2026-08-12: Google Calendar sync was
  removed entirely** (user decision: cost). See the dated entry above and
  `docs/ai-memory/DECISIONS.md`.

## Completed (verified in code, not just claimed)
- Firebase-direct Firestore CRUD for web and Android (clients, machines, service
  records, job cards, users, permissions).
- Google Calendar Cloud Functions backend + frontend + Android read-only consumer.
- Dashboard notes on direct Supabase Auth + RLS (2026-08-13) — migration `0023` applied,
  24/24 live authorization-matrix checks pass (`supabase/scripts/qa-verify-dashboard-notes-rls.mjs`).
  No server-side service. See `DECISIONS.md`/`SESSION_LOG.md`.

## Deferred / explicitly not being pursued
- Laravel parity for Google Calendar and other Firestore-backed resources — Laravel
  code kept in the repo but not actively maintained as a client-facing path.
