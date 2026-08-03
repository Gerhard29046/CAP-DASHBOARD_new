# Phase 2 Cutover Checklist — Firebase → Supabase

_Last updated: 2026-08-03. Status: Supabase schema/RLS/storage live and verified
(`0001`-`0007` applied, smoke test 18/18 checks passing across clients/machines/job_cards/
knowledge_machines). **No cutover step below has been executed.** Firebase remains the sole
active production backend for web and Android. This document exists so "proceed with the
final cutover" maps to a concrete, reviewable plan rather than a single big decision — see
`docs/ai-memory/DECISIONS.md`'s Phase 2 runbook entry for the shorter version this expands
on, and CLAUDE.md section 12 for the approval policy governing every irreversible step here._

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
  Decide before real data migration, not after.

## 2. Data migration

1. **[decision]** User supplies Firebase Admin credentials (service-account key file path,
   or runs `gcloud auth application-default login` themselves) — still not provided, and
   Queen Bee should not attempt to obtain these itself (per `KNOWN_ISSUES.md`).
2. **[no-approval]** Dry-run all phases including `verify`: `cd supabase && npm install &&
   node scripts/migrate-firestore-to-postgres.mjs` (no `--apply`). Read-only against
   Firestore, writes nothing to Supabase.
3. **[no-approval]** Review dry-run output line by line — row counts per collection, sample
   mapped rows, anything that looks wrong before it's ever written anywhere.
4. **[approval]** `--apply --phases=entities,relink` against the real project — first real
   write. Firebase is untouched by this; Postgres gains real business data for the first
   time.
5. **[no-approval]** `--phases=verify` — confirm Firestore doc counts match Postgres row
   counts per table. Investigate any mismatch before continuing.
6. **[no-approval]** Manually spot-check a handful of real records (a few clients, machines,
   job cards) field-by-field against their Firestore originals.
7. **[approval]** `--apply --phases=users` — creates real Supabase Auth accounts. Requires
   `0007` already applied (confirmed — see `KNOWN_ISSUES.md`) since Phase C sets each
   user's real role/`effective_permissions` via the service_role client.
8. **[no-approval, blocked on item 1.3 above]** Send password-reset emails to every migrated
   user once the script for that exists.
9. **[approval]** `--apply --phases=storage` — copies `knowledge_media`/
   `knowledge_documents` files from Firebase Storage to Supabase Storage. Best-effort, logs
   and continues on individual failures.
10. **[no-approval]** Re-run `--phases=verify` one more time post-storage-copy as a final
    completeness check.

## 3. Frontend wiring (not started — explicitly deferred pending approval)

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
- [ ] All items in section 1 resolved or explicitly accepted as-is
- [ ] Password-reset-email script built and dry-run tested
- [ ] Frontend flag wiring (section 3) built and manually QA'd end-to-end on a
      local/staging build, both as an admin and a limited-permission user
- [ ] Android decision (lockstep vs. deferred) confirmed

**Immediately before cutover:**
- [ ] Dry-run of the full migration script reviewed with no unexplained anomalies
- [ ] `smoke-test.mjs` passing 100% (currently true — 18/18)
- [ ] Rollback steps (section 5) rehearsed at least once, even if only the flag-flip half

**During cutover:**
- [ ] `verify` phase shows matching counts after the final `--apply`
- [ ] Production smoke checks (section 4.5) pass with a real admin account
- [ ] Spot-checked real user data is correct and permission-gated as expected

**Post-cutover soak period (recommend 24-48h before treating as final):**
- [ ] Error logs (Cloudflare + Supabase) monitored, no unexplained spike
- [ ] A few real users confirm normal login/data access
- [ ] File upload/download confirmed working across all 5 buckets
- [ ] Google Calendar integration confirmed unaffected
- [ ] Android app confirmed still functioning normally against Firebase (no regression from
      an unrelated change)

**Only after a clean soak period, with separate explicit approval:**
- [ ] Remove Firebase code/config (the actual Phase 3 per `DECISIONS.md`'s original phased
      plan) — not covered in detail by this document since it's a distinct, later approval
      gate, not part of "the cutover" itself.
- [ ] Rotate the Supabase service_role key (recommended regardless, per `KNOWN_ISSUES.md` —
      it was pasted into a chat transcript once during Phase 0).
