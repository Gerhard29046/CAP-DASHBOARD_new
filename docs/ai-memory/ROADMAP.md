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
  - Next (Phase 1, blocked on user): user runs `0001`-`0005` manually via the Supabase
    SQL Editor (no DB connection string will be provided — confirmed 2026-08-03), then
    confirms success before Phase 2 starts. Also blocked: Firebase Admin credentials for
    a real dry run of the migration script (user will provide later).
  - Blocked on user decision (Phase 2, destructive/irreversible): actual cutover of
    `AuthContext.jsx`/`apiClient.js` to Supabase, real user/data migration, Firebase
    removal, Android update. Do not start without explicit go-ahead per CLAUDE.md
    section 12 AND without the user's confirmation that `0001`-`0005` succeeded.
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
