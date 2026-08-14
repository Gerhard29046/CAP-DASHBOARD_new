# Roadmap

## In progress
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
