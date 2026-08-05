# Phase 2 Cutover Checklist — Firebase → Supabase

_Last updated: 2026-08-05. Status: schema/RLS/storage live and verified (`0001`-`0013`
applied — see `docs/ai-memory/PROJECT_STATE.md`/`KNOWN_ISSUES.md` for the full list, most
recently `0013` correcting the 4 knowledge-base sub-collection schemas to their real
Firestore field names). The **entities + relink migration phases are fully complete and
content-verified** against the real project — all 10 collections match Firestore, real row
content and FK relinks spot-checked (not just counts). The **users** and **storage**
migration phases have deliberately NOT been run yet (each needs its own separate
explicit go-ahead per the runbook below — see `docs/ai-memory/DECISIONS.md`).
**No frontend/Android cutover step below has been executed.** Firebase remains the sole
active production backend for web and Android. This document exists so "proceed with the
final cutover" maps to a concrete, reviewable plan rather than a single big decision — see
`docs/ai-memory/DECISIONS.md`'s Phase 2 runbook entry for the shorter version this expands
on, `docs/migration/FIREBASE_DEPENDENCIES.md` for the full current Firebase dependency
inventory this checklist assumes, and CLAUDE.md section 12 for the approval policy
governing every irreversible step here._

## How to read this document

Each task is tagged:
- **[no-approval]** — read-only or fully reversible with no user-facing effect; can proceed
  without asking again once the cutover itself is approved.
- **[approval]** — writes real data, touches production config, or is otherwise the kind of
  action CLAUDE.md section 12 requires explicit sign-off for, even mid-cutover.
- **[decision]** — requires a business/product decision only the user can make; not
  something to infer.

---

## 1. Outstanding gaps to close before scheduling a cutover date

These aren't blocking further prep, but a cutover date shouldn't be picked until they're
resolved:

- **[decision] `sites` migration.** Postgres has a `sites` table but Firestore has no
  dedicated `sites` collection (nested under clients in the current model, per
  `KNOWN_ISSUES.md`). Confirm whether any real site-level data exists anywhere that needs
  manual migration, or whether `sites` genuinely starts empty in Postgres.
- **[decision] Generic storage buckets.** `documents`/`photos`/`attachments` buckets
  (`0004_storage_buckets.sql`) default to "any active profile" RLS since no dedicated
  permission/feature exists for them yet. Confirm this is acceptable before cutover, or
  tighten it first.
- **[no-approval, not yet built] Password-reset delivery for migrated users.** Phase C of
  `migrate-firestore-to-postgres.mjs` creates Supabase Auth users with no usable password
  (Firebase password hashes can't be imported). The script only *reminds* about this — no
  code exists yet to actually trigger reset emails for every migrated user. Needs a small
  script (e.g. loop `supabase.auth.admin.generateLink({ type: 'recovery', email })` or
  `resetPasswordForEmail` per user) before real users can log in post-cutover.
- **[decision] Android timing.** Android (`Core.kt`, `GoogleCalendarRepository.kt`) has zero
  Supabase awareness today and building that parity is a separate, unscoped, unestimated
  piece of work. Decide: does Android cut over in lockstep with web, or run against Firebase
  for a longer transitional period after web cuts over? The rest of this checklist assumes
  **web-only cutover, Android stays on Firebase** unless told otherwise — that assumption
  should be confirmed, not defaulted into silently.
- **[decision] Realtime semantics.** `supabaseApiClient.js`'s `subscribe()`/`watch()`
  re-query the full filtered list on every `postgres_changes` event rather than replicating
  Firestore's per-listener snapshot semantics exactly. Needs a quick check of which pages
  actually rely on `apiClient.js`'s `subscribe`/`watch` (Dashboard? CalendarPage? — not
  audited this session) and whether the re-query behavior is acceptable for them.
