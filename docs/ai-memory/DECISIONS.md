# Decisions

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
