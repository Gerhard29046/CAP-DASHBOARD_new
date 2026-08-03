# Decisions

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