- **[decision] Staging target.** There is currently one Supabase project (`CAPDATABASE`).
  Testing the flag-enabled frontend end-to-end either means testing against this same
  project (fine right now since it holds no real data, but stops being fine once real data
  is migrated into it) or provisioning a second Supabase project for ongoing staging.
  Decide before real data migration, not after. **Superseded in part**: the entities/relink
  phases have since actually been run against `CAPDATABASE` (real business data now lives
  there, content-verified — see `PROJECT_STATE.md` 2026-08-04 entries), so this project is
  no longer "empty of real data" — re-decide this before any further test writes against it.
- **[decision, newly found 2026-08-05] Google Calendar's callable-function auth is
  Firebase-ID-token-specific, not just Firestore-specific.** `frontend/src/api/
  functionsClient.js` attaches `auth.currentUser`'s Firebase ID token as a bearer token to
  every Google Calendar Cloud Function call, and all 8 deployed functions'
  `requireUser`/`requirePermission` guards (`functions/lib/auth.js`) verify that token via
  Firebase Admin. Google Calendar itself is intentionally staying on Firebase Cloud
  Functions regardless of which data layer serves the rest of the app (see
  `docs/ai-memory/DECISIONS.md`) — but if/when `AuthContext` cuts over to Supabase, this
  auth path breaks unless it's redesigned (e.g. functions accept a Supabase JWT instead, or
  a bridge token is minted). **Now designed** (2026-08-05) — see
  `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md` for the full recommended architecture
  (issuer-routed dual verification via `supabase.auth.getUser(token)` + a service-role
  Postgres permission lookup, preserving `requireUser`'s exact return shape so no call site
  in `functions/index.js` changes) and an ordered, approval-tagged implementation plan.
  **Not yet implemented.** Must be implemented and deployed before step 3.1 (wiring
  `SupabaseAuthProvider`) below, or Google Calendar will silently break for every user the
  moment the auth flag flips.

## 2. Data migration

1. **[done, 2026-08-04]** User supplied Firebase Admin credentials (service-account key
   file, referenced via `GOOGLE_APPLICATION_CREDENTIALS` in the gitignored
   `supabase/.env`, never printed into any session transcript).
2. **[done, 2026-08-04]** Dry-run of all phases including `verify` — reviewed, real counts
   confirmed (6 clients, 6 machines, 7 service_records, 4 job_cards, 3 job_card_lines, 3
   knowledge_machines, 0 in the 4 knowledge_* sub-collections, 1 user).
3. **[done, 2026-08-04]** Dry-run output reviewed line by line — found and fixed 6 real
   schema/mapping gaps before any real write (see `KNOWN_ISSUES.md`: `job_cards.job_number`/
   `date_received`, `machines.warranty_expiry`, `service_records.service_date`/
   `work_performed`/`findings`, `knowledge_machines`'s entire schema, a date
   empty-string-vs-null bug, and NOT NULL FK constraints blocking the insert-then-relink
   pattern).
4. **[done, 2026-08-04]** `--apply --phases=entities,relink,verify` against the real
   project — completed in two passes (first pass: `clients`/`job_cards` succeeded,
   `machines`/`service_records`/`job_card_lines`/`knowledge_machines` failed on NOT NULL
   constraints; fixed via `0012`; retry with `--only` succeeded for all 4). Firebase was
   never touched by this — it remains untouched and authoritative throughout.
5. **[done, 2026-08-04]** `--phases=verify` — **all 10 collections match Firestore counts
   exactly**, including the 4 correctly-still-empty knowledge_* sub-collections.
6. **[done, 2026-08-04]** Manually spot-checked real records (a real machine, service
   record, and job card) field-by-field and by traced FK against their Firestore originals
   — confirmed correct, not just row-count matching.
7. **[not started — needs explicit go-ahead]** `--apply --phases=users` — creates real
   Supabase Auth accounts. `0007` is applied (confirmed) so Phase C's service_role writes to
   `role`/`effective_permissions` will work. **Not run.**
8. **[no-approval, blocked on item 1.3 above]** Send password-reset emails to every migrated
   user once the script for that exists. Script still does not exist.
