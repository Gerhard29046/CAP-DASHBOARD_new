# Roadmap

## In progress
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
  - Next: resolve the open decisions/gaps listed in that document's section 1 before
    scheduling an actual cutover date. Frontend wiring (flag + `App.jsx`/`apiClient` swap)
    and Android parity are both explicitly deferred pending separate approval — not
    started. Firebase Admin credentials for a real Firestore migration dry run still not
    provided (user has said not to run it this session regardless).
  - Blocked on user decision (Phase 2, destructive/irreversible): actual cutover of
    `AuthContext.jsx`/`apiClient.js` to Supabase, real user/data migration, Firebase
    removal, Android update. Do not start without explicit go-ahead per CLAUDE.md
    section 12 AND without the user's confirmation that `0001`-`0005` succeeded — see the
    Phase 2 runbook in DECISIONS.md for the ordered, individually-gated steps.
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
- Google Calendar going fully live: blocked on manual Google Cloud OAuth client
  creation/consent-screen configuration per `docs/GOOGLE_CALENDAR_SETUP.md` — the code
  is complete but real-world OAuth has not been verified.

## Completed (verified in code, not just claimed)
- Firebase-direct Firestore CRUD for web and Android (clients, machines, service
  records, job cards, users, permissions).
- Google Calendar Cloud Functions backend + frontend + Android read-only consumer.

## Deferred / explicitly not being pursued
- Laravel parity for Google Calendar and other Firestore-backed resources — Laravel
  code kept in the repo but not actively maintained as a client-facing path.
