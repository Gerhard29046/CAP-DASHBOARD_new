# Known Issues

## RESOLVED (2026-08-16) — Web User Admin "Save User" was 400ing in production on every save; "Create User" and "reset another user's password" were both non-functional by design, not just buggy (found while scoping Android Phase 8 parity)

- `frontend/src/pages/UserAdmin.jsx`'s `save()` sent `name` in its payload; `public.users` has
  no `name` column, only `full_name` (`0001_initial_schema.sql`). `frontend/src/api/
  supabaseApiClient.js`'s PUT/PATCH handler additionally set `body.permission_overrides =
  body.permissions` — `permission_overrides` isn't a real column either (only `effective_
  permissions text[]` is; confirmed via `grep -n "permission_overrides"
  supabase/migrations/*.sql` returning zero matches). PostgREST rejects an update/insert
  outright on any unknown column, so **every save — role changes, active/disabled toggles,
  permission edits alike — was failing in production**, not a cosmetic display bug.
- Two further, deeper problems found in the same pass, both pre-existing design flaws rather
  than typos: (1) the form also sent `password`/`password_confirmation` on edit, intending to
  let an admin reset another user's password — `public.users` has no password column at all
  (Supabase Auth owns credentials in `auth.users`), so this could never have worked, with or
  without the column-name fix; (2) "Create User" POSTed a plain insert into `public.users`,
  but `public.users.id` is `references auth.users(id)` and only ever populated by a trigger
  when someone genuinely signs up through Supabase Auth — there is no client-safe way to
  originate a real account from an admin screen without a service_role key, which per this
  project's standing policy must never be used in frontend code.
- **Fixed, scoped to what's genuinely fixable without a new server-side service**: renamed
  `name`→`full_name` throughout (list display, form state, `FIELD_LABELS`); removed
  `permission_overrides` from the write payload; removed the password fields from the form
  entirely (real password resets already go through the existing self-service
  `ForgotPassword.jsx` email flow); replaced the "Create User" form with an honest message
  directing admins to self-registration (`/register`), then selecting that person from the
  list here to configure role/permissions once their account exists. Editing an existing
  user's `full_name`/`email`/`role`/`is_active`/`effective_permissions` is unaffected and now
  actually persists.
- Verified: `npm run lint` / `typecheck` / `build` all pass clean. **Not verified via a live
  click-through save** (no browser tool available this session, per the project's established
  QA-scripted-verification pattern) — the fix is a direct, mechanical removal of confirmed
  nonexistent columns from a payload that was previously provably rejected by PostgREST's
  schema cache, so this is lower-risk than most unverified claims, but is disclosed as
  code-level-verified only, not live-clicked.
- **Left as a disclosed, separate finding, not fixed here**: editing an existing user's
  `email` through this form changes only `public.users.email`, not their real Supabase Auth
  login email (`auth.users.email`) — the two would drift out of sync. Pre-existing behavior,
  not introduced by this fix; worth a future decision on whether to hide that field or wire it
  to a real `auth.admin.updateUserById` call (also service_role-gated, same constraint as
  account creation above).
- Directly informs Android Phase 8 (Users + Roles): Android's own role/permission-editing UI
  should write `effective_permissions` only, the same real column this fix confirmed is
  authoritative — not replicate web's now-removed `permission_overrides` pattern.

## LIVE BUG, WEB — Knowledge Base photo/document uploads permanently break 7 days after upload (found 2026-08-15, during Android parity Phase 5, independently verified)

- `frontend/src/api/supabaseApiClient.js`'s `integrations.Core.UploadFile()` uploads to the
  `documents` Storage bucket, then persists a **7-day signed URL** as `file_url` — it never
  stores the underlying object path. Once that URL expires, the photo/document is
  unrecoverable through the UI (the path was never saved anywhere to re-sign from), even
  though the file is still safely sitting in Storage.
- **This was disclosed as a real risk in the code itself, 2026-08-04, before any real caller
  existed**: "if a caller persists this `file_url` value for long-term reuse rather than
  displaying it immediately, it will eventually stop working... store `path` and generate a
  fresh signed URL each time... Not solved here since no caller exists yet." That caller now
  exists: `frontend/src/pages/KnowledgeMachineDetail.jsx`'s `upload()` (both the Photos and
  Documents sections) writes `file_url` straight from `UploadFile()`'s response into
  `knowledge_media`/`knowledge_documents` rows. **The predicted failure is now live** — every
  KB photo/document ever uploaded via the website will silently stop loading exactly 7 days
  after upload, permanently.
- Confirmed independently, not taken on the finding's word alone: read `UploadFile()`'s
  exact code (`60 * 60 * 24 * 7` signed-URL expiry, no `path` in the returned object) and
  `0013_knowledge_subcollections_real_fields.sql` (renamed `storage_path` → `file_url`
  specifically because this flow only ever writes a URL, confirming there is no
  permanent-path fallback anywhere in the schema for this table either).
- **Real-world impact unknown but plausibly nonzero** — no scripted or live check has been run
  to determine whether any real (non-test) KB photo/document has actually been uploaded via
  this flow yet and is now past 7 days old and broken. Worth checking directly (`file_url`'s
  embedded `token`/expiry parameters, or Storage bucket contents vs. `knowledge_media`/
  `knowledge_documents` row count) before assuming impact is zero.
- **The correct fix is a cross-platform data-contract change, not an Android-only one**:
  store the permanent object path (a new/renamed column, migration required) and re-sign at
  display time — the same pattern `service_records.photos`/`job_cards.arrival_photos`
  already correctly use (`0024_photos_bucket_record_scoped_rls.sql`). Both `UploadFile()`'s
  write path and every reader (`KnowledgeMachineDetail.jsx`'s `window.open(item.file_url)`,
  and Android's just-added `PhotoThumbnail` reuse — see the matching Phase 5 entry below)
  would need updating together, plus checking whether `0016_storage_generic_buckets_owner_or_admin.sql`'s
  owner-only read policy on the `documents` bucket even allows one user to view another's
  upload at all (a knowledge-base photo uploaded by one technician needs to be visible to
  every technician, which the current owner-scoped policy may not permit regardless of the
  URL-expiry issue — needs checking as part of the same fix, not assumed either way).
- **Not fixed this session** — found while scoping Android Knowledge Base upload parity
  (Phase 5 of the cross-platform initiative); Android's own upload capability was deliberately
  NOT built against this same broken contract (would have doubled the exposure, not added a
  workaround) — see `docs/ai-memory/ROADMAP.md`'s Phase 5 entry. This needs its own dedicated,
  reviewed migration + web fix + Android upload implementation, following this project's
  existing migration-approval process (never apply without explicit sign-off).

## Android Phase G (branding/visual identity) complete, real-build-verified — on-device visual confirmation still needed (2026-08-15)

- All 3 rounds committed: `477918d` (theme/status polish, Dashboard, navigation, icon
  consistency, dead Google Calendar UI removal), `3907b62` (Login screen redesign, forms
  consistency, empty/loading/error states, photo tap affordance), `f1ac1fe` (launcher icon —
  the app had never had one at all; a derived "C" monogram on `CapPrimary` blue, since no
  source logo asset exists anywhere in the repo). Every round got a real, full clean CLI
  Gradle build via `testing-bee` (23/23 unit tests, 0 lint errors throughout, warnings
  dropped 31→30 after the icon landed), not just code review.
- **Real bug caught before shipping**: round 3's first draft had `--` inside an XML comment
  (forbidden by the XML spec) that would have produced a completely blank rendered icon —
  caught by `testing-bee` actually running the vector art through a renderer, not just
  parsing it. Fixed, re-verified clean.
- **What's still genuinely unverified, and can only be verified by the user**: on-device
  visual/runtime behavior for all of Phase G — does the launcher icon actually look good on a
  real home screen (OEM mask shape, real rasterization, Android 13+ themed-icon tinting),
  does the Login screen's IME flow/field-lockout work as intended, does the new session-restore
  splash moment feel right, does the Dashboard's ticking clock/greeting render correctly on a
  small phone. `testing-bee` rendered the icon through Android Studio's own desktop vector
  renderer (not a real device) and confirmed it produces a clean, well-formed, optically
  centred white "C" — real evidence, but not the same as seeing it on an actual launcher.
  Latest APK (`25,628,917` bytes, matches the final committed state) installed to the user's
  connected device this session via `adb install -r`.
- **Deliberately deferred, not silently dropped** (each has its own reason, see `git log`
  commit messages for full detail): `StatusScreen` still shows literal "Firebase"/
  "Firestore"/`capdatabasefb2` labels — genuinely accurate today (that screen really does
  still probe Firestore), a truthful fix needs a Supabase health-check capability that's
  `supabase-android-bee`'s scope (not invocable this session, same recurring
  agent-registration gap). No consistent top-bar back/up affordance for the 8 screens reached
  from `MoreScreen` (they already have in-content `CapBackRow`s; adding a top-bar arrow too
  would double up — a real design decision, not a mechanical fix). `ServerStatusIndicator`
  now shows dot-only when healthy (frees app-bar width) — flagged by the implementer as the
  one change most likely to draw an objection, a 4-line revert if so.

## RESOLVED (2026-08-15, later same day): migration 0025 applied and independently confirmed live

- User applied `0025_job_cards_accessories_and_arrival_notes.sql` via the SQL Editor. Confirmed
  independently, not taken on trust: wrote `supabase/scripts/qa-check-0025-applied.mjs`
  (matches this project's existing `qa-check-0020-0021-0022-applied.mjs` pattern — read-only,
  service-role client, checks both columns are actually selectable) and ran it live —
  `job_cards.accessories_received`/`arrival_condition_notes` both `OK`. Since `BookIn.jsx`'s
  save is one combined `update()` payload and PostgREST's `PGRST204` fires specifically when a
  referenced column isn't in its schema cache, this directly closes the root cause described
  below — Book In saves should now succeed rather than fail outright. **Not separately
  re-tested via an actual live Book In save this session** (column-existence is a reliable
  proxy for the schema-cache fix, so this wasn't treated as required, but a real save has not
  been observed to succeed) — if Book In still fails after this, it's a different bug.

**Original finding, preserved below for history:**

## ORIGINAL — `job_cards.accessories_received`/`arrival_condition_notes` columns missing; migration written and committed, NOT YET APPLIED (found 2026-08-15, mid-session, while cleaning up unrelated stray files)

- Found sitting **uncommitted and untracked** in the working tree (`supabase/migrations/
  0025_job_cards_accessories_and_arrival_notes.sql`) — real, reasoned, evidence-gathering
  work from a prior session that was never committed and never applied. Committed this
  session (`7ce9cf8`) after independently re-verifying its own claims rather than trusting
  the file's comments blindly: both fields are genuine (present in the original Laravel
  `JobCard` model's validation rules; used on two independent live screens,
  `frontend/src/pages/BookIn.jsx` and `frontend/src/pages/JobCardDetail.jsx`, distinct from
  the existing `technician_notes` column), and confirmed absent from `0001_initial_schema.sql`'s
  `job_cards` table definition (`arrival_condition` exists, `accessories_received`/
  `arrival_condition_notes` do not).
- **Real production impact, not just two dead fields**: `BookIn.jsx`'s save
  (`apiClient.entities.JobCard.update(jobCardId, {...})`, line ~166) is a single combined
  payload including both missing columns — PostgREST validates the whole request against its
  schema cache, so an unknown column doesn't silently drop just that field, it fails the
  **entire** request with `PGRST204`. If this is accurate (the migration file's own comment
  says this was "found live via a real Book In save"), **the Book In workflow may currently be
  completely broken in production** for any technician who saves a booked-in machine, not a
  cosmetic gap. This has NOT been independently re-confirmed live this session (would require
  a real Book In save against production, which wasn't performed) — flagging as "very likely,
  strongly evidenced" rather than "confirmed live" until someone either runs the migration and
  the workflow starts working, or a live probe confirms the failure first.
- **Fix ready, not yet live**: `alter table public.job_cards add column if not exists
  accessories_received text; ... arrival_condition_notes text;` — purely additive, two
  nullable text columns, no RLS change needed (`job_cards` policies are already
  column-agnostic). Same bug class already fixed 3 times before in this schema
  (`0008`: job_number/date_received, `0010`: service_records fields, `0022`: machine_type) —
  a recurring pattern worth remembering: whenever a live UI field write starts failing with
  `PGRST204`, check first whether the column simply doesn't exist in Postgres yet, the same
  way the Laravel model already declares it.
- **Needs the user**: apply `0025_job_cards_accessories_and_arrival_notes.sql` via the
  Supabase SQL Editor, same as every other migration in this project (no automated apply
  pipeline exists). Recommend prioritizing this over cosmetic work given the likely severity.

## RESOLVED, real-build-verified (2026-08-15, Phase F): Android photo-display bugs fixed

- Real-device testing (physical phone) found two bugs in the just-shipped E2 photo-upload
  feature: uploaded photo thumbnails rendered blank/broken, and there was no way to open/view
  a photo at all (no full-screen viewer existed anywhere).
- **Root-caused, not guessed**: `mobile-android/app/build.gradle.kts`/`libs.versions.toml`
  only declared `coil3:coil-compose:3.2.0` — Coil 3.x split network image loading into a
  separate artifact (`coil3-network-okhttp`), so every `AsyncImage(model = <https url>)` had
  no registered fetcher and silently rendered nothing (no crash, no error UI, since no
  `error =`/`onState` handler existed either). Separately, none of the photo thumbnails had a
  `clickable` modifier — a second, independent gap, not just a symptom of the first.
- **Fixed by `android-ui-bee`**: added `coil-network-okhttp` (reusing the existing `coil`
  version ref, no OkHttp double-declaration — confirmed the project's unused OkHttp/Retrofit
  catalog entries aren't applied to the `:app` module). Added a shared `PhotoThumbnail`
  (explicit resolving/broken/loaded states, never a silent blank tile) and a new in-app
  `CapPhotoViewerDialog` (full-screen, black backdrop, close button, dismiss on backdrop
  tap/back — deliberately stays in-app, never hands a signed URL to an external
  app/browser), wired onto all 3 photo-thumbnail sites plus Knowledge Base's photo rows
  (previously launched an external browser via `LocalUriHandler`, same underlying "should stay
  in-app" issue — KB documents still open externally since the viewer can't render PDFs).
  Same pass also fixed: dashboard quick-actions being completely permission-ungated (an
  accountant could reach forms RLS would reject), 6 screens' detail views not responding to
  the system back button (local Compose state, not nav destinations — `BackHandler` added),
  several blank-subtitle rendering bugs, and stale "Firebase" strings left over from the
  Supabase migration in `AccountScreen`/`DashboardScreen`/`StatusScreen`'s headers.
- **Both explicit unknowns `android-ui-bee` flagged are now answered with real evidence, not
  inference** — `testing-bee` got a genuine CLI `BUILD SUCCESSFUL` (see the dedicated RESOLVED
  Avast/TLS entry above for how) and confirmed: `coil-network-okhttp` resolves cleanly
  (verified via `:app:dependencies`, and its supply-chain integrity via a SHA-1 match against
  Maven Central); `AsyncImage(onState = ...)` is real, correct Coil 3.2.0 API (resolves to the
  singleton `AsyncImage` overload, `AsyncImagePainter.State.Loading`/`.Error` are real
  classes); `Icons.Outlined.BrokenImage` resolves via `material-icons-extended`. **23/23 unit
  tests pass** (`ObserveCollectionFailurePolicyTest` 5, `ObserveFirestoreCollectionFailurePolicyTest`
  7, `SupabaseStorageTest` 7 — added in E2, `SyncResourcesTest` 4 — baseline grew from the E1
  gate's 16, correctly not assumed unchanged). `lintDebug`: 0 errors, 31 pre-existing/unrelated
  warnings. `assembleDebug`: real 25,625,910-byte APK produced. Also confirmed via the built
  APK's own `META-INF/services` that Coil's fetcher auto-registration mechanism the fix relies
  on is genuinely present (the app uses Coil's default singleton `ImageLoader`, no custom one).
  **What remains genuinely unverified**: on-device/runtime visual behavior (does the photo
  actually render, does the dialog dismiss correctly, do the 6 new `BackHandler`s behave as
  expected) — compilation/packaging proves the code is correct and buildable, not that it
  looks/behaves right on a real screen. A device run remains a worthwhile product check, but
  per `testing-bee`'s own assessment, an Android Studio GUI rebuild is no longer *required* to
  confirm this specific change compiles and packages correctly.
- **Deliberately NOT fixed, reported instead**: `StatusScreen` still labels the backend
  "Firebase" — left alone because `StatusRepository.checkHealth()`/`testConnection()` genuinely
  still probe Firestore, so the label is accurate to what's actually measured; a truthful fix
  needs a real Supabase health-check capability on `StatusRepository`
  (`supabase-android-bee`'s scope, not invocable this session — see the recurring
  agent-registration gap entry). `CalendarScreen`'s dead Google-Calendar empty-state text
  (references a Settings page that no longer exists) and `SimpleRecordsScreen`'s (Users)
  missing search field (every other list screen has one) were flagged as real but left for a
  deliberate follow-up decision rather than guessed at inline. The photo remove-button's 32dp
  touch target is below Material's 48dp minimum — flagged as a disclosed tradeoff (a 48dp
  target on an 80dp thumbnail would cover over a third of it), not silently fixed.

**UPDATE (2026-08-15, round 2, commit `95e7c1c`) — all three deferred items resolved, also
real-build-verified**: the 32dp touch target is now a 48dp tap area (nested Box, visible scrim
unchanged at 32dp — disclosed tradeoff: the tap region is now the thumbnail's whole top-right
48×48 corner, ~36% of an 80dp tile, inherent to a compliant target at that tile size, only
affects not-yet-uploaded picked photos which are trivially re-pickable); `SimpleRecordsScreen`
(Users) now has the same `CapSearchField` pattern as every other list screen; the Google
Calendar empty state no longer references the deleted web System Settings page (feature/section/
`GoogleCalendarRepository` itself untouched, that removal stays a separate Phase I call).
`testing-bee` reused the Avast trust-store workaround for another real build: 23/23 unit tests,
0 lint errors/31 pre-existing warnings (caught and corrected its own stale-lint-report near-miss
before reporting), real 26MB APK. Still unverified: on-device/runtime behavior for all of Phase
F (compilation/packaging proven, actual device behavior not).

## Web: photo click opens a new browser tab instead of an in-app viewer — logged, deferred (found 2026-08-15, user real-world testing)

- User: photo upload/display works correctly end-to-end on `frontend/`, but clicking an
  uploaded photo currently opens it via a plain new browser tab (not the final desired UX).
  Wants an in-app/lightbox/full-screen viewer instead, matching the in-app viewer just built
  for Android (see the entry above) — same underlying goal (stay in the app, don't hand a
  signed Storage URL off to the browser chrome), different platform/implementation.
- **Explicitly deferred by the user** — do not let this block or interrupt the current Android
  Phase F priority. **Located and scoped this session (read-only, not implemented)**:
  `frontend/src/components/RecordPhotoGallery.jsx` already has the extension point built in —
  it takes an optional `onPhotoClick(url)` prop ("caller handles what 'click' means, e.g. a
  lightbox") and only falls back to a plain `<a target="_blank">` when the caller omits it.
  None of its 3 call sites (`MachineDetail.jsx`, `ServiceRecords.jsx`, `JobCardDetail.jsx`)
  currently pass it. This is a smaller job than it first looked: build one simple lightbox
  component (consistent with the existing design system) and wire `onPhotoClick` at those 3
  call sites — no gallery-component rework needed.

## RESOLVED (2026-08-14) — Android `"users"` Firestore listener failure isolated; E1 gate PASSED

- **Architectural audit completed first, as required** (read-only, Read/Grep/Glob only — no
  code touched during the audit itself). Determination: **Option C — `"users"` is intentionally
  retained as a transitional dependency**, not a missed migration (B) and not obsolete (D).
  Evidence: `Core.kt`'s own pre-existing comment already called it "a known, disclosed, temporary
  artifact of a partial migration, resolved once Firestore itself migrates in a later phase";
  `docs/android/ANDROID_SUPABASE_MIGRATION.md`'s §1 mapping table lists `users → public.users`
  as a real, planned equivalent (the table already exists, already used by `frontend/`'s
  `UserAdmin.jsx`); no migration phase (E–J) explicitly owns finishing that migration, and §7
  separately flags the feature itself as "web-only... borderline-unnecessary" for mobile — a real
  product-scope ambiguity, disclosed, not resolved by this work (see PROJECT_STATE.md).
- **Fix implemented, scoped exactly to reliability isolation — no migration, no removal.**
  `RecordsRepository.observeFirestoreCollection("users")` (`Core.kt`) no longer calls
  `close(error)` on a Firestore listener error. It now sends the last-known-good record list (or
  empty, if none yet), tears down the dead `ListenerRegistration`, and retries with a fresh
  listener after 20s (`FIRESTORE_RETRY_DELAY_MS`). Deliberately **stricter** than the existing
  Supabase-stream policy (`SupabaseDataRepository.observeCollection()`): never closes, not even on
  a first-attempt/cold-start failure, because `firestore.rules:31`'s `allow list: if isAdmin()`
  and Android's Supabase-based `users.view` permission gate are two unsynchronized authorization
  systems, so a `PERMISSION_DENIED` here is not transient — it fails identically on every attempt.
  Applying the Supabase carve-out would have reproduced this exact bug for the real account it
  affects.
- **Independently verified, not self-reported**: `testing-bee` (registered agent this session;
  `supabase-android-bee`/`migration-audit-bee` were not — see the agent-registration note below)
  ran a real Gradle build (`BUILD SUCCESSFUL`, 16/16 unit tests incl. 7 new deterministic tests
  proving no duplicate listeners, no coroutine/job leaks, no runaway retries, and no shared-flow
  termination), confirmed all 3 existing live regression baselines unchanged (token-refresh
  19/19, Phase D 21/21, E1 Knowledge Base 48/48), and confirmed the 4 pre-existing QA accounts
  unchanged (before=after=4, same UUIDs). Full detail: `SESSION_LOG.md`'s matching 2026-08-14
  entry and `DECISIONS.md`.
- **E1 gate decision: PASS.**
- **Agent-registration gap, disclosed, not worked around by editing config**: `supabase-android-
  bee` and `migration-audit-bee` both have definition files under `.claude/agents/` but were not
  invocable in this session (`Agent type '...' not found. Available agents: android-ui-bee,
  testing-bee`). Per explicit user instruction, no agent definition was created/modified/deleted
  to fix this. Queen Bee implemented the code fix directly (disclosed plainly, not hidden) and
  performed the equivalent read-only final-scope audit directly via `git status`/`git diff
  --stat`. This gap will very likely recur next session — worth investigating (not yet done) why
  these two agent types aren't loading despite their definition files existing.

**Original finding, preserved below for history:**

## ORIGINAL — Android `"users"` collection is still Firestore-backed and can still permanently kill all other screens' data on a listener error (found 2026-08-14, E1 verification)

- The E1 reliability remediation (session-expiry/token-refresh + stream-recovery) correctly
  fixed all 10 Supabase-backed collections (`clients`/`machines`/`service_records`/
  `job_cards`/`job_card_lines`/`knowledge_machines`/`knowledge_notes`/`knowledge_media`/
  `knowledge_documents`/`knowledge_service_codes`) — proven via a new negative-control unit
  test (`ObserveCollectionFailurePolicyTest.kt`, 5/5 pass).
- **`"users"` is an 11th collection combined via the same `Core.kt:270-292`
  `observeCollections()`/`combine()`, but it is still routed to
  `observeFirestoreCollection()` (`Core.kt:258-268`), which still calls `close(error)` on any
  Firestore listener error — untouched by this fix.** `MainActivity.kt:127-138` includes
  `"users"` in `permittedCollections`, gated only on the `users.view` permission, not on
  migration status. Confirmed independently by Queen Bee via direct code read (not just
  trusting `testing-bee`'s report) — both file:line ranges checked directly.
- **Not hypothetical**: `Core.kt`'s own KDoc documents the Firebase-bridge login as
  best-effort (`runCatching`) and states failure is "a real, expected possibility since only
  1 real user has been migrated to Supabase Auth so far" (see the matching entry below on
  real users not yet having Supabase accounts). Any signed-in user with `users.view`
  permission whose Firebase-bridge login fails, or who lacks Firestore admin rights
  (`firestore.rules:31` requires `isAdmin()` for a `list` operation, which is what this
  listener performs) will get a `PERMISSION_DENIED` Firestore error at cold start — which
  still permanently kills every other (correctly-fixed) Supabase stream's data via the shared
  `combine()`, exactly the blast-radius failure mode this whole remediation exists to close.
- **Per explicit user instruction: the fix must NOT be guessed at.** The `users` collection's
  correct status needs to be determined from the actual migration architecture first — is it
  (A) intentionally still Firebase/Firestore during the migration (deliberate, temporary),
  (B) supposed to have already migrated to Supabase (a real migration gap), (C) intentionally
  retained as a transitional dependency for a different reason than A, or (D) obsolete/
  removable. **Not yet determined.** `Core.kt`/`MainActivity.kt` must not be modified until
  this is resolved — planned as a separate, fresh investigation task per the user's own
  stated plan.
- **Blocks**: E1 cannot be declared complete, `migration-audit-bee`'s follow-up audit has not
  been run yet, E2/Photo Upload/Calendar must not start until this is resolved.

## RESOLVED: QA-script cleanup false-PASS bug — 2 scripts fixed, live-reverified (2026-08-14, E1 verification prep)

- **Root cause, proven by reading the actual code (not assumed)**: `qa-verify-android-token-
  refresh-contract.mjs` had two compounding swallow points — `deleteUser(uid).catch(() => {})`
  never inspected the resolved `{ error }` (supabase-js *resolves*, doesn't throw, on most
  API-level failures), and its verification step, `getUserById(uid).catch(() => ({ data: null }))`,
  converted any verification-CALL error (unrelated to whether the user still exists) into
  "confirmed gone." `qa-verify-android-phase-d-rest-contract.mjs` had no error-checking or
  post-cleanup verification of any kind at all — `"Cleanup complete."` printed
  unconditionally, cleanup status never affected the exit code.
  `qa-verify-android-phase-e1-knowledge-rest-contract.mjs` was audited and needed no fix — it
  already does fresh independent re-verification (`listUsers()` + per-table `SELECT`s after
  every delete), the pattern the other two now also follow.
- **Fixed**: both scripts now capture every cleanup call's own `{ error }`, then
  independently re-verify absence via a fresh `listUsers()`/`SELECT` (fail-closed — any
  verification-call error counts as "not confirmed gone," never as success), and record each
  as a real pass/fail check that participates in the exit code.
- **Live-verified for real**, not just code-reviewed: `qa-verify-android-token-refresh-
  contract.mjs` 19/19 pass (was 18/18), `qa-verify-android-phase-d-rest-contract.mjs` 21/21
  pass (was 16/16) — both run against real production Supabase, both scripts' own throwaway
  users independently confirmed gone afterward via a separate `listUsers()` call outside
  either script.
- **`testing-bee`'s own follow-up run found one more instance of the same bug class**: a new
  script it wrote (`qa-verify-android-session-revocation-contract.mjs`, testing server-side
  logout revocation — a real gap none of the 3 existing scripts covered) had an `indexOf`
  returning `-1`/`splice(-1,1)` bug that silently dropped the wrong user from its own cleanup
  list, leaking one throwaway account on its first run. Caught by its own independent
  verification (not blind trust in the script's self-report), immediately deleted, script
  fixed, re-run clean at 20/20. No 5th leftover account resulted.
- **Separately noted, not yet fixed**: `qa-verify-android-token-refresh-contract.mjs:202` has
  a hardcoded tautological `record(..., true, ...)` that cannot fail — contributes 1 of the
  script's reported 19; the real observation is in the `NOTE` immediately above it (5
  concurrent refreshes all returned 200). Low priority, cosmetic/scoring-accuracy only.

## Real Android users likely can't log in via Supabase Auth yet — only 1 of presumably several real users is migrated (found 2026-08-13, Phase C)
- Confirmed live: only 3 Supabase Auth users exist in production — the 1 real admin
  (`admin@connoisseurauto.co.za`, migrated during the web cutover) plus 2 unrelated leftover
  throwaway QA test accounts (see the entry below). Android's Phase C authentication now
  requires a real Supabase Auth account to log in (Firebase Auth alone is no longer
  sufficient/authoritative) — any real technician/staff user without one cannot log into the
  Android app until the `users` migration phase is extended to cover them, which itself is
  gated on the same still-untested password-reset-email flow already flagged from the web
  migration (`project_supabase_password_reset_untested` in queen-bee memory).
- Not a bug in Phase C's code — a real, pre-existing gap in how many users have been
  migrated, surfaced by this phase rather than caused by it.

## UPDATED — now 4 leftover throwaway QA test accounts live in production `public.users`/Supabase Auth, none deleted, still needs a decision (originally 2 found 2026-08-13 Phase C; +2 more found 2026-08-14 during E1 verification, cause identified and fixed — see the QA-cleanup-bug RESOLVED entry above)
- Original 2 (found 2026-08-13, Phase C — predate this project's own QA-script cleanup
  pattern, cause never identified, likely debris from an unrelated earlier run):
  `qa-fixes+admin-1786627520045-4gmd@invalid.local` (role: admin, active),
  `qa-fixes+technician-1786627521518-gac2@invalid.local` (role: technician, active).
- **2 more, found 2026-08-14 during Phase E1 reliability verification, root cause now fully
  understood and fixed** (see the QA-cleanup-bug RESOLVED entry above — this is what that fix
  was for): `qa-android-refresh+1786695110465-wr0314@invalid.local` (from
  `qa-verify-android-token-refresh-contract.mjs`'s pre-fix cleanup bug),
  `qa-phase-d+technician-1786695144406-fx54@invalid.local` (from
  `qa-verify-android-phase-d-rest-contract.mjs`'s pre-fix cleanup bug). Both scripts are now
  fixed and re-verified clean (19/19, 21/21) — these 2 are the only accounts that leaked
  before the fix landed; no further leaks occurred during `testing-bee`'s subsequent full
  verification pass (independently re-confirmed: exactly 4 total, unchanged, after that pass).
- **Total live count as of 2026-08-14: exactly 4, confirmed via a fresh `listUsers()` call**,
  independently re-verified by Queen Bee (not trusted from any script's self-report).
- **None deleted, none authorized for deletion** — user-account deletion is a destructive
  action requiring explicit approval. Explicitly instructed not to delete these 4 as part of
  the E1 reliability gate. Needs the user's decision on whether/when to delete them.

## RESOLVED (2026-08-15) — root cause found: Avast TLS interception, not a project/CA defect; a legitimate CLI build IS possible on this machine

- **`testing-bee`, dispatched to verify Phase F's photo-viewer fix, root-caused the entire
  multi-month "this machine's Gradle wrapper/CLI can't build" mystery for real** (dumped the
  actual TLS certificate chain served for `dl.google.com`/`repo.maven.apache.org` during a
  live failed resolution): both present leaf certs issued by `CN=Avast Web/Mail Shield Root` —
  **Avast Antivirus is TLS-intercepting all HTTPS traffic on this machine.** Avast's root CA
  is installed in the Windows trust store already (thumbprint
  `BFE0A38E40D6DBECAC0CA9FA49AF2AB4118E47A3`) but is **absent** from the Android Studio JBR's
  own `cacerts` file — which is exactly why Android Studio's GUI build has always succeeded
  (different network/trust stack) while a bare `gradlew.bat` CLI invocation always failed on
  *whichever* dependency happened to be uncached that session. This was never a per-dependency
  or per-artifact problem, and never a real absence of a valid CA chain — every previous
  session's narrower theories (below, kept for history) were reasonable given the evidence
  available at the time, but the actual root cause is this one system-level interception.
- **Legitimate workaround found and used, not a validation bypass**: copied the JBR's
  `cacerts` into a scratch location, imported the Avast root the OS already trusts into that
  copy, and pointed the Gradle **daemon** at it via `org.gradle.jvmargs` (must go through the
  daemon's own JVM args — `-Djavax.net.ssl.trustStoreType=Windows-ROOT` alone breaks SunJSSE's
  default `SSLContext` init and does not work). No system file, JDK install, or repo file was
  modified. Supply-chain integrity was independently re-checked (not just "it downloaded"):
  the resolved `coil-network-okhttp` jar's SHA-1 matched Maven Central's published `.sha1`
  exactly, confirming the intercepted-but-now-trusted download wasn't tampered with.
- **Result: the first genuine CLI `BUILD SUCCESSFUL` in this project's history** —
  `compileDebugKotlin`, `testDebugUnitTest` (23/23 pass — see the Phase F entry above for the
  breakdown), `lintDebug` (0 errors, 31 warnings, all pre-existing/unrelated), and
  `assembleDebug` (real 25,625,910-byte APK) all passed for real, not via Android Studio's GUI.
- **Not yet made durable** — this was a scratch/one-off trust-store override for this one
  verification run, not a permanent fix. Making it permanent (importing the Avast root into
  the JBR's real `cacerts`, or disabling Avast's HTTPS scanning for build traffic) is a
  system-level change that needs the user's own explicit approval/action, not something to do
  silently. Until then, treat CLI Gradle builds on this machine as "possible via this specific
  trust-store technique, not yet a standing capability" — don't assume a bare `gradlew.bat`
  invocation will work without it.
- The two entries immediately below are the prior, narrower (and now superseded) theories —
  kept as historical record of the investigation, not because they're still the operative
  explanation.

## SUPERSEDED — see the RESOLVED entry immediately above for the real root cause (Avast TLS interception). This ("home") machine's CLI Gradle build still fails, but Android Studio's own GUI build succeeds (found 2026-08-13/14, Phase D)
- Re-attempted `gradlew.bat assembleDebug` fresh this session (via `testing-bee`) rather than
  assuming the earlier-documented TLS/CA gap still applied unverified. Result: the Gradle
  wrapper's own distribution download succeeded this time (different from the earlier
  `services.gradle.org` symptom), but the build still failed with the same root cause (`PKIX
  path building failed`, no CA trust chain) at a later stage — dependency resolution
  (`hilt-compiler`/`room-compiler` from `dl.google.com`/`repo.maven.apache.org`).
- **The user then opened the project in Android Studio's own GUI (launched by Queen Bee via
  `start studio64.exe <project path>`, built/run manually by the user) and confirmed it
  built and ran successfully.** Android Studio evidently uses a different network/trust path
  for the same underlying Gradle build than a bare `gradlew.bat` CLI invocation.
- **Practical consequence**: a real Android build IS possible on this machine, but only
  through Android Studio's GUI, which Queen Bee cannot drive or verify unattended (no GUI
  automation tool available). Every Android code change from this session onward is still
  only manually-reviewed + REST-contract-tested by Queen Bee, never Queen-Bee-compiler-
  verified — the user must periodically confirm via Android Studio that things still build,
  the same way they just did for Phase C+D together.

## All Android code changes so far (Phases B, C, and D) are manually-reviewed only, NOT compiler-verified by Queen Bee (2026-08-13, updated Phase D)
- **Phase B**: `MainActivity.kt`'s `AdaptiveShell` was rewritten to use a real
  `NavController`/`NavHost` in place of a plain `remember`-state string switch. Every
  `onNavigate("...")` call site was cross-checked by grep against the new label↔route-id
  adapter to catch typos/mismatches without a compiler.
- **Phase C**: new `SupabaseAuth.kt` + rewritten `Core.kt`'s `AuthRepository` (see
  `docs/ai-memory/DECISIONS.md`'s matching entry and `docs/android/ANDROID_SUPABASE_MIGRATION.md`
  §11.9 for exactly what could/couldn't be verified) — the server-side REST contract the new
  Kotlin code depends on **was** verified for real (`qa-verify-android-auth-rest-contract.mjs`,
  12/12 pass against live Supabase), but the Kotlin code's own compilation/execution
  (`EncryptedSharedPreferences`/`MasterKey` API usage, Hilt wiring, `BuildConfig` field
  generation, actual runtime behavior) was not.
- Confirmed **three separate times now**, across both phases, that this environment cannot
  get a real Android build working: (1) the pinned Gradle wrapper's distribution download,
  (2) directly invoking an already-cached alternate Gradle version (9.2.1) — failed at
  Gradle Plugin Portal resolution — both TLS/CA trust-chain issues, not version-compatibility
  ones; (3) not re-attempted a third time in Phase C since already conclusively established,
  but re-confirmed by the same root cause still being present.
- **Phase D**: new `SupabaseData.kt` + `Core.kt`'s `RecordsRepository`/`StatusRepository`
  changes (see `docs/android/ANDROID_SUPABASE_MIGRATION.md` §12 for full detail) — the
  server-side REST contract was verified for real (`qa-verify-android-phase-d-rest-contract.mjs`,
  16/16 pass against live Supabase, including a genuine RLS-permission finding — see §12.4),
  but the Kotlin code's own compilation was only confirmed indirectly (the user's Android
  Studio GUI build succeeded on the Phase C+D combined working tree at the time; not
  independently re-verified by Queen Bee after Phase D's own edits landed).
- Before trusting any Android code from this session the way the REST-contract results can
  be trusted, either fix this machine's TLS trust store, or verify on the machine where
  Android builds have previously succeeded, per `docs/android/ANDROID_SUPABASE_MIGRATION.md`.
  The Android Studio GUI path (see the entry above) is the one confirmed-working option on
  this machine right now — re-run it after Phase D to be sure.

## RESOLVED: `0023_dashboard_notes_direct_rls.sql` applied and live-verified 24/24 (2026-08-13, later same day)
- User applied it via the SQL Editor. Confirmed live via direct probe (both CHECK
  constraints correctly reject bad input) and via
  `supabase/scripts/qa-verify-dashboard-notes-rls.mjs` — full authorization matrix, 24/24
  checks pass, full cleanup independently verified (0 residual notes/auth users). Dashboard
  notes are fully live now — no further action needed on this. See `SESSION_LOG.md`.

## `supabase/migrations/0023_dashboard_notes_direct_rls.sql` written, NOT yet applied (2026-08-13, later same day) — SUPERSEDED, see RESOLVED entry above
- Dashboard notes now use direct Supabase Auth + RLS (`public.is_admin()`, a `BEFORE INSERT
  OR UPDATE` trigger for `created_by_name`, `CHECK` constraints for content length/color) —
  no server-side service of any kind. Confirmed live 2026-08-13 that the CHECK constraints
  don't exist yet (a real insert with 2001-char content succeeded against the service-role
  client, then was cleaned up) — the migration needs the SQL Editor, same as every other one.
- **Blocks** `supabase/scripts/qa-verify-dashboard-notes-rls.mjs` (the full authorization-
  matrix QA script, ready to run) until applied — it needs the real RLS policies/constraints
  live to test against. Ask Queen Bee to run it once 0023 is confirmed applied.
- Once applied: sticky notes work end-to-end immediately, no deploy of anything else needed
  (no Worker, no Cloud Function — see the RESOLVED entry below for why).

## RESOLVED (migrated to direct RLS, not a server-side service): `dashboardNotes`'s Firebase/GCP billing blocker and the Worker that briefly replaced it are both moot (2026-08-13, same day)
- Two designs were tried and discarded the same day before landing on the final one:
  1. Firebase Cloud Function (original design) — blocked on GCP billing the whole time it
     existed, never live.
  2. Cloudflare Worker (`workers/dashboard-notes-api/`) — built, unit-tested (26/26),
     confirmed to bundle correctly, but never deployed (wrong Cloudflare account logged in
     on this machine — see the git history of this file for that entry's detail if ever
     needed) before being superseded.
  3. **Final: direct Supabase Auth + RLS** (`supabase/migrations/0023_dashboard_notes_direct_rls.sql`)
     — `public.is_admin()` already existed and already expressed exactly this
     "creator or admin" rule everywhere else in this schema; the original premise that RLS
     couldn't express it was simply wrong for this codebase. `workers/dashboard-notes-api/`
     was deleted entirely. See `DECISIONS.md`'s 2026-08-13 entries for the full history.
- Neither Firebase/GCP billing nor a Cloudflare account/deploy is relevant to this feature
  at all anymore — it's pure Postgres + the existing frontend Supabase client.

## SUPERSEDED — see the RESOLVED entry near the top of this file for the real root cause (Avast TLS interception). This ("home") machine's Gradle wrapper cannot download its distribution — blocks direct Android build verification (found 2026-08-13)
- `mobile-android/gradlew.bat testDebugUnitTest`/`lintDebug`/`assembleDebug` fail before
  even reaching the project: `javax.net.ssl.SSLHandshakeException: PKIX path building
  failed` while the Gradle wrapper tries to download `gradle-8.14.5-bin.zip` from
  `services.gradle.org` — this JDK/machine has no valid CA trust chain for that host. A
  `C:\Users\USER-PC\.gradle\wrapper\dists\gradle-8.14.5-bin\` cache entry existed but was
  only a partial `.zip.part` (an earlier attempt that also failed) — removed, not a usable
  cache.
- Found `C:\Program Files\Android\Android Studio\jbr` (JetBrains Runtime, OpenJDK 21.0.9) as
  a usable `JAVA_HOME` on this machine — that part works. The download/TLS-trust step is
  what fails, not a missing JDK.
- **Not something to work around by disabling certificate validation** — that would be a
  real security downgrade for a one-off local verification. The fix is either: install a
  proper CA bundle/trust store this JDK will use, run Android builds through Android Studio
  itself (which bundles its own network stack) instead of a bare `gradlew.bat` shell-out, or
  do Android build verification on the other ("work") machine where it's previously
  succeeded (see the matching `supabase/.env` portability gap below — same
  two-machine-split pattern).
- **Practical effect**: any Android build/lint/test claim made from this machine is a static
  code read, not a real build, until this is fixed. Say so explicitly rather than re-stating
  an old verification claim as if it were re-confirmed.

## RESOLVED: migrations 0020/0021/0022 confirmed applied and live (2026-08-13, continuation session)
- User applied all three via the SQL Editor. Confirmed via a new read-only script
  (`supabase/scripts/qa-check-0020-0021-0022-applied.mjs`) that all 5 new
  columns/behaviors exist live: `service_records.photos`, `job_cards.arrival_photos`,
  `job_card_settings.available_statuses`/`line_types`, `job_cards.machine_type`.
- Went beyond existence-checking (spot-checked actual values, not just that the query
  didn't error): `job_card_settings`'s singleton row has `available_statuses`/`line_types`
  matching the exact default arrays from the migration files (no drift); a real
  `service_records` row and a real `job_cards` row both show the expected `[]` default for
  their new jsonb array columns; `machine_type` is `null` on the sampled pre-existing job
  card, as expected (only populated going forward via `BookIn.jsx`).
- Photo uploads on Log Service/Book In and the Settings > Job Cards status/line-type editor
  should now work end-to-end. Not separately click-through QA'd this session (no browser
  tool) — code-level wiring for all three was already verified in the session that wrote
  them; this check only confirms the database side landed correctly.

## Migrations 0020/0021 pending application (2026-08-13, later still same day) — SUPERSEDED, see RESOLVED entry above
- `0020_service_and_job_card_photos.sql`: exact SQL given to the user verbatim, only 2
  columns (`service_records.photos`, `job_cards.arrival_photos`). Not yet confirmed
  applied.
- `0021_job_card_settings_statuses_and_line_types.sql`: adds `job_card_settings.
  available_statuses`/`line_types` (both default to the exact values already hardcoded, so
  applying it changes nothing visually by itself). `JobCardSettingsPanel.jsx` already
  guards for the pre-migration shape (shows a "not available yet" message instead of
  erroring) so the Settings page works either way.
- Real bugs found+fixed this same continuation (Jobs.jsx client/machine join,
  dead-feeling desktop row clicks, missing line-item edit, dead `machine_type` field,
  Pastel importer intra-file duplicate detection + name-fuzzy-matching gaps) are all
  independent of these two pending migrations and are already live/verified where
  applicable — see SESSION_LOG.md's matching entry for the full, itemized breakdown.

## Migration 0018/0019 status update: APPLIED and live-QA verified 18/18 (2026-08-13, later same day)
- Confirmed applied via `supabase/scripts/qa-check-0018-0019-applied.mjs` and exercised
  live via `supabase/scripts/qa-verify-2026-08-13-fixes.mjs` (18/18 pass, full residual
  cleanup confirmed). The entry below is kept as historical record of the pre-apply state
  — superseded, not deleted, since it documents real reasoning about the migration.
- **New, not yet applied**: `supabase/migrations/0020_service_and_job_card_photos.sql`
  (adds `service_records.photos`/`job_cards.arrival_photos`, closing the 2026-08-06-flagged
  photo-upload gap). Needs the SQL Editor before `LogServiceModal.jsx`/`BookIn.jsx`'s photo
  writes actually persist (the writes are coded correctly now, but will 400/column-not-
  found until this migration runs).

## Migrations 0018/0019 not yet applied — Settings/Products & Services/Customer Import are code-complete but not live (2026-08-13) — SUPERSEDED, see entry above
- `supabase/migrations/0018_products_services_and_job_card_settings.sql` and
  `0019_client_imports.sql` need the SQL Editor, same as every prior migration. Until
  applied: `/settings` will error loading Job Card settings/catalogue, `AddLineForm`'s
  catalogue picker will just show 0 items (harmless — custom entry still works),
  `ImportCustomers.jsx` will fail to save the post-import history row (the actual client
  inserts would still work — `public.clients` already has all the columns being written
  except `legacy_pastel_customer_code`, which is one of the new columns).
- Also new: `settings.access` and `clients.import` permission rows are inserted by 0018 —
  until applied, the `/settings` route/nav item will be invisible to everyone (RoleGuard
  denies by default when the permission key doesn't exist / isn't granted), including
  admins, since admin's bypass is in `has_permission()`'s SQL function, not the frontend.

## RESOLVED: live/scripted QA now run on the Job Card / Settings / catalogue / import fixes (2026-08-13, later same day)
- `supabase/scripts/qa-verify-2026-08-13-fixes.mjs`, 18/18 pass — see SESSION_LOG.md.
  Covers the Job Card line-item fix, products_services/job_card_settings RLS,
  dashboard_notes defense-in-depth, client_imports/legacy_pastel_customer_code dedup. Still
  NOT covered: the Notes-linked-to-client UI fix itself can't be exercised end-to-end
  (depends on the still-undeployed dashboardNotes Cloud Function — billing issue below);
  no browser-based visual/click-through QA has been done (still no browser tool this
  session); the new photo fields (migration 0020) are untested since not yet applied.

## Redesign phase framing discrepancy (2026-08-13)
- The user's most recent instruction framed Phase 5 (Jobs/Service Records) as the next
  phase to start, with Phase 1-4 "already completed". `git log` shows Phases 5-8 (Jobs,
  Knowledge Base, User Admin, Calendar) already have their own dedicated redesign commits
  predating this session. Only phases 9 (Forms/Modals polish pass), 10 (full responsive
  pass), 11 (Android), 12 (final consistency polish) are genuinely not started. Flagged to
  the user directly in this session's report — do not silently redo phases 5-8's redesign
  work in a future session without first confirming what specifically still needs
  attention in them (e.g. section H's specific Calendar checklist may still have gaps even
  though the phase's initial redesign commit exists).

## `dashboardNotes` Cloud Function cannot be deployed — GCP billing not enabled on `capdatabasefb2` (found 2026-08-13) — SUPERSEDED, see the RESOLVED (migrated away) entry above
- `firebase deploy --only functions` fails identically on two separate attempts (not
  transient) with: `Request to secretmanager.googleapis.com... had HTTP Error: 403, This
  API method requires billing to be enabled` for `SUPABASE_SERVICE_ROLE_KEY`. Exact fix
  link the CLI printed: `https://console.developers.google.com/billing/enable?project=
  capdatabasefb2`.
- **Likely the same root cause as the real 500/503s from the (now-removed) Google Calendar
  Cloud Function that prompted its removal on 2026-08-12** — never confirmed at the time
  (see that entry below), now strongly corroborated: a genuine billing lapse on this GCP
  project, not a code bug.
- **Blocks**: the sticky-notes feature entirely (its Cloud Function doesn't exist live).
  Everything else in the 2026-08-13 full cutover is unaffected — the web app's core
  auth/data path doesn't depend on this function.
- **Fix**: user re-enables billing at the link above, then re-runs `firebase deploy --only
  functions` (or asks Queen Bee to retry — Queen Bee cannot enable billing itself).

## `supabase/migrations/0017_dashboard_notes.sql` still not applied (confirmed live 2026-08-13)
- Confirmed via a direct read-only query immediately before the full cutover: `public.
  dashboard_notes` does not exist yet. Needs the SQL Editor, same as every other migration.
  Blocks sticky notes alongside the billing issue above — both need to be resolved before
  this feature works.

## `apiClient.js`'s static Supabase import ships `@supabase/supabase-js` in the production bundle even in Firebase mode — RESOLVED, moot (Firebase removed entirely 2026-08-13)
- This entire class of concern (Supabase code shipping even when Firebase was the active
  backend) no longer applies — there is no Firebase branch left to accidentally ship
  alongside. Left below as historical record of a real, once-relevant finding, not
  something to act on.
- A past session's memory claimed a real production build with `VITE_AUTH_BACKEND=firebase`
  showed "zero Supabase-related code" in the output bundle via `grep`. Re-checked directly
  during this session's UI redesign work (unrelated change, found incidentally while
  verifying a real build): `dist/assets/*.js` **does** contain `@supabase/supabase-js` and
  other Supabase-related strings today. Root cause: `apiClient.js` imports
  `supabaseApiClient` via a top-level **static** `import` (not inside the `VITE_AUTH_BACKEND
  === "supabase"` branch) — ES module imports are hoisted and always evaluated regardless of
  a runtime ternary, so esbuild/Vite cannot tree-shake the whole `supabaseApiClient.js`
  module graph away just because the ternary picks the Firebase branch at runtime. The
  earlier "zero Supabase code" claim was either testing a different code state before this
  or was simply inaccurate — not re-litigated further, not worth the archaeology.
- **Not a runtime or security regression**: `services/supabase/client.js`'s Supabase client
  construction is itself lazy (a `Proxy`, deferred to first real `supabase.*` call, not
  import time — this part of the design is real and correct), and nothing else in Firebase
  mode ever calls into `supabaseApiClient`. So Supabase code is present but inert/unexecuted
  when `VITE_AUTH_BACKEND=firebase` — no network calls, no behavior change.
- **Real cost**: unnecessary bundle size (the production bundle is ~1.6MB, larger than it
  needs to be for a Firebase-only deploy). Not fixed this session — out of scope for a UI
  redesign pass; would need either a real dynamic `import()` for the Supabase branch (the
  exact thing a past session avoided due to a `vite.config.js` top-level-await build error)
  or a build-time `define`-based dead code elimination approach. Flagged for whoever next
  works on bundle size or the eventual real cutover.

## Repeated pattern: unexplained duplicate throwaway QA test users appear ~7s after intentional creation (observed 4x across 2026-08-12/13) — cause NOT identified
- Across three separate work sessions/days, creating exactly one throwaway QA user via
  `qa-test-user.mjs create` was followed, consistently ~7 seconds later, by a SECOND
  throwaway user appearing in `auth.users`/`public.users` with the same script's naming
  pattern (`phase3-qa-test+<timestamp>@invalid.local`) that was never intentionally created.
  Happened 4 times total now (2026-08-12 x3, 2026-08-13 x1, during 0016 storage-RLS
  verification). The ~7s timing has been consistent every single time, which argues against
  pure coincidence. Each time: verified it carried no real data (role/permissions matched a
  fresh throwaway default, no `legacy_firebase_uid`), deleted via `qa-test-user.mjs delete` +
  `verify-gone` (both auth + profile rows confirmed gone every time).
- **Root cause still not identified**, despite now being a clearly reproducible pattern (4/4
  same-shape occurrences, consistent ~7s delay). No retry logic exists in `qa-test-user.mjs`
  itself (read directly, confirmed, again). Leading hypothesis remains a tool-execution-layer
  artifact (e.g. a Bash command being dispatched twice in this environment) rather than the
  script or Supabase itself, but this has not been proven. **No security impact confirmed in
  any occurrence** (every duplicate was a fresh, permission-less throwaway with no real data
  ever touched) — but the consistency of the pattern means it should not be dismissed as a
  one-off any longer. Worth a future session investigating the tool-execution layer directly
  if it recurs a 5th time, rather than just cleaning up again.
- **Practical mitigation already in place and repeatedly proven effective**: always re-check
  `auth.users`/`public.users` row counts after creating any QA test account, before assuming
  exactly what you created is what exists — this is what caught all 4 occurrences before any
  report was finalized.

## Password reset / recovery flow — mechanism fully verified live via script; real email-inbox delivery and real browser UI remain untested (2026-08-12)
- Full recovery mechanism tested end-to-end for real, against a throwaway Supabase Auth user,
  using the exact same API calls the real frontend code makes (`resetPasswordForEmail()`,
  `admin.generateLink()` to obtain a real actionable link without needing an inbox,
  `setSession()` from the link's real hash-fragment tokens exactly as `detectSessionInUrl`
  would on page load, `updateUser({password})` exactly as `ResetPassword.jsx`'s
  `handleSubmit` calls). **All PASS**: link generated correctly with the right
  `redirect_to`, link redirects to the expected local route with `access_token`/
  `refresh_token`/`type=recovery` in the hash fragment (matches `ResetPassword.jsx`'s
  documented assumption), session established from those tokens, password changed, **old
  password confirmed rejected**, **new password confirmed working** with a real
  `signInWithPassword()` session.
- **Two things NOT verified, reported honestly rather than assumed**: (1) real SMTP email
  delivery / a human clicking a real inbox link — throwaway QA accounts deliberately use a
  non-deliverable `@invalid.local` domain (by design, to avoid real inbox side effects),
  and Supabase's real `resetPasswordForEmail()` send path actually rejects that domain
  outright ("Email address is invalid") even though `admin.generateLink()` (which doesn't
  send) accepts it — so the literal "does a real email land in a real inbox" question
  remains genuinely untested and can only be tested with a real receivable address, which is
  a manual-only step. (2) `ResetPassword.jsx`'s actual React UI (rendering, loading state,
  form validation, redirect-to-`/login` behavior) was never rendered in a browser this
  session — no browser automation tool was available (confirmed via a direct capability
  check partway through this session, despite the system prompt referencing one) — only the
  underlying Supabase Auth API calls the page depends on were exercised directly via script.
- Did NOT touch the real admin's credential — used only a throwaway QA account, deleted and
  verified gone afterward.

## `ClientDetail.jsx`/`MachineDetail.jsx`'s live `watch()`/`subscribe()` calls receive zero realtime events on Supabase — RESOLVED, fixed and empirically re-verified live (found 2026-08-12, fixed 2026-08-13)
- `PHASE2_CUTOVER_CHECKLIST.md` section 1 already flagged realtime semantics as an
  undecided item (re-query vs. snapshot merge) but had not actually tested whether events
  fire at all. Investigated as part of pre-cutover readiness: `apiClient.entities.Client
  .watch(id, ...)` (`ClientDetail.jsx`) and `apiClient.entities.Machine.watch(id, ...)`/
  `.subscribe({}, ...)` (`MachineDetail.jsx`/`ClientDetail.jsx`) are the only real page-level
  consumers of realtime (`Dashboard.jsx`/`CalendarPage.jsx` only load-once-on-mount, no
  realtime dependency, unaffected by anything below).
- `supabaseApiClient.js`'s `makeEntity().watch()`/`.subscribe()` are implemented correctly
  (subscribe to `postgres_changes`, re-query the affected row/list on any event — a
  reasonable design, not what's broken) via `database.js`'s `subscribeToTable()`.
- **The actual gap, confirmed live via two real empirical tests** (not just static review):
  opened a real `postgres_changes` channel against `clients` (`status: SUBSCRIBED` confirmed)
  then did a real `insert` — zero event received within 8s. Repeated against `machines` with
  a real `update` on a real existing row — same result, zero event received. No migration
  file anywhere runs `alter publication supabase_realtime add table ...` for any table, which
  is what actually turns on `postgres_changes` delivery in Supabase (a table isn't realtime-
  enabled just by existing). The subscribe call itself succeeds (no error, no exception) —
  it just silently never fires, which is the worse failure mode since nothing surfaces to the
  user or the console.
- **Impact**: `ClientDetail.jsx`/`MachineDetail.jsx` will still load correctly on
  navigation/mount (their initial `get()`/`filter()` calls are unaffected), but won't
  auto-refresh if the same record is edited elsewhere (e.g. another browser tab, or — once
  Android gets Supabase awareness someday — another device) until the user manually
  re-navigates or reloads. Single-admin-today usage makes this a low-severity stale-data
  risk, not a data-loss or security issue.
- **RESOLVED — fixed and applied**: `supabase/migrations/0015_enable_realtime_clients_machines.sql`
  applied via the SQL Editor 2026-08-13. **Empirically re-verified live**, same method that
  found the bug: real `postgres_changes` subscriptions on both tables (`SUBSCRIBED`
  confirmed), a real insert on `clients` and a real update on `machines` — both events
  received (one initial false-negative on `clients` from too-short a timeout under
  concurrent-channel load, resolved by an isolated retest and a final clean 100%-pass combined
  run with generous timing). Consumer code path traced end-to-end: `.watch()`/`.subscribe()`
  callbacks call `setClient`/`setMachine`/`setMachines` directly. Test data cleaned up.

## Generic storage bucket RLS (`documents`/`photos`/`attachments`) — RESOLVED, fixed and empirically re-verified live (2026-08-12, fixed 2026-08-13)
- Full investigation (buckets, policies, path conventions, real feature usage) documented in
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` section 1. Prior policy (`has_active_profile()`
  only) granted any active signed-in user full CRUD on any object in these 3 buckets, no
  ownership/path scoping — a user could read/overwrite/delete another active user's files.
- **Fixed and applied**: `supabase/migrations/0016_storage_generic_buckets_owner_or_admin.sql`
  — tightens to "owner (`{auth.uid()}/...` path prefix, matching the app's own existing upload
  convention) or admin (`is_admin()`, same bypass pattern used everywhere else in
  `0002_rls_policies.sql`)". Zero real files exist in any of these buckets today, so this
  cannot break existing data; the one real generic-upload code path
  (`supabaseApiClient.js`'s `integrations.Core.UploadFile`) already writes to
  `{auth.uid()}/...`, so it continues to work identically for its own uploader after this
  change. Applied via the SQL Editor 2026-08-13.
- **Empirically re-verified live** against the `documents` bucket (representative of all 3 —
  same policy shape applied to all): throwaway admin QA account upload/read(signed
  URL)/update all succeeded on its own file. Throwaway technician QA account
  upload/read/update/delete all succeeded on its OWN file. Cross-user: technician's attempts
  to read/update/delete the admin's file were all denied (verified via ground truth, not just
  absence of an error — re-read the admin's file afterward as the admin to confirm it still
  existed and its content was unchanged by the denied update). Admin's read/update/delete of
  the technician's file all succeeded (admin-bypass working as designed). All test files and
  both QA accounts deleted and verified gone afterward; real bucket contents confirmed back
  to 0 files across all 5 buckets.

## Google Calendar sync removed 2026-08-12 — 3 follow-up actions still needed
- See `docs/ai-memory/DECISIONS.md`'s 2026-08-12 entry for the full removal record. Web UI,
  `apiClient`/`supabaseApiClient` integration, and all 8 Cloud Functions' code are removed.
  **Still outstanding**:
  1. **Delete the actually-deployed Cloud Functions from GCP** (code removal alone doesn't
     stop billing for whatever's still deployed from before). **Still not confirmed done as
     of 2026-08-13** — the source `functions/` dir this command's comment used to live in
     was deleted entirely that day (dashboardNotes migrated off Firebase to a Cloudflare
     Worker, `workers/dashboard-notes-api/` — unrelated to Google Calendar, but see this
     file's matching 2026-08-13 entries). This command is still the one to run:
     ```
     firebase functions:delete googleCalendarStatus googleCalendarConnect \
       googleCalendarCallback googleCalendarListCalendars googleCalendarSelectCalendars \
       googleCalendarSetDisplayEnabled googleCalendarDisconnect googleCalendarEvents \
       --region=africa-south1 --project=capdatabasefb2
     ```
     Must be run by the user (Queen Bee can't run deploy/undeploy actions).
  2. **Revoke the stored OAuth connection** in Firestore `system_integrations/
     google_calendar` — the code that read/wrote it is gone, but the stored tokens
     themselves weren't explicitly deleted/revoked this session.
  3. **Android's `GoogleCalendarRepository` read-only consumer** (`mobile-android/app/src/
     main/java/za/co/connoisseurauto/capmobile/GoogleCalendarRepository.kt` +
     `MainActivity.kt` reference) was NOT touched — it will just get connection errors now
     that the Cloud Functions are gone (matches its existing error-handling design, not a
     crash), but it's dead code that should be removed by `android-ui-bee`/
     `integration-sync-bee` for cleanliness. Not delegated yet as of this entry.
- The previously-tracked "Google Calendar Cloud Functions reject a genuinely valid Supabase
  session with 401" bug (below, dated 2026-08-07) is now moot — the feature it affected no
  longer exists. Left in this file as historical record, not removed, since the underlying
  investigation (a real deployed-function 500/503 seen 2026-08-12, different from the
  documented 401) is what prompted the user's removal decision and may be relevant context
  if Google Calendar is ever reconsidered.

## Memory catch-up (2026-08-12): 2026-08-07 through 2026-08-11 work was never recorded here — reconstructed from agent memory + code comments, not a live session transcript
- On 2026-08-12, found the working tree (branch `supabase-phase3-cutover-prep`) had ~5 days
  of uncommitted, unpushed work (23 files, ~1240 lines) that this file/`PROJECT_STATE.md`/
  `SESSION_LOG.md` never captured — the last dated entry anywhere in `docs/ai-memory/` was
  2026-08-06. The narrative below (this entry plus the two new dated entries under this one)
  was reconstructed from Queen Bee agent memory (which *had* been kept current, just in the
  wrong location — see below) and dated code comments in the uncommitted files themselves,
  not from a live session log. Treat dates/details here as best-effort reconstruction, not a
  first-hand verified account, until a real session revisits and re-verifies each item.
- **Also found**: a duplicate `frontend/.claude/agent-memory/queen-bee/` directory holding 4
  real memory files (dated 2026-08-07) that were never merged into the canonical
  `.claude/agent-memory/queen-bee/` — same recurring Ruflo/Claude-Flow tooling-artifact
  pattern already documented in `[[project-supabase-migration]]`, except this instance had
  substantive content, not just 0-byte junk. Merged into the canonical location 2026-08-12.
  `frontend/.claude/`/`supabase/.claude/` (both containing only Ruflo `proven-config.json`
  tooling cache, no other real content) are left in the working tree, **unstaged and
  untracked** — Queen Bee's own delete attempt (`git rm`, plain `rm -rf`) was blocked by the
  auto-mode safety classifier as a sensitive `.claude`-directory deletion. **User action
  needed**: manually delete `frontend/.claude/` and `supabase/.claude/` if confirmed to be
  the same junk pattern (recommended), since Queen Bee cannot.

## Google Calendar Cloud Functions reject a genuinely valid Supabase session with 401 — found 2026-08-07, root cause unconfirmed, NOT fixed
- The first-ever test of the Google Calendar auth redesign with a **real, validly-signed**
  Supabase session (not an intentionally-malformed test token) found `GET
  googleCalendarStatus` returns `401 {"message":"Unauthorized"}` against the live deployed
  function. The 2026-08-06 "verified live" deploy only tested rejection paths (fake
  signature, missing header, garbage token, CORS preflight) — never a real successful
  Supabase session actually succeeding. This 2026-08-07 test is the first real positive-path
  test, and it fails.
- **Isolated so far**: reproducing `verifySupabaseUser()`'s exact logic
  (`supabase.auth.getUser(token)` via a service-role client, then a `public.users` profile
  query) locally against the real project with the current `supabase/.env` service-role key
  succeeds every time. This proves the logic itself is sound and the current local
  service-role key is valid/working — the failure is specific to the **deployed** function's
  environment. Most likely cause (unconfirmed): the `SUPABASE_SERVICE_ROLE_KEY` Firebase
  Secret bound to the deployed function is stale (doesn't match the key rotated/verified
  2026-08-06), or the deployed `SUPABASE_URL` differs from the local default. Queen Bee has
  no Cloud Functions log access in this environment to confirm directly.
- **Blocks**: any real Supabase-backend Google Calendar QA, and therefore blocks a real
  go/no-go cutover recommendation for Calendar specifically (core data-layer QA is unaffected
  — see the QA summary below).
- **Recommended next step**: user checks Cloud Functions logs for the real
  `verifySupabaseUser`/`getUser` error; as a first troubleshooting guess, re-run `firebase
  functions:secrets:set SUPABASE_SERVICE_ROLE_KEY` with the current `supabase/.env` value and
  redeploy, then re-test with `supabase/scripts/qa-test-user.mjs` + `qa-clickthrough.mjs`
  (both untracked in the repo, kept specifically for this retest). Not fixed — deploys are
  always user-run per CLAUDE.md section 12, and the root cause isn't confirmed enough to
  guess-fix blind.

## Phase 3 scripted QA (2026-08-07, no browser tool available): core data/auth/RLS layer passed; Calendar blocked by the 401 bug above
- `mcp__claude-in-chrome__*` browser tools were not actually available/loaded in that
  session, so a real UI click-through wasn't possible. Substituted scripted verification: a
  throwaway admin-equivalent Supabase Auth test user (`qa-test-user.mjs`) driving the exact
  `supabase.from(table).select/insert/update/delete()` calls the real frontend code makes
  (`qa-clickthrough.mjs`), plus a real HTTP call to the deployed Calendar function with that
  session's token. This tests the real auth/data/RLS layer end-to-end but does **not** verify
  visual rendering, navigation, or client-side JS bugs (the `AuthLayout.jsx` prop-drop bug
  below was NOT caught by this method — found later via direct code inspection instead).
- **Passed**: auth, all table reads, full CRUD write/update/delete, permission-bypass check
  (`role=admin`) — all against the real project with a real (throwaway) session.
- **Failed**: Google Calendar (see the 401 entry above) — isolated to that integration only.
- One QA run left a second, unexpected duplicate throwaway test user behind that only a full
  residual-data sweep (not just deleting the one tracked ID) caught — `qa-cleanup-smoketest-
  residue.mjs` exists for exactly this. Always do a full sweep after using throwaway test
  data, not just delete-by-known-id.

## `permissions`/`role_permissions` were never migrated at all, plus a real column-name mismatch vs. the live UI — RESOLVED, applied and verified live (2026-08-12)
- `migrate-firestore-to-postgres.mjs`'s entity mappings never covered the `permissions`
  (flat catalog) or `role_permissions` (per-role permission arrays) Firestore collections at
  all — confirmed live: 0 rows in both real Postgres tables. Even once populated, two
  real column mismatches would have broken the live UI: `frontend/src/pages/UserAdmin.jsx`
  reads `permission.name`/`permission.group` directly, and `supabaseApiClient.js`'s
  `GET /permissions` handler groups by `permission.group` — but
  `0001_initial_schema.sql` only ever gave `permissions` a `label` column and no `group`
  column at all. Real Firestore data: 76 `permissions` docs (`name`/`group` fields, e.g.
  `group="Calendar"`), 4 `role_permissions` docs (one per role, each a permissions array).
- **Fixed and applied**: `supabase/migrations/0014_permissions_name_and_group.sql` (renames
  `label`→`name`, adds `group` column) applied by the user via the SQL Editor 2026-08-12,
  re-verified live immediately after (read-only column probe: `name`/`group` selectable,
  `label` genuinely gone). `supabase/scripts/migrate-permissions.mjs --apply` then run for
  real: 76 permissions + 124 role_permissions rows inserted.
- **Verified independently, not just the script's own success output**: row counts match
  Firestore exactly (76/124), per-role breakdown matches exactly (accountant 19, admin 76,
  technician 29, custom 0), 0 FK orphans (`role_permissions.permission_key` against
  `permissions.key`), 0 duplicate `permissions.key` values, 3/3 content spot-checks
  (`name`/`group`/`description`) match Firestore verbatim. Re-confirmed end-to-end through
  the real RLS-protected client path via `qa-clickthrough.mjs` (21/21 checks pass, including
  `list permissions`/`list role_permissions` returning the correct row counts as a real
  signed-in user, not the service-role client).

## `AuthLayout.jsx` silently dropped every caller's `icon`/`title`/`subtitle`/`footer` props — pre-existing since file creation (2026-07-14), unrelated to the migration, fixed 2026-08-11
- Found directly during Supabase auth QA click-through: every auth page (Login, Register,
  ForgotPassword, ResetPassword) rendered as a near-empty white card with no heading —
  `AuthLayout.jsx` only ever rendered `{children}`, ignoring the other props every caller
  already passed. Pre-existing under Firebase too, not introduced by the migration, but
  low-risk/presentational-only so fixed inline rather than just flagged. Also had to
  locally override `--foreground`/`--card-foreground`/`--muted-foreground` CSS custom
  properties inside the card, since the app's global theme is dark-mode-by-design but this
  card is intentionally a light/white surface — scoped via inline `style`, not a global
  theme change. Verification status of this fix (build/lint/test) not yet re-confirmed as of
  2026-08-12 — see the verification-gap note below.

## Local dev couldn't load at all with VITE_AUTH_BACKEND=supabase — frontend/.env had no Firebase config, and firebase.js's eager fail-fast blocks the whole app regardless of backend (2026-08-06, fixed)
- Started manual QA (Phase 3 step 3, per user's ordered validation plan): local dev server
  (`VITE_AUTH_BACKEND=supabase npm run dev -- --port 5173`), sent a fresh password-reset
  email pointed at it. User clicked the link and got a **blank white page**, not even the
  app's own "Invalid reset link" fallback.
- **Root cause, confirmed via the browser console (user reported the exact error, not
  guessed)**: `Uncaught Error: Missing Firebase configuration: apiKey, authDomain,
  projectId, storageBucket, messagingSenderId, appId` at `firebase.js:20`.
  `frontend/.env` (local dev) never had `VITE_FIREBASE_*` values at all (a pre-existing,
  previously-harmless gap — see the "frontend/.env still does not exist" entry below,
  originally about `npm run dev` not running at all). It became a hard blocker specifically
  because of this session's Phase 3 flag wiring: `frontend/src/lib/AuthContext.jsx` (and
  `apiClient.js`/`functionsClient.js`) still statically/unconditionally import from
  `@/lib/firebase` at module scope regardless of `VITE_AUTH_BACKEND`, and `firebase.js`
  itself throws **eagerly at import time** if its env vars are missing (the same class of
  bug already found+fixed for Supabase's `client.js` earlier this session, via a lazy
  Proxy) — but `firebase.js` itself was never made lazy, so the crash happens before React
  can render anything at all, with no error boundary to catch it (blank white page, not a
  graceful fallback).
- **Fixed pragmatically, no code changes**: added the same real, public-safe Firebase web
  config already committed in `frontend/.env.production` (not a secret — same posture as
  the Firebase project's own public client config, protected by `firestore.rules`/Storage
  rules, not by hiding these values) to local `frontend/.env`. Restarted the dev server
  (Vite reads `.env` at startup only, not live) to pick it up — confirmed responding again.
- **Design asymmetry worth remembering, not fixed this round** (deliberately, per the
  user's "fix only issues directly related to the Supabase migration, do not implement new
  features" instruction — this is a defensive robustness improvement, not required for the
  migration itself to work correctly once `frontend/.env`/`.env.production` both have real
  values for both backends, which they now do): unlike `services/supabase/client.js`
  (lazy Proxy, added earlier this session), `frontend/src/lib/firebase.js` still fails
  fast at import time regardless of which backend is actually selected. This is low-risk in
  practice (both `.env` and `.env.production` now have real values for both backends), but
  if a future environment ever has Supabase config but not Firebase config, the app would
  still hard-crash instead of gracefully running Supabase-only. Revisit if that scenario
  becomes real.
- **Real-world flow gap, not a bug**: the reset email's link only resolves on whichever
  machine runs the `localhost:5173` dev server. User's email account is on a different
  computer than the dev server — resolved by having the user open/check the email via a
  browser on the dev-server machine itself, not by changing any config.
- **Status at end of day 2026-08-06**: dev server running (Firebase config now present,
  confirmed loads), a fresh password-reset email sent and accepted (2nd resend, first one's
  token was never consumed since the app crashed before Supabase's client ever touched the
  URL hash — likely still technically valid but superseded by the resend). User stepping
  away, will click the link and continue QA tomorrow. Nothing beyond this env fix was
  changed — no application code touched this entry.

## Real bug found in the FIRST live deploy of the Google Calendar auth redesign — RESOLVED, redeployed and verified (2026-08-06)
- User deployed `functions/lib/auth.js`/`supabaseAuth.js` for the first time
  (`firebase deploy --only functions`, after the `SUPABASE_SERVICE_ROLE_KEY` secret and GCP
  billing blockers were both resolved). Queen Bee verified the live deploy with a real
  request rather than trusting "it is done": sent a bearer token with a real Supabase
  issuer claim (fake signature) to the live `googleCalendarStatus` URL — got a raw `500`
  instead of the expected `401`.
- **Root cause, confirmed via live Cloud Functions logs**: `@supabase/supabase-js`'s
  `createClient()` unconditionally constructs an internal Realtime client requiring a
  global `WebSocket` constructor. Node 22+ has this natively; Cloud Functions' pinned
  runtime is Node 20 (`functions/package.json`'s `engines`), which doesn't. Not caught by
  local testing because the local dev machine runs Node 24 (confirmed via `node --version`)
  — a real, easy-to-miss environment mismatch between local testing and the actual
  deployed runtime.
- **Confirmed zero impact on real production traffic**: `getServiceRoleClient()` (the
  function that hits this bug) is only ever called from `verifySupabaseUser()`, which is
  only reached when a token's issuer actually matches Supabase's — real users authenticate
  with Firebase ID tokens today, which take the completely unchanged original code path and
  never reach this bug. Only found because Queen Bee deliberately crafted a Supabase-shaped
  test token to verify the new branch was actually live.
- **Fixed**: `functions/lib/supabaseAuth.js` now polyfills `globalThis.WebSocket` with the
  `ws` package (new direct dependency, `functions/package.json`) before `createClient()` is
  ever called, guarded so it's a no-op on any Node version that already has a native
  `WebSocket` (e.g. local dev). Verified: `functions` lint clean, `npm test` 76/76
  (unchanged pass count — this fix doesn't change any of the already-mocked test paths,
  only real un-mocked `createClient()` calls, which local tests happen to succeed at
  regardless of the polyfill since local Node already has native WebSocket).
- **Redeployed and verified live, RESOLVED (2026-08-06).** User redeployed. Re-ran the same
  live probe: now correctly returns `401 {"message":"Unauthorized"}` instead of `500`.
  Additionally verified 3 more real live requests against the deployed function to confirm
  no regression: missing Authorization header (401, unchanged), a garbage non-JWT token
  routed through the still-unchanged Firebase branch (401, unchanged), and a CORS preflight
  OPTIONS request (204, unchanged). Checked live Cloud Functions logs directly: both the
  Supabase-branch failure (`__isAuthError: true, status: 401`) and the Firebase-branch
  failure (`FirebaseAuthError: Decoding Firebase ID token failed`) are handled cleanly by
  `guarded()`'s catch block — no unhandled exceptions, no crashes. The Google Calendar auth
  redesign is now genuinely live and working for both issuer branches, though only the
  Firebase branch has any real traffic yet (no client authenticates via Supabase in
  production — `VITE_AUTH_BACKEND` still defaults to `firebase` everywhere).

## Firebase Secret Manager billing error — RESOLVED (2026-08-06)
- First attempt at `functions:secrets:set SUPABASE_SERVICE_ROLE_KEY` failed with a billing-
  not-enabled error, unexpectedly (existing Google Calendar secrets already worked in the
  same project). User retried and it succeeded — likely transient/propagation delay rather
  than a real billing gap, since no billing change was reported. Secret confirmed created
  (`Created a new secret version projects/100946498038/secrets/SUPABASE_SERVICE_ROLE_KEY/versions/1`)
  and confirmed bound correctly to all 8 functions via the live deploy's Cloud Functions
  logs (`secretEnvironmentVariables` includes it alongside the two Google Calendar secrets).

## Supabase Auth "Redirect URLs" allowlist status is unknown — needs the user to check the dashboard (2026-08-06)
- `supabase/scripts/send-password-reset-emails.mjs --apply` was run for real
  (`admin@connoisseurauto.co.za`) with `redirectTo` pointed at the live production URL —
  but the live production frontend doesn't have the Supabase-aware `ResetPassword.jsx` fix
  deployed, and even if it did, `VITE_AUTH_BACKEND` defaults to `firebase` there, so the
  link isn't actually completable right now regardless (see the entry below). That first
  send should be treated as expired/unusable by the time real QA happens.
- Started a local dev server (`VITE_AUTH_BACKEND=supabase npm run dev -- --port 5173`,
  confirmed responding, `/reset-password` route resolves) as a real test target for a
  re-sent email. **Before re-sending with `--redirect-to=http://localhost:5173/reset-password`**,
  confirm that URL (or `http://localhost:5173/*`) is in Supabase's Auth → URL Configuration
  → Redirect URLs allowlist for this project — Queen Bee cannot check or edit this itself
  (Dashboard-only, no Management API token available). If it's not listed, Supabase may
  silently redirect elsewhere or reject the link rather than erroring at send time, so this
  needs confirming before assuming a re-sent email will actually work.

## Live production password-reset link (sent 2026-08-06) is not currently completable
- The one real password-reset email already sent (`admin@connoisseurauto.co.za`, via
  `send-password-reset-emails.mjs --apply`) points at
  `https://capdashboard.gerhardvanwijk.workers.dev/reset-password` — the live, currently-
  deployed production frontend, which does NOT have today's `ResetPassword.jsx` fix
  (nothing was deployed to Cloudflare this session) and whose `VITE_AUTH_BACKEND` correctly
  still defaults to `firebase` regardless. Clicking that link will very likely show
  "Invalid reset link." Supabase recovery links are time-limited (~1hr default) and likely
  already expired by the time this is revisited — plan to re-send once a real test target
  (local dev, confirmed redirect-allowlisted) is ready, not to reuse this one.

## `SUPABASE_SERVICE_ROLE_KEY` rotation — DONE, verified working (2026-08-06)
- User rotated the key via the Supabase Dashboard and updated `supabase/.env` directly
  themselves (recommended path — avoided re-pasting the secret into chat, per the earlier
  "Supabase migration secrets exposed" incident below).
- **Verified the new key live, not just assumed**: `migrate-firestore-to-postgres.mjs
  --phases=verify` (read-only, all 10 collections still match) and a full
  `smoke-test.mjs` run — **18/18 checks pass** with the new key, including Auth Admin API
  user creation, service_role RLS-bypass writes, both triggers, storage-bucket checks, and
  full cleanup (all seeded rows + the test user deleted afterward, no residue). This proves
  the new key has full working service-role capability, not just basic connectivity.
- No other file in the repo holds the raw key (Cloud Functions aren't deployed yet, so
  there's no stale Secret Manager copy to worry about either) — `supabase/.env` was the only
  place needing an update, and it's done.

## Google Calendar Cloud Functions auth redesign is implemented but not deployed (2026-08-06)
- `functions/lib/auth.js`'s `requireUser()` now supports both Firebase ID tokens (unchanged
  path) and Supabase JWTs (new, via `functions/lib/supabaseAuth.js`) — written, unit-tested
  (76/76 `functions` tests pass), `node --check`/lint clean. **Not deployed.** Firebase
  Cloud Functions still only run the pre-2026-08-06 code until `firebase deploy --only
  functions` is explicitly approved and run — see PROJECT_STATE.md's 2026-08-06 entry.

## Frontend `VITE_AUTH_BACKEND` flag exists in code but has never been live-QA'd end-to-end (2026-08-06)
- `AuthContext.jsx`/`apiClient.js`/`functionsClient.js`/`ResetPassword.jsx` all now branch
  on `VITE_AUTH_BACKEND`, verified via unit tests and real production builds (one per flag
  value) — but no one has actually run the app in a browser with the flag set to
  `supabase` and clicked through real pages. Currently blocked, in order: (1) key rotation
  (see entry above), (2) `send-password-reset-emails.mjs --apply` actually run + the email
  confirmed received + a real password set (the 1 migrated Supabase Auth user has no
  usable password yet — script is built and dry-run verified, not yet sent for real), (3)
  the undeployed Cloud Functions auth redesign (Google Calendar would 401 under a Supabase
  session until deployed). Do this live QA pass before ever considering the actual cutover
  (`PHASE2_CUTOVER_CHECKLIST.md` section 4).

## `service_records.photos` / `job_cards.arrival_photos` have no Postgres columns — confirmed no data loss, not fixed (2026-08-06)
- Real UI fields (`MachineDetail.jsx`, `ServiceRecords.jsx`, `JobCardDetail.jsx` all read
  them) with no Postgres column and no entry in `entityMappings.mjs`'s mapper — found while
  reviewing storage-phase coverage during the users/storage migration run.
- **Confirmed no data loss**: live Firestore query found zero real `service_records`/
  `job_cards` docs with either field populated. Root cause traced: `frontend/src/
  components/LogServiceModal.jsx` uploads photos into local component state and displays
  them for review, but its `ServiceRecord.create()` payload never actually includes
  `photos` — the upload feature has never worked end-to-end, a pre-existing frontend bug
  unrelated to the Supabase migration. `job_cards.arrival_photos` is read-only dead code
  with no writer anywhere (`BookIn.jsx` writes photo URLs into `technician_notes` as text
  instead, not into a dedicated field).
- Not fixed — out of migration scope (fixing the upload feature itself is a `frontend/`-only
  bug fix, not part of Firebase->Supabase data migration). If asked to fix the upload
  feature later, remember to add matching Postgres columns + mapper entries first so the
  fix doesn't immediately create a new migration gap.

## Password-reset-email script for migrated Supabase Auth users still doesn't exist (2026-08-06, carried over)
- The `users` migration phase ran 2026-08-06: 1 real user (`admin@connoisseurauto.co.za`)
  now has a real Supabase Auth account, but with no usable password (Firebase password
  hashes can't be imported via `auth.admin.createUser`). No script exists yet to trigger a
  recovery email (e.g. `supabase.auth.admin.generateLink({ type: 'recovery', ... })` per
  user). Not blocking anything right now since Supabase isn't the live backend for any
  client yet, but must exist and be tested before any real cutover — see
  `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` section 1.

## Supabase migration tooling won't work from a new machine without recreating local secrets (2026-08-04)
- `supabase/.env` (Supabase URL/anon/service_role keys + `GOOGLE_APPLICATION_CREDENTIALS`
  path) is gitignored by design and does not travel via `git clone`/`git pull`. The
  Firebase service-account JSON key it points to also lives outside the repo entirely
  (`C:\Users\Gerhard\Documents\cap database firebase files\...json` on the machine used
  this session) and isn't tracked anywhere.
- User is switching to a different machine ("home"). Before any further
  `migrate-firestore-to-postgres.mjs` run (even read-only `--phases=verify`) works there,
  both need recreating: `supabase/.env` with the same 3 values (see
  `supabase/.env.example` for the exact keys expected), and the Firebase service-account
  JSON key placed somewhere on that machine with `GOOGLE_APPLICATION_CREDENTIALS` in
  `supabase/.env` pointed at it. `frontend/.env` (Firebase + Supabase client keys) is a
  separate, also-gitignored file with the same portability gap for anything needing
  `npm run dev`/`build` on the new machine.
- Not a blocker for anything else — all code/schema/docs work in this repo is unaffected
  and available immediately after a clone, on any machine.

## First real `--apply` partially failed on NOT NULL FK constraints — FIXED via 0012, applied and content-verified live (2026-08-04)
- `0009`/`0010`/`0011` confirmed applied ("100% success" per user) and live-verified
  (columns queryable) before attempting the first real `--apply --phases=entities,relink,
  verify`. Result, confirmed via the read-only `verify` phase (not just script output):
  `clients` (6/6) and `job_cards` (4/4) succeeded and relinked correctly. `machines` (0/6),
  `service_records` (0/7), `job_card_lines` (0/3), `knowledge_machines` (0/3) all failed
  outright — Postgres `NOT NULL constraint` violations, zero rows written to any of the
  four (not a partial/corrupt write).
- Root cause: the script's insert-then-relink two-phase design needs the relevant FK
  column to be nullable at insert time; `job_cards.client_id`/`machine_id` were, the other
  three FK columns weren't. `knowledge_machines.name` (pre-`0011` vestigial column) is
  separately still `NOT NULL` despite the `0011` mapper no longer supplying it.
- Fixed via `supabase/migrations/0012_nullable_fks_for_two_phase_insert.sql` (drops NOT
  NULL on 4 columns; does not weaken the FK `references` constraint itself). **User
  applied `0012` ("100% success"); retried the write scoped to the 4 failed tables only
  — all 4 succeeded. Full `--phases=verify` across all 10 collections: all match. Content
  spot-checked (not just counts) by tracing real IDs through Postgres — correct.** This
  issue is now fully resolved, not just fixed-in-code.
- **What mattered for the retry** (worth remembering for any future partial-failure
  retry): re-ran scoped to
  `--only=machines,service_records,job_card_lines,knowledge_machines` — NOT a bare
  `--apply --phases=entities,relink,verify` with no `--only`, which would have tried to
  re-insert the already-successful `clients`/`job_cards` rows and likely hit a
  `legacy_firestore_id` unique-constraint error. The script does not currently check
  "already migrated" before inserting.

## `machines`/`service_records`/`knowledge_machines` schema gaps + a date empty-string bug — FIXED, NOT yet applied (2026-08-04)
- Full spot-check of all real docs (not just dry-run samples) in the 4 remaining non-empty
  collections found 4 more real issues beyond the `job_cards` one below:
  1. `machines` missing `warranty_expiry` (real, on all 6 docs).
  2. `service_records` missing `service_date`/`work_performed`/`findings` (all three real,
     `service_date` required by both real creation forms).
  3. `knowledge_machines`'s entire schema was wrong — real fields are `manufacturer`/
     `model_name`/`variant`/`product_code`/`category`/`summary`/`supported_refrigerants`/
     `technical_specifications`/`main_functions`, none of which overlap with the old
     `name`/`model`/`description` columns. Would have silently blanked every real
     knowledge-base entry.
  4. A latent bug independent of the above: `?? null` doesn't catch empty strings, and
     date fields come through as `""` (not absent) from blank `<input type=date>`
     elements — confirmed live on 4 of 6 real `machines.installation_date` values. Would
     have hard-failed `--apply` with a Postgres date-type error. Fixed defensively across
     every date field via a new `toDateOrNull()` helper, not just the one proven broken.
- Fixed via `supabase/migrations/0009_machines_warranty_expiry.sql`,
  `0010_service_records_missing_fields.sql`, `0011_knowledge_machines_real_fields.sql`,
  and updates to `supabase/scripts/lib/entityMappings.mjs` (10/10 tests pass, was 8/8).
- **`0009`/`0010`/`0011` have NOT been run against the real `CAPDATABASE` project yet** —
  needs the user to apply them via the SQL Editor before any real `--apply` of the
  migration script.

## `knowledge_notes`/`knowledge_media`/`knowledge_documents`/`knowledge_service_codes` schema gap — FIXED 2026-08-05, NOT yet applied
- Found 2026-08-04 as a side effect of investigating `knowledge_machines`
  (`KnowledgeMachineDetail.jsx` renders all four sub-collections together): real code uses
  `content` on notes (schema had `body`), stores an uploaded `file_url` (the full download
  URL `UploadFile` returns) on media/documents rather than a `storage_path`, plus an
  `original_filename` the schema didn't capture at all, and `knowledge_service_codes` has a
  `function_name` field with no schema column, plus a `service_code` field the reveal
  endpoint reads that the schema had named `code` instead.
- Deferred at the time since all four collections had zero real documents in every dry run
  so far — no data-loss risk, but confirmed still worth fixing before real content is ever
  added or before any real `--apply` touches these tables.
- **Fixed 2026-08-05**: `supabase/migrations/0013_knowledge_subcollections_real_fields.sql`
  (column renames: `body`→`content`, `code`→`service_code`, `storage_path`→`file_url` on
  both media/documents; new columns: `note_type`, `function_name`, `original_filename`,
  `title` on media). `supabase/scripts/lib/entityMappings.mjs`'s mapper updated to match
  (12/12 unit tests pass, was 8). `frontend/src/api/supabaseApiClient.js`'s
  `knowledge-service-codes/:id/reveal` handler updated from `record.code` to
  `record.service_code` to match. Verified: `frontend` lint/typecheck/test all clean;
  `supabase` `node --check` + `npm test` clean.
- **`0013` has NOT been applied to the real `CAPDATABASE` project yet** — needs the user to
  run it via the SQL Editor, same as every prior migration. Safe to run any time before real
  content exists in these four tables (still true as of 2026-08-05); becomes a real
  data-affecting rename once they hold real rows.
- **Second, deeper bug found and fixed in the same pass**: `supabase/scripts/
  migrate-firestore-to-postgres.mjs`'s Phase D (storage copy) independently read the same
  wrong `storage_path` field name directly off the raw Firestore document (not through the
  entityMappings.mjs mapper, so the schema fix alone would not have caught it), and even
  with the field name corrected, a bare rename would still not have worked — the real field
  is a full Firebase Storage *download URL*, not a bare object path, and the Firebase Admin
  SDK's `bucket().file(path)` needs the raw decoded object path. Fixed via a new
  zero-dependency, unit-tested helper `supabase/scripts/lib/firebaseStorageUrl.mjs`
  (`extractFirebaseStoragePath()`, 6/6 tests) that parses the download-URL shape and
  extracts+decodes the real object path. Phase D also now re-points each migrated row's
  Postgres `file_url` to a fresh Supabase signed URL after a successful copy (previously it
  copied the file but left Postgres pointing at the stale Firebase URL forever). Still
  untested against a real download URL end-to-end (no real documents exist in either
  collection to test against) — the unit tests cover the URL-parsing logic in isolation
  only, not a live Firebase Storage read.

## `job_cards` missing `job_number`/`date_received` columns — FIXED, applied and verified live (2026-08-04)
- Found via a live dry-run spot-check: `0001_initial_schema.sql` never gave `job_cards`
  columns for `job_number`/`date_received`, both of which are real, universally-populated
  fields (confirmed on all 4 real docs) actively used by `BookIn.jsx`, `JobCardDetail.jsx`,
  `Jobs.jsx`, `InvoiceQueue.jsx`, `MachineDetail.jsx`. Fixed via
  `supabase/migrations/0008_job_cards_missing_fields.sql` and an updated
  `supabase/scripts/lib/entityMappings.mjs` job_cards mapper (unit-tested, 8/8 pass).
- **User confirmed `0008` ran; verified live** via a read-only `supabase-js` select on
  `job_cards(id, job_number, date_received)` — columns exist and are queryable, table
  still has 0 rows (expected, nothing written yet). All of `0001`-`0008` are now applied.

## `restrict_self_user_update` trigger blocked service_role writes to role/permissions — FIXED, applied (2026-08-03)
- Found by running `supabase/scripts/smoke-test.mjs` live against the real project:
  granting a test user a permission via the **service_role** client (bypasses RLS by
  design) was rejected by the trigger with "Only preferences may be self-updated." Root
  cause: the trigger's bypass check is `is_admin()` alone, which depends on `auth.uid()` —
  NULL under service_role — so the trigger couldn't distinguish trusted server-side writes
  from a genuine self-update attempt.
- Impact if unfixed: `migrate-firestore-to-postgres.mjs`'s Phase C (sets each migrated
  user's real role/`effective_permissions` via the service_role/admin client) would have
  failed for every user whose role or permissions differ from the trigger-created default.
- Fix: `supabase/migrations/0007_fix_admin_user_update_trigger.sql`. **User confirmed this
  ran with no errors** (2026-08-03). Adds `or auth.uid() is null` to the trigger's bypass
  condition. Not yet re-verified live (the smoke test's grant-permission check hasn't been
  re-run since), but the fix is applied.

## `frontend/.env` still does not exist in this clone (2026-08-03, `supabase/.env` resolved)
- Both `supabase/.env` and `frontend/.env` were missing in this fresh clone (gitignored
  files don't travel with `git clone`; they were created session-locally on whatever
  machine ran Phase 0). **`supabase/.env` has since been recreated by the user** (real
  URL + anon + service_role keys, confirmed present and gitignored) and the live smoke
  test ran successfully against it.
- `frontend/.env` is still missing. Practical effect: the frontend cannot run `npm run
  dev`/`build` in this clone (`vite.config.js` throws in production mode if Firebase keys
  are missing; the Supabase client in `services/supabase/client.js` throws unconditionally
  if its two vars are missing) until it's recreated with both the Firebase and Supabase
  values. Not blocking any work done so far this session (lint/typecheck/`node --test`
  don't need it), but will block manual UI verification whenever that's needed.
- Exact keys needed are documented in `frontend/.env.example` and `supabase/.env.example`
  (added 2026-08-03, at the user's request, specifically so future required variables get
  documented there rather than pasted into chat).

## Supabase migration secrets exposed in chat/session transcript (2026-08-03)
- The user pasted both the Supabase publishable key (`sb_publishable_...`, low risk — it's
  designed to be public and RLS-constrained) and the **secret key**
  (`sb_secret_...`, service_role-equivalent, bypasses RLS entirely) directly into the
  chat during this session. Both are stored only in gitignored files
  (`frontend/.env` for the publishable key, `supabase/.env` for the secret key), never
  committed. Recommend rotating the secret key in the Supabase dashboard once migration
  tooling stabilizes, since it now exists in session logs outside version control.

## Supabase migration schema gaps (2026-08-03, updated during Phase 1)
- `calendar_records` and `invoice_queue` are permission-gated in `firestore.rules` but
  **confirmed unused** by any current client code (`frontend/src/api/apiClient.js`'s
  `calendarEvents()` derives Calendar-page events from `service_records`/`machines`/
  `clients` directly; grepping `frontend/src`, `functions/`, and `mobile-android/` found
  no reader/writer of either collection). Deliberately not modeled in the Postgres schema
  — not a gap, since there is nothing live to migrate. Re-check before assuming this if a
  future feature starts writing to either collection.
- `sites` in the new Postgres schema is gated on `clients.*` permissions (no dedicated
  `sites.*` permission key exists in `firestore.rules`). Still an inference, not a direct
  translation — confirm before relying on it.

## Supabase migration Phase 1 — data-migration script is incomplete by design (2026-08-03)
- `supabase/scripts/migrate-firestore-to-postgres.mjs` exists (dry-run by default, syntax
  verified with `node --check`, dependencies NOT installed, NOT executed against real
  Firestore data) but its own TODO section lists what's still missing before it's usable
  for a real cutover: (1) foreign-key re-linking pass from `legacy_firestore_id` to the
  new Postgres uuids — columns added in `0003_legacy_migration_ids.sql` but no re-link
  logic written yet; (2) `auth.users` creation per Firestore user (must go through
  `supabase.auth.admin.createUser`, separate from the `public.users` profile row);
  (3) Storage file copy from Firebase Storage to Supabase Storage — not attempted at all.
  Do not treat this script as migration-ready.
- Running it (even in dry-run mode) requires Firebase Admin credentials
  (`GOOGLE_APPLICATION_CREDENTIALS` pointing at a downloaded service-account key, or
  `gcloud auth application-default login` run interactively by the user) which Queen Bee
  does not have and should not try to obtain itself — the auto-mode permission classifier
  already blocked one credential-read attempt (`gcloud auth application-default
  print-access-token`) this session as an appropriate guard. The user must set this up
  and run the script themselves, or explicitly hand over a service-account key file path.
- `supabase/migrations/0001` has been run against the real `CAPDATABASE` Supabase project
  and confirmed successful by the user (2026-08-03). `0002`-`0005` are being run next, in
  order, by the user via the SQL Editor — **no connection string will be provided** (user's
  explicit decision, 2026-08-03). Not yet confirmed successful as of this entry — do not
  assume RLS/grants/storage buckets/legacy-id columns exist until the user confirms all
  five. Phase 2 (actual app cutover) begins only after that confirmation, and even then
  only proceeds through the ordered, individually-approved steps in the Phase 2 runbook
  (DECISIONS.md) — see that entry before assuming "proceed with Phase 2" authorizes a
  `--apply` run or the `AuthContext`/`apiClient` cutover on its own.
- **Fixed 2026-08-03** (was a real gap, found by static review of the migration script
  before anyone ran it): `migrate-firestore-to-postgres.mjs`'s Phase A never imported
  `knowledge_notes`/`knowledge_service_codes`/`knowledge_media`/`knowledge_documents`, and
  Phase C's `knowledge_notes.created_by` relink referenced a `legacy_firestore_id` column
  that didn't exist on that table (`0003` only added it to `knowledge_machines`). Fixed via
  `supabase/migrations/0006_knowledge_legacy_ids.sql` and updates to the script's
  entity/relink phases. See DECISIONS.md.
  - **`0006` confirmed complete 2026-08-03**: the user's SQL Editor run errored with
    `column "legacy_firestore_id" of relation "knowledge_notes" already exists` —
    verified live (not just inferred from the error) via read-only `supabase-js` probes
    against all four tables using the service_role key: all four columns already exist.
    This means all four `ADD COLUMN` statements had already committed in an earlier,
    unreported run of the same file before this one. Index existence for the four new
    `..._legacy_firestore_id_idx` indexes could not be directly confirmed the same way
    (no PostgREST-exposed introspection route for `pg_indexes`), so the migration file was
    rewritten in place to be idempotent (`if not exists` on every `add column`/
    `create index`) rather than left in a state where re-running it always errors — safe
    to run again at any time, including to fill in the indexes if they didn't make it.

## Deploy gap (2026-07-28, push resolved 2026-08-03)
- ~~Commit `aa72fa8` (Ruflo/Claude Flow MCP tooling) exists on local `main` but is not
  pushed to `origin/main`~~ — **resolved 2026-08-03**: `git push origin main` succeeded
  this session (`25f4819..59e9702`), carrying `aa72fa8`, `f5246f7`, and the new Supabase
  migration Phase 0/1 commit `59e9702` to `origin/main`. `main`/`origin/main` are in sync.
- `functions/index.js`'s CORS fix (adds `PATCH` to `Access-Control-Allow-Methods`, from
  commit `25f4819`) is **not deployed** — `firebase deploy --only functions` was denied
  by the same classifier. The frontend (already deployed, version
  `5f00ef33-e00d-4f47-a84b-115df2954f3d`) now expects PATCH to work for the System
  Settings "show Google Calendar" toggle; until functions are redeployed this call will
  still fail cross-origin in production.
- Upstream `@claude-flow/cli@latest` npm package is broken (`npm error Invalid Version:`
  on install), which is why the `plugin:ruflo-core:ruflo` MCP server fails to connect
  (`claude mcp list`). The `.mcp.json`-defined `claude-flow` server (a different
  package, `ruflo@latest`) connects fine. Not fixable from this repo; either wait for
  upstream or disable `ruflo-core`/`ruflo-swarm`/`ruflo-rag-memory`/`ruflo-neural-trader`
  in `.claude/settings.json` → `enabledPlugins` if the failures are noisy.

## Verification gaps
- No build, lint, typecheck, or test suite has been run this session for any layer
  (frontend, backend, functions, Android). All statements above are from static code
  inspection only.
- Google Calendar: fully live-tested 2026-07-24, including a real connect flow and event
  sync with account `gerhard.ark.of.war@gmail.com`. No longer an open verification gap.
- Firebase reported "No cleanup policy detected for repositories in africa-south1" during
  this deploy — old container images may accumulate a small storage cost over time. Fix
  (not yet applied, low priority): `firebase functions:artifacts:setpolicy --project
  capdatabasefb2`.

## Documentation drift risk
- `AGENTS.md` still states the frontend only talks to Laravel and must never connect
  directly to Firebase/Google. This is intentionally superseded by CLAUDE.md (section 1)
  but left unedited in `AGENTS.md` itself — a future reader of `AGENTS.md` alone would be
  misled. See [[DECISIONS]] entry on this.

## Repo hygiene (not verified as intentional, not touched)
- `rename_api_client.py` and `rename_api_client_TEMP.txt` at repo root are both empty
  (0 bytes) and untracked-looking scratch files. Left in place per "do not change
  application code" scope of this setup task.

## Duplicated permission model
- Permission data is maintained by hand in two systems (Laravel tables vs. Firestore
  collections/`effective_permissions`) with no automated sync verified in this session.
  Any permission change must be checked against both per CLAUDE.md section 9.
