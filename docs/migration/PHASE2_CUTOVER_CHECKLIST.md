# Phase 2 Cutover Checklist — Firebase → Supabase

_Last updated: 2026-08-12. Status: schema/RLS/storage live and verified (`0001`-`0014`
applied — see `docs/ai-memory/PROJECT_STATE.md`/`KNOWN_ISSUES.md` for the full list).
**All data-migration phases (entities, relink, users, storage, permissions) are now fully
complete and verified** against the real project — all collections match Firestore, real
row content and every FK relationship spot-checked with zero orphans (not just counts), the
1 real user has a working Supabase Auth account + profile row with content-verified
role/permissions, the storage phase is confirmed a genuine no-op (0 real files exist
anywhere to copy yet), and `permissions`/`role_permissions` (76/124 rows) are migrated and
verified through the real RLS-protected client path (2026-08-12). Every item in section 1
below has been investigated with live evidence as of 2026-08-12 — see that section and
`docs/ai-memory/KNOWN_ISSUES.md` for what's resolved vs. still an open, accepted risk (a
genuine, newly-found realtime-publication gap; a generic-storage-bucket RLS gap; the
Android-Firebase data-divergence risk). See `docs/ai-memory/PROJECT_STATE.md`'s 2026-08-12
entry for full detail.
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