9. **[not started — needs explicit go-ahead]** `--apply --phases=storage` — copies
   `knowledge_media`/`knowledge_documents` files from Firebase Storage to Supabase Storage.
   Best-effort, logs and continues on individual failures. **Note**: both sub-collections
   currently have 0 real documents (confirmed live, most recently 2026-08-04), so running
   this today would be a no-op, not a meaningful test — re-confirm doc counts first.
10. **[no-approval]** Re-run `--phases=verify` one more time post-storage-copy as a final
    completeness check.

## 3. Frontend wiring (not started — explicitly deferred pending approval)

0. **[approval, prerequisite]** Implement + deploy the Google Calendar auth redesign
   (`docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md`) — `functions/lib/auth.js`'s
   issuer-routed dual verification, `functionsClient.js`'s flag-aware token attachment.
   Do this **before** step 1 below, not after — the redesign is additive/backward-compatible
   (safe to deploy well ahead of the flag flip with zero behavior change for current
   callers), but flipping the flag without it deployed first will silently break Google
   Calendar for every user.
1. **[approval]** Wire `SupabaseAuthProvider` into `App.jsx` behind an env flag (e.g.
   `VITE_AUTH_BACKEND=firebase|supabase`), defaulting to `firebase`. This touches the exact
   file every one of the 13 Firebase-dependent frontend files depends on through `useAuth`
   — needs care and explicit sign-off even though the default keeps Firebase live.
2. **[approval]** Wire `supabaseApiClient.js` behind the same or a parallel flag, replacing
   `apiClient` imports across pages (13 files) — realistically a page-by-page or
   route-by-route rollout, not one commit, given the blast radius CLAUDE.md flags for this
   exact file set.
3. **[no-approval, once flag exists]** With the flag flipped **only in a local/staging
   build**, manually click through every page: clients, machines, job cards, service
   records, knowledge base, user admin, calendar (service-record-derived events), file
   upload/download for each bucket, permission-gated UI (as both an admin and a
   limited-permission test user).
4. **[no-approval]** Resolve/re-verify the documented interface deviations in
   `supabaseApiClient.js` (role_permissions shape, `knowledge_service_codes.code` rename,
   session-based password reset, realtime re-query semantics) against actual page behavior
   found in step 3.
5. **[no-approval]** Confirm Google Calendar continues working unchanged — it stays on
   Firebase Cloud Functions regardless of which data layer serves the rest of the app;
   `calendarEvents()` in `supabaseApiClient.js` already sources service-record-derived
   events from Postgres while still calling the same Functions for the Google portion.

## 4. Cutover execution

1. **[decision]** Pick a maintenance window. Even though the design allows near-zero
   technical downtime once tested, recommend a real (short) window anyway — this is a
   small, internal business tool, so a brief off-hours pause is low-cost and gives room to
   react if something's wrong, rather than debugging live under real users.
2. **[approval]** Announce/apply a brief write-freeze or maintenance banner in the app
   (not yet built — needs a small addition if this route is chosen) so no Firestore writes
   land after the final data-migration run. **Known limitation: there is no incremental/
   delta-sync capability in the current migration script — it's a one-time bulk import.**
   Any Firestore write between the last `--apply` run and the flag flip will not be in
   Postgres unless the migration is re-run. Options: (a) keep the freeze window short and
   accept it, (b) build incremental sync before cutover (unscoped extra work), (c) run the
   final `--apply` immediately before the flag flip with the freeze covering only that gap.
3. **[approval]** Re-run steps in section 2 (data migration) one final time to capture
   anything written since the last full run.
4. **[approval]** Flip the frontend flag to `supabase` in production config, redeploy
   (Cloudflare).
5. **[no-approval]** Run the smoke-test-equivalent checks against production immediately
   after deploy, using a real (not throwaway) admin account.
6. **[no-approval]** Spot-check that a few real users can log in, see the data they should
   (and only that), and that file access works.
7. **[decision]** Lift the maintenance window once the above checks pass.

## 5. Rollback plan

Because Firebase is never modified or stopped by any step above through the end of section
4, rollback is cheap and lossless for existing Firebase data:

1. Flip the frontend flag back to `firebase` in production config.
2. Redeploy (Cloudflare) — same mechanism as the forward cutover, so rollback speed matches
   deploy speed (typically a couple of minutes based on this project's prior deploys).
3. Confirm the app is functioning on Firebase again via a quick manual check.
4. Investigate the failure before attempting cutover again.

**What rollback does *not* automatically undo**: anything real users wrote *into Supabase*
during the live window before the rollback decision is made. Firebase never received those
writes (it was bypassed while the flag was on), so a rollback leaves Firebase's data exactly
as it was at the moment of cutover — any writes made during the live-on-Supabase window need
manual reconciliation back into Firestore if they must be kept, or are accepted as lost for
that short window. This is the direct reason to keep the live-before-confirmed window (step
4.5-4.6 above) as short as possible, and a concrete reason to prefer a real maintenance
window over a silent flag flip.

**Rollback triggers** (any one is sufficient): RLS behaving incorrectly (either a data leak
or wrongful denial for a legitimate user), a `verify`-phase mismatch discovered post-cutover,
a core page failing to load real data, or authentication failures for legitimate migrated
users.

## 6. Verification checklist

**Before scheduling a cutover date:**
- [ ] All items in section 1 resolved or explicitly accepted as-is (including the newly
      found 2026-08-05 Google Calendar auth-token gap — see section 1)
- [ ] Password-reset-email script built and dry-run tested
- [ ] Frontend flag wiring (section 3) built and manually QA'd end-to-end on a
      local/staging build, both as an admin and a limited-permission user
- [ ] Android decision (lockstep vs. deferred) confirmed
- [x] `users`/`storage` migration phases run — **partially done**: `entities`/`relink` are
      fully complete and content-verified (2026-08-04); `users`/`storage` are still pending
      their own separate go-ahead (see section 2, items 7/9)

**Immediately before cutover:**
- [x] Dry-run of the full migration script reviewed with no unexplained anomalies — done
      2026-08-04, real `--apply` since completed for entities/relink
- [ ] `smoke-test.mjs` passing 100% (last confirmed 18/18 on 2026-08-03 — **re-run before
      relying on this**, since real data has since been migrated into the same project the
      smoke test seeds/cleans up against. Re-verified 2026-08-05 by reading the script: its
      cleanup only ever deletes rows by the exact `id` it captured from its own inserts
      moments earlier — never a table-wide delete/truncate — so re-running it is safe
      alongside real data; the "still passes" question is about results, not safety)
- [ ] Rollback steps (section 5) rehearsed at least once, even if only the flag-flip half

**During cutover:**
- [ ] `verify` phase shows matching counts after the final `--apply`
- [ ] Production smoke checks (section 4.5) pass with a real admin account
- [ ] Spot-checked real user data is correct and permission-gated as expected

**Post-cutover soak period (recommend 24-48h before treating as final):**
- [ ] Error logs (Cloudflare + Supabase) monitored, no unexplained spike
- [ ] A few real users confirm normal login/data access
- [ ] File upload/download confirmed working across all 5 buckets
- [ ] Google Calendar integration confirmed unaffected (contingent on resolving the
      auth-token gap in section 1 first — this check is meaningless until that's designed)
- [ ] Android app confirmed still functioning normally against Firebase (no regression from
      an unrelated change)

**Only after a clean soak period, with separate explicit approval:**
- [ ] Remove Firebase code/config (the actual Phase 3 per `DECISIONS.md`'s original phased
      plan) — not covered in detail by this document since it's a distinct, later approval
      gate, not part of "the cutover" itself.
- [ ] Rotate the Supabase service_role key (recommended regardless, per `KNOWN_ISSUES.md` —
      it was pasted into a chat transcript once during Phase 0).