- **[decision] `sites` migration — investigated 2026-08-12, evidence supports "leave empty".**
  `Site`/`SiteService`/`apiClient.entities.Site` exist in the mapping layer (both Firebase
  and Supabase sides) but no page component anywhere calls them — grepped the whole
  frontend, only hit is unrelated copy text in `Clients.jsx` ("...manage sites and
  machines"). `machines.site_id` is nullable with `on delete set null`, and
  `entityMappings.mjs` never references `site_id`/`sites` at all, so there was never a
  migration path that could have populated it. Confirmed live: `sites` table is 0 rows, all
  6 real `machines` rows have `site_id IS NULL`. No FK-orphan risk, no silent data loss —
  `sites` is genuinely dead/unbuilt feature scaffolding, not a migration gap. Leaving it
  empty is correct; no action needed unless the "sites" feature is ever actually built.
- **[RESOLVED 2026-08-13] Generic storage buckets** — `0016_storage_generic_buckets_owner_or_admin.sql`
  applied and empirically re-verified live (admin full access; owner-or-admin enforced;
  cross-user access denied and confirmed via ground truth, not just error presence). Original
  2026-08-12 investigation preserved below for context.
- **[decision] Generic storage buckets — inspected 2026-08-12, current behavior reported (not changed).**
  `documents`/`photos`/`attachments` policies (`0004_storage_buckets.sql`) use `for all
  using (bucket_id = '<x>' and public.has_active_profile()) with check (same)` —
  `has_active_profile()` is `exists (select 1 from public.users where id = auth.uid() and
  is_active = true)`, i.e. **any signed-in user with an active profile row can
  select/insert/update/delete ANY object in these 3 buckets**, with zero per-owner,
  per-client, or per-role scoping — a user can read or delete another (active) user's
  uploads in these buckets. No path-prefix convention is enforced by policy (unlike
  `profile-images`, which correctly restricts to `{auth.uid()}/...` via
  `storage.foldername(name)`). `invoices` is properly gated on `invoices.*` permission keys.
  Confirmed live: all 5 buckets exist, all private (`public: false`), all currently 0 files
  — so today this is a latent policy gap, not an active data-exposure incident (nothing to
  leak yet). **Acceptability call**: with exactly 1 real active user (the admin) in
  production today, this is currently equivalent in practice to "admin-only," so the gap
  has zero real impact right now — but it will matter the moment a second non-admin active
  user exists and any of these 3 buckets gets real files. Not tightened this session (no
  policy change made) — this is a decision for the user, not inferred.
- **[no-approval, not yet built] Password-reset delivery for migrated users.** Phase C of
  `migrate-firestore-to-postgres.mjs` creates Supabase Auth users with no usable password
  (Firebase password hashes can't be imported). The script only *reminds* about this — no
  code exists yet to actually trigger reset emails for every migrated user. Needs a small
  script (e.g. loop `supabase.auth.admin.generateLink({ type: 'recovery', email })` or
  `resetPasswordForEmail` per user) before real users can log in post-cutover.
- **[decision] Android timing — investigated 2026-08-12, no technical objection found to the
  default assumption.** Confirmed via a full grep of `mobile-android/`: zero Supabase
  references anywhere in the Android codebase (`Core.kt` is 100% Firebase Auth/Firestore).
  Web's `VITE_AUTH_BACKEND` flag lives entirely in the frontend build/bundle — flipping it
  has no code-level effect on Android whatsoever; Android will keep working against Firebase
  exactly as it does today regardless of what web does. **The real risk isn't Android
  breaking — it's data divergence**: once web writes to Postgres, those writes do NOT
  propagate to Firestore (no bidirectional sync exists, confirmed — the migration script is
  a one-time bulk copy only, already documented in section 4 above), so Android would keep
  reading/writing Firestore data that silently stops being the source of truth for anything
  web touches post-cutover. This is a data-consistency decision already implicit in "web-
  only cutover," not a newly-found blocker — confirms rather than overturns the existing
  default assumption (Android stays on Firebase). Not changed this session.
- **[RESOLVED 2026-08-13] Realtime semantics** — `0015_enable_realtime_clients_machines.sql`
  applied and empirically re-verified live (real subscribe + real insert/update on both
  `clients` and `machines`, events confirmed actually received). Original 2026-08-12
  investigation preserved below for context.
- **[decision] Realtime semantics — investigated 2026-08-12, a real defect found (not just a
  semantics difference).** Grepped the whole frontend: the only real page-level consumers of
  `apiClient.entities.*.watch()`/`.subscribe()` are `ClientDetail.jsx` and
  `MachineDetail.jsx` (`Dashboard.jsx`/`CalendarPage.jsx` only load once on mount, no
  realtime dependency either way). The re-query-vs-snapshot semantics difference itself is
  fine (`supabaseApiClient.js`'s implementation is correct, re-queries the affected
  row/list). **But empirically confirmed live** (two real tests: a real insert into
  `clients`, a real update on an existing `machines` row, both with an actively `SUBSCRIBED`
  channel listening) that **zero realtime events are delivered** — no migration ever adds
  `clients`/`machines` to the `supabase_realtime` publication, so `postgres_changes` never
  fires for them. See `docs/ai-memory/KNOWN_ISSUES.md`'s 2026-08-12 entry for full detail.
  Impact is bounded (initial page load still works, only live auto-refresh is missing;
  single-admin-today usage limits real-world exposure) but this is a genuine, verified,
  currently-unfixed gap — not resolved this session, needs its own DDL approval
  (`alter publication supabase_realtime add table ...`) like any other schema change.
- **[decision] Staging target — re-investigated 2026-08-12, still the same real project.**
  Confirmed `supabase/.env`'s `SUPABASE_URL` and `frontend/.env.production`'s
  `VITE_SUPABASE_URL` point at the exact same project (`cjvrquipmnoihksijful`,
  i.e. `CAPDATABASE`) — there is no separate staging project, and the entities/relink/users/
  storage phases plus this session's permissions migration have all been run for real
  against it. **This is technically acceptable for continued QA**, with an explicit caveat:
  every QA script in `supabase/scripts/qa-*.mjs` that writes anything (throwaway clients,
  throwaway auth users, realtime test writes) is writing into the actual pre-cutover
  production dataset, not an isolated sandbox — cleanup discipline matters more than it
  would against a real staging project (this session found and cleaned up one unexplained
  leftover throwaway QA user as a direct example of that risk materializing in practice, see
  `docs/ai-memory/PROJECT_STATE.md`'s 2026-08-12 entry). No new Supabase project was created
  or recommended — provisioning one now, this late with real data already migrated, would be
  more disruptive than continuing carefully against `CAPDATABASE` with the existing
  throwaway-tagged/cleanup-verified QA pattern already in use.
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
7. **[done, 2026-08-06]** `--apply --phases=users` — the 1 real Firestore user migrated to a
   real Supabase Auth account. Content-verified live: profile row's `role`/
   `effective_permissions` (69 entries)/`is_active`/`preferences` all match Firestore
   verbatim.
8. **[built + dry-run verified, key rotation prerequisite now done 2026-08-06, NOT sent
   yet]** `supabase/scripts/send-password-reset-emails.mjs` — dry-run confirmed it correctly
   finds the 1 real migrated user. The key-rotation blocker is resolved; still needs an
   explicit go-ahead to actually `--apply` (sends a real email) — do this with the user
   present to confirm receipt.
9. **[done, 2026-08-06]** `--apply --phases=storage` — confirmed a genuine no-op both before
   and after (0 real documents in `knowledge_media`/`knowledge_documents`).
10. **[done, 2026-08-06]** Re-ran `--phases=verify` post-storage-copy — all 10 collections
    still match. Also independently checked every FK relationship for orphans (machines/
    job_cards/service_records/job_card_lines) — 0 orphans found across the board.

## 3. Frontend wiring

-1. **[done, 2026-08-06]** Rotated `SUPABASE_SERVICE_ROLE_KEY` in the Supabase Dashboard,
   `supabase/.env` updated by the user directly. Verified working via a live `--phases=verify`
   and a full `smoke-test.mjs` run (18/18 pass) — not just a connectivity check.
0. **[DONE, deployed + live-verified 2026-08-06]** Google Calendar auth redesign
   (`docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md`) — `functions/lib/supabaseAuth.js`
   (new) + `functions/lib/auth.js`'s issuer-routed dual verification. Deployed via
   `firebase deploy --only functions`. A real bug was found on the first deploy via live
   testing (Node 20 runtime lacks the `WebSocket` global `@supabase/supabase-js` needs —
   fixed with a `ws` polyfill) and confirmed fixed on redeploy via 4 separate live HTTP
   probes against the real deployed function plus direct Cloud Functions log inspection —
   see PROJECT_STATE.md's 2026-08-06 entry for full detail. Confirmed zero impact on real
   Firebase-authenticated traffic throughout (the bug was only reachable via a
   Supabase-issued token, which no real client sends yet).
1. **[implemented + unit/build-verified 2026-08-06, NOT live]** `VITE_AUTH_BACKEND` flag
   wired directly into `frontend/src/lib/AuthContext.jsx` (defaulting to `firebase`) —
   turned out to need **zero changes** to any of the 13 Firebase-dependent frontend files,
   since the flag routing lives entirely inside `AuthContext.jsx` itself (writes into the
   same shared React context regardless of backend). Two real bugs found+fixed via testing
   actual production builds — see PROJECT_STATE.md's 2026-08-06 entry. Verified via two
   real `npm run build` runs (one per flag value); the default build was confirmed via
   bundle inspection to contain zero Supabase-related code.
2. **[implemented + unit/build-verified 2026-08-06, NOT live]** `apiClient.js` similarly
   wired to the same flag — also needed **zero changes** to the 21 files that `import {
   apiClient }`. `supabaseApiClient.js`'s pre-existing documented interface deviations
   (role_permissions shape, `knowledge_service_codes.code`/`service_code` rename since
   corrected by `0013`, session-based password reset, realtime re-query semantics) are
   unchanged by this wiring — still need re-verification against real page behavior in
   step 3 below.
3. **[still not done — blocked]** With the flag flipped **only in a local/staging
   build**, manually click through every page: clients, machines, job cards, service
   records, knowledge base, user admin, calendar (service-record-derived events), file
   upload/download for each bucket, permission-gated UI (as both an admin and a
   limited-permission test user). **Currently blocked** by two other open items: the
   missing password-reset-email script (the 1 migrated Supabase Auth user has no usable
   password yet) and step 0 above not being deployed yet (Google Calendar would 401 under
   a Supabase session until then).
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
- [x] All items in section 1 investigated 2026-08-12 and either resolved (`sites`: confirmed
      genuinely empty by design, no action needed; `permissions`/`role_permissions`: migrated
      and verified) or explicitly reported as an accepted/open risk, not silently ignored
      (generic storage bucket RLS, realtime publication gap, Android data-divergence risk,
      staging-target reality — see section 1 for full detail on each). The 2026-08-05 Google
      Calendar auth-token gap is now moot — Google Calendar sync was removed entirely
      2026-08-12 (cost decision, see `DECISIONS.md`), so this item no longer applies.
- [ ] Password-reset-email script built and dry-run tested — **still not built as a
      general/repeatable script**; the 1 real migrated user currently has a real working
      password only via the one-off `qa-set-admin-password.mjs` workaround (2026-08-11,
      explicit user approval), not a tested self-service reset-email flow. The real
      reset-email flow (`ResetPassword.jsx`'s Supabase branch) has still never been clicked
      end-to-end by a human — see `docs/ai-memory/KNOWN_ISSUES.md`.
- [ ] Frontend flag wiring (section 3) built and manually QA'd end-to-end on a
      local/staging build, both as an admin and a limited-permission user — flag wiring is
      built and unit/script-QA'd (`qa-clickthrough.mjs` 21/21 as an admin-equivalent
      throwaway user), but not yet manually clicked through in a real browser with the flag
      flipped, and never as a limited-permission (non-admin) user specifically.
- [x] Android decision (lockstep vs. deferred) confirmed — investigated 2026-08-12, no
      technical objection found: Android has zero Supabase references, is unaffected by the
      web flag by construction. Default assumption (Android stays on Firebase) holds; the
      real residual risk is data divergence post-cutover (see section 1), not Android
      breaking.
- [x] `users`/`storage` migration phases run — **fully done and verified (2026-08-06)**: all
      four data-migration phases (entities/relink/users/storage) complete, content- and
      relationship-verified, zero FK orphans, storage confirmed a genuine no-op (no real
      files exist yet)
- [x] `permissions`/`role_permissions` migrated — **done and verified (2026-08-12)**: 76
      permissions + 124 role_permissions rows, content- and FK-verified against Firestore,
      re-confirmed through the real RLS-protected client path.

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
- [x] Google Calendar integration — **moot, removed entirely 2026-08-12** (cost decision, see
      `DECISIONS.md`); no longer a cutover consideration.
- [ ] Android app confirmed still functioning normally against Firebase (no regression from
      an unrelated change)

**Only after a clean soak period, with separate explicit approval:**
- [ ] Remove Firebase code/config (the actual Phase 3 per `DECISIONS.md`'s original phased
      plan) — not covered in detail by this document since it's a distinct, later approval
      gate, not part of "the cutover" itself.
- [ ] Rotate the Supabase service_role key (recommended regardless, per `KNOWN_ISSUES.md` —
      it was pasted into a chat transcript once during Phase 0).
