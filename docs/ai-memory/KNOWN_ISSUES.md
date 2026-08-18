# Known Issues

## OPEN (2026-08-18, latest) — Migration 0031 (Next Service Due auto-populate) prepared but NOT applied

`supabase/migrations/0031_service_records_default_next_service_due.sql` adds a DB trigger so a
logged service's `next_service_due` defaults to one year later when left blank (drives Dashboard's
calendar / `UpcomingServices.jsx`). Code-complete, lint/typecheck/build clean, but like every
migration in this repo it needs the user to run it via the Supabase SQL Editor — no automated
apply pipeline exists. Until applied, the DB-level backstop doesn't exist yet; the frontend's own
visible default (`ServiceForm.jsx`/`LogServiceModal.jsx` pre-filling the field) already works
today regardless, since it's plain client JS already deployed.

## RESOLVED (2026-08-18, latest) — Edit Client save was 400ing on every save; full site-wide form/save sweep found no other instance

- **User-reported**: another issue updating a client record. Root cause: `apiClient.entities.
  Client.get()` stamps a synthetic `machines` array (this client's joined machine list) onto
  every client record it returns -- not a real column on `public.clients`.
  `ClientDetail.jsx`'s `EditClientForm` seeded its form state as `{ ...initial }`, so every
  "Save Changes" on Edit Client sent `machines: [...]` straight through to the update payload --
  PostgREST rejects an update outright on any unknown column, so editing a client's own
  company name/contact/phone/email/address/notes was failing on every save. Same failure class
  as the 2026-08-16/17 `UserAdmin.jsx` bugs.
- **Fixed at two layers**: `EditClientForm` now seeds only real columns explicitly; `supabaseApiClient.js`'s
  `clientEntity.update()` now also strips `machines` defensively (same pattern as `users`'
  stripping), so this can't recur regardless of what a future caller does.
- **Full app-wide sweep** of every other `entities.X.create()/update()` call site (per explicit
  "apply to all forms globally" instruction) found this was the ONLY place a synthetic/joined
  field could leak into a write payload -- every other form/page already builds an explicit,
  real-column-only payload. See `SESSION_LOG.md`'s matching entry for the full file list swept.
- **Live-verified against production Supabase**: `supabase/scripts/qa-verify-clientdetail-save-fix.mjs`,
  8/8 checks pass, including reproducing the exact old PostgREST rejection, confirming the fix
  persists, and confirming the client->machine->service_record relationship chain works
  end-to-end. `npm run lint`/`typecheck`/`test`(71/71)/`build` all clean. Committed `02d16de`.
- **Not live-clicked** (no browser tool this session) -- verified via a live REST-contract
  script instead, matching this project's established pattern for unclicked frontend fixes.

## RESOLVED (2026-08-18, later still) — app-wide error-handling sweep: the "~15 other unguarded save handlers" gap disclosed in the previous entry is now closed, plus a new global ErrorBoundary

- Follows directly from the entry immediately below. User asked to extend error handling
  "across the whole website" — audited every file with an `await apiClient/
  dashboardNotesClient....create/update/delete()` call (found via grep, then read each site
  individually, not assumed from the pattern match alone).
- **Most handlers already had proper try/catch** (`BookIn.jsx`, `Jobs.jsx`, `AddClient.jsx`,
  `Account.jsx`, `ProductsServicesSettings.jsx`, `JobCardSettingsPanel.jsx`,
  `CompanySettingsPanel.jsx`, `ServiceRecords.jsx`'s certificate generate/preview/download flow,
  `UserAdmin.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `Register.jsx`) — left untouched,
  not rewritten for its own sake.
- **Fixed the ones that didn't** (same "stuck loading state, no message" bug class as
  `ClientDetail.jsx`'s original report): `StickyNotes.jsx` (`addNote`), `KnowledgeMachineForm.jsx`
  (`submit`), `KnowledgeMachineDetail.jsx` (`addNote`/`reveal`/`handleDelete`/`upload`),
  `MachineDetail.jsx` (`handleEdit`/`handleDelete`/`handleAddService`/`handleEditService`/
  `handleDeleteService` — same page family as `ClientDetail.jsx`, same bug), `JobCardDetail.jsx`
  (`handleAddLine`/`handleDeleteLine`/`handleStatusChange`/`handleDelete`),
  `LogServiceModal.jsx` (`handleSubmit`), `InvoiceQueue.jsx` (`markInvoiced`), `CalendarPage.jsx`
  (`reschedule` — had `try/finally` but silently swallowed the error, no message shown),
  `ImportCustomers.jsx` (`runImport`'s outer block had NO try/catch at all — an unexpected throw
  from `executeImportRows()` itself, distinct from a per-row failure which was already isolated
  and tested, would leave the UI stuck on "Importing…" forever).
- New `frontend/src/lib/reportError.js` centralizes the fix (console.error + a destructive toast
  via this project's existing `use-toast.jsx`/`<Toaster />`, already used for success messages
  e.g. `Register.jsx`) so every site got the same consistent UX instead of ad hoc per-file
  patterns.
- **Also added a genuine gap that had nothing to do with the reported bug**: no React
  `ErrorBoundary` existed anywhere in this app. A render-time crash (as opposed to an async
  handler error — a different failure class entirely) previously took the whole app down to a
  blank white screen with no recovery path. New `ErrorBoundary.jsx` wraps the whole routed app
  in `App.jsx` with a friendly "Something went wrong" + reload fallback.
- Verified: `npm run lint`/`typecheck`/`build` all clean, `npm test` 71/71 (unchanged — this was
  pure error-handling wiring, no pure-logic changes). Not live-clicked (no browser tool this
  session) — disclosed as code/build-verified only, matching the standard used throughout this
  file for unclicked frontend fixes.
- Caught and deleted 2 more zero-byte junk files from this session's own Bash commands
  (`frontend/src/components/ui/r.status`, `frontend/src/components/ui/{`) — same known
  shell-fragment artifact pattern as the previous entry.

## RESOLVED (2026-08-18, later) — leaving an optional form field blank could permanently break a save (root cause fixed for all entities); a narrower UI-error-handling gap remains, disclosed

- **User-reported**: adding a machine to a client, leaving a field empty "crashes" the page.
  **Root cause confirmed**: `MachineForm` (and most forms in this app) initialize optional
  fields like `installation_date`/`warranty_expiry` to `""` when left blank. PostgREST/Postgres
  rejects `""` outright for any non-text column (`invalid input syntax for type date`, 22007).
  None of this project's ~30 save-handler call sites (`ClientDetail.jsx`'s `handleAddMachine`
  and ~15 others across `MachineDetail.jsx`/`JobCardDetail.jsx`/`BookIn.jsx`/`Jobs.jsx`/
  `LogServiceModal.jsx`/settings pages/etc.) wrapped their `await ....create()/update()` in
  `try/catch`, so the thrown error was never caught — the "Saving…" button state got stuck
  forever with no message. That's the "crash": a frozen dialog, not a white-screen React crash.
- **Fixed at the single choke point every entity write passes through**, not per-form: new
  `frontend/src/lib/sanitizeForWrite.js` (pure logic, no Supabase import, unit-tested — 5 new
  tests, 71/71 total pass) converts top-level `""` values to `null` before any write.
  `services/supabase/database.js`'s `createRow()`/`updateRow()` now sanitize automatically —
  this covers **every** entity via `makeEntity()` (Client, Machine, ServiceRecord, JobCard,
  JobCardLine, Site, User, ProductService, ClientImport). `supabaseApiClient.js`'s two
  singleton settings APIs (`JobCardSettings`, `CompanySettings`), which bypass `database.js` via
  raw `supabase.from()` calls, were sanitized there too. Confirmed safe: no `not null default
  ''` text column exists anywhere in `supabase/migrations/*.sql`, so this never changes meaning
  for any real column — it only prevents an invalid-syntax error for an optional date/numeric
  field left blank.
- **Also hardened, narrower scope**: `ClientDetail.jsx`'s `handleEdit`/`handleDelete`/
  `handleAddMachine` (the exact reported page/flow) now have `try/catch` + a visible inline
  error message, so even a genuinely unexpected future error un-sticks the dialog instead of
  hanging silently.
- **Disclosed, NOT done — a real, scoped follow-up if wanted**: the same missing-`try/catch`
  pattern exists at ~15 other save-handler call sites across the app (`MachineDetail.jsx`,
  `JobCardDetail.jsx`, `BookIn.jsx`, `Jobs.jsx`, `LogServiceModal.jsx`, `AddClient.jsx`,
  `Account.jsx`, `InvoiceQueue.jsx`, settings pages). The root-cause data fix above closes the
  *specific* bug reported (empty fields), but any *other* kind of write failure at those sites
  (a genuine permission denial, a network blip, a not-yet-discovered schema mismatch) will still
  hang the UI silently the same way, just without an error message. Not swept in this pass —
  flagged rather than done partially/silently. Worth a dedicated pass adding a shared
  try/catch-and-surface-error pattern to all of them.
- Verified: `npm run lint`/`typecheck`/`build` all clean, `npm test` 71/71 (up from 66). Not
  live-clicked (no browser tool this session) — the fix is a direct, low-risk mechanical
  conversion (`"" → null`) at a single well-understood choke point, same risk class as prior
  "code-verified, not live-clicked" fixes in this file.

## RESOLVED (2026-08-18) — `anon` default-grant audit gap closed with live evidence; Service Certificate PDF + email deliverability confirmed working by the user

- **`anon` default-grant gap (previously "scope not fully confirmed")**: `qa-anon-grants-sweep.mjs`'s
  hardcoded table list was missing the two newest tables from `0030_service_certificates.sql`
  (`company_settings`, `service_certificates`) — added them and re-ran live against production.
  **All 22 known `public` tables now correctly hard-block anonymous access (401/403)**, including
  both new 0030 tables which were never given an explicit `revoke ... from anon` of their own —
  this is real, live proof that `0028_anon_grant_hardening.sql`'s `alter default privileges in
  schema public revoke all on tables from anon` genuinely protects tables created by *later*
  migrations too, not just the 4 tables it explicitly named. No new migration needed — 0028
  already closed this for good; this was a verification-tooling gap, not a live security gap.
  Script committed with the updated table list for future re-use.
- **Service Certificate PDF**: user confirmed opening and reviewed on a real device/browser —
  visual-inspection gap closed by the user directly, not re-verified by an agent.
- **Email deliverability**: user confirmed registration/password-reset email has worked, including
  as recently as 2026-08-17 — the recovery link initially pointed at `localhost` (expected, since
  no production reset-password page existed yet at send time); a real `/reset-password` page was
  since built and its URL added to Supabase's Redirect URLs, closing the gap. No longer flagged as
  untested.
- **Job Card `job_number` race condition**: explicitly deprioritized by the user ("won't happen in
  the near future") — left unfixed, not forgotten. Revisit if job-card volume/concurrency changes.

## RESOLVED (2026-08-18) — Android Service Certificate parity, KB 7-day-expiry Android regression, web forgot-password live-verified

- **Android Service Certificate feature**: now real, build-verified (43/43 unit tests, 0 lint
  errors/28 warnings unchanged, real APK, no new Gradle dependency) — see DECISIONS.md's matching
  entry for the full build. Closes ROADMAP.md's Batch C ("Android parity") for the certificate
  generate/preview/download/regenerate flow and the Company Details settings screen. Batch B
  (email/attach/history) is still not started on EITHER platform — blocked on the user's Resend
  account, unchanged.
- **KB photo/document 7-day-expiry bug**: the WEB side turned out to already be fully fixed and
  live-verified before this session started (`supabase/scripts/qa-verify-kb-permanent-paths.mjs`,
  12/12 pass against production, including cross-technician signed-URL access — the migration
  0029 + web code that fixes this had already shipped, just never independently re-confirmed
  live until now). What was genuinely still broken: **Android's Knowledge Base screen**, which
  loaded `file_url` directly as a URL under a stale comment claiming it still was one — as of
  0029 it's a permanent Storage PATH. Fixed this session (resolves a fresh signed URL at display
  time, matching the existing `SignedPhotoStrip` pattern).
- **Web forgot-password**: confirmed genuinely working end-to-end, live, via a new script
  (`supabase/scripts/qa-verify-password-reset-flow.mjs`, 11/11 pass) that drives the real
  Supabase recovery-link/session/password-update mechanism without needing a real inbox. No code
  fix was needed on web. **Still genuinely untested**: real SMTP delivery to a real inbox (no
  browser/email tool available in this environment) — this is the one part of "does forgot
  password work" that remains unverifiable here.
- **Android's total lack of a password-recovery UI** (previously flagged, "needs a decision") —
  decided and built: a "Forgot password?" link on the Login screen opens the web
  `/forgot-password` page in the device browser. Android still has no deep-link/App-Link capability
  to receive a recovery email directly inside the app — unchanged, matches the originally-scoped
  interim, not a full native flow.
- **Still genuinely open**: no real Service Certificate PDF has been visually inspected by a human
  on EITHER platform (web or Android) — both are code/build-verified only. This is the single
  most important remaining gap before telling real staff to rely on this feature.
- `git status` shows all of this uncommitted as of this entry (6 modified + 4 new files in
  `mobile-android`/`supabase`) — no commit/push was requested this session.

## RESOLVED (2026-08-17, later night) — Job Card save was 400ing on every edit; real /auth/callback page added; deployed live

- **Root cause, confirmed against every migration touching `job_cards`**: `JobCardDetail.jsx`'s
  `editForm` seeded a `notes` field from `jobCard.notes` -- `public.job_cards` has never had a
  `notes` column (0001/0003/0008/0020/0022/0025 checked). No input anywhere in the edit form
  ever rendered or set it; pure dead state that still rode along in `saveJobChanges()`'s spread
  payload. PostgREST rejects an update outright on any unknown column, so **every single Job
  Card save -- status, dates, technician, fault description, everything -- was failing with
  PGRST204** in production, not just a "notes" feature gap. Fixed by removing the dead field
  (no migration -- it was never real). Audited every other `entities.X.update()`/`.create()`
  call site in `frontend/src/pages` (Client/Machine/ServiceRecord/JobCardLine/ProductService)
  against the real schema -- all clean, this was the only mismatch.
- **Auth**: `/auth/callback` was in Supabase's configured Redirect URLs but had **no matching
  route anywhere in the app** -- any Supabase redirect landing there hit the plain 404 page.
  Built a real `AuthCallback.jsx` (waits for the client SDK's automatic `detectSessionInUrl`
  exchange, forwards `PASSWORD_RECOVERY` to the existing `/reset-password` page, a real session
  into the app, no session to a clear expired-link message) and wired it as the new
  `emailRedirectTo` target for signup confirmation (previously hardcoded to `/login`).
  `/reset-password` itself was already correct and unchanged (`ResetPassword.jsx`, real page,
  real `supabase.auth.updateUser({password})` call). See `DECISIONS.md` for the exact Supabase
  Site URL / Redirect URL recommendation given to the user.
- **Incidental finding**: `supabase/migrations/0030_service_certificates.sql` (Service
  Certificate Batch A) is now confirmed **applied** to production (new read-only
  `supabase/scripts/qa-check-0030-applied.mjs`) -- corrects the prior "NOT yet applied" status
  recorded elsewhere in this file/`PROJECT_STATE.md`. The certificate generate/preview/download
  UI (`CertificateSection` in `ServiceRecords.jsx`, per service record's detail panel) should
  now be fully live -- still no real PDF has been visually inspected by a human.
- **Found mid-session, not caused by this work, reviewed and left as-is**: two commits
  (`72db6d4`, `bd1b103`) appeared directly on `main` from the user's own git identity while this
  session was in progress -- not made through this session's delegation. Reviewed in full before
  pushing/deploying anything: a small `Jobs.jsx` display fix (real, low-risk), a defensive
  `SupabaseAuth.kt` fix for corrupted `EncryptedSharedPreferences` recovery (sound, matches this
  project's "never log a token" rule), the already-reviewed Android More-screen rework getting
  swept into the same commit, and a new sequential Job Card numbering feature in `BookIn.jsx`
  (JOB-0001, JOB-0002...). **The numbering feature has a real, disclosed, NOT-yet-fixed race
  condition**: `job_cards.job_number` has no database-level unique constraint, so the new
  client-side "list all job cards, find the max matching number, retry once if the insert errors
  as a duplicate" logic can never actually detect or prevent a real collision -- a duplicate
  `job_number` insert simply succeeds silently (no DB error to retry on). Two Book-Ins
  overlapping in time could receive the same job number. Not fixed this session (out of the
  scope the user asked for) -- flagged here for a future dedicated fix (a Postgres sequence or a
  `SELECT ... FOR UPDATE`-guarded RPC would close this properly; the current client-side
  read-then-write has an inherent TOCTOU gap no amount of retry logic on the client side alone
  can close without a real database constraint).
- **Verification**: `npm run lint` / `typecheck` / `test` (58/58) / `build` all clean. Pushed
  (`36dcb71`) and deployed live via `wrangler deploy`. Hit a mild version of the known transient
  multi-deploy-race pattern (a second, independent deploy from the same account landed 55s after
  this session's own deploy) -- live bundle byte-compared against the local build: identical
  except one embedded static-asset hash reference (`optimaoutline-*.svg`), which resolves fine
  live (200) either way -- confirmed functionally identical, not stale/broken, across 5 polls
  with `Cache-Control: no-cache`. Zero "firebase" strings in the live bundle; `/auth/callback`
  string confirmed present.

## RESOLVED (2026-08-17, night) — pushed to GitHub + deployed live to Cloudflare

- User instruction: "push to github and build live cloudflare." Commits `7ecb714..c8001e0`
  pushed to `origin/main`. `wrangler deploy` run from `frontend/` (correct account confirmed
  beforehand). **Hit the same transient stale-asset flap as 2026-08-16** (live site briefly
  served inconsistent old/new asset-hash combinations) — resolved via re-deploy + polling with
  `Cache-Control: no-cache`, confirmed converged: live bundle byte-identical (`cmp`) to the
  local build, HTTP 200, zero "firebase" strings, version
  `18265129-a169-4304-8fd1-024399200319` at 100% traffic. See `SESSION_LOG.md`'s matching entry
  and `.claude/agent-memory/queen-bee/technique_cloudflare_deploy_transient_stale_asset_flap.md`.
  **This closes item 4 of the "NEEDS THE USER" list below** (`Deploy to Cloudflare`) — left
  that original bullet in place for history, marked resolved there too.
- Deploying the CODE does not apply the pending migration — `0030_service_certificates.sql`
  still needs the SQL Editor (see the entry immediately below); the Service Certificate UI is
  now live in the deployed bundle but will error against production Postgres until then.

## 2026-08-17 (night) — Service Certificate Batch A: code complete, needs migration + real visual verification

**BLOCKS the feature from working at all until done**:
1. `supabase/migrations/0030_service_certificates.sql` is NOT yet applied — needs the user via
   the SQL Editor. Nothing in this feature (generate/preview/download/regenerate, company
   settings) works end-to-end until it is.

**Genuinely unverified, disclosed, not silently assumed working**:
2. **No real PDF has been visually inspected.** jsPDF call shapes were checked against the
   library's own `node_modules/jspdf/types/index.d.ts` (caught and fixed one real bug —
   `doc.internal.getNumberOfPages()` doesn't exist, only top-level `doc.getNumberOfPages()`
   does), but that's static verification, not the same as generating one and looking at it.
   Generate a real certificate against a real service record (ideally one with long notes, one
   with several photos, one with missing optional client/machine fields) and actually look at
   the layout before trusting this for a real client.
3. **Cross-origin photo loading for the certificate's Photos section is unverified.** Signed
   Storage URLs are loaded into an `Image()` element with `crossOrigin="anonymous"` and drawn
   to a canvas for downscaling — this requires Supabase Storage's response to carry a
   permissive CORS header, which is very likely true (this is Supabase's normal behavior) but
   was not confirmed live this session.
4. **No automated test coverage** for `serviceCertificatePdf.js`, the new `CertificateSection`
   UI, or `CompanySettingsPanel.jsx` — build/lint/typecheck clean only, matching this project's
   existing pure-logic-only test coverage gap.
5. Certificate numbering does not reset annually (disclosed simplification, see DECISIONS.md)
   — flag if strict `CAP-SVC-2026-000001` reset-every-January is actually required.

**Explicitly not built yet (Batch B/C, not a gap in Batch A's own scope)**:
6. No email sending, no attachment upload, no email history, no Settings > Email section — all
   blocked on the user creating a Resend account and providing an API key.
7. No Android certificate/email UI or data-layer work at all yet.

## 2026-08-17 (evening, latest) — Register page was 100% non-functional, now fixed; Dashboard redesigned — see SESSION_LOG.md

**RESOLVED (build-verified, NOT live-verified)**: `Register.jsx` called `apiClient.auth`
methods (`register`/`verifyOtp`/`resendOtp`/`loginWithProvider`) that never existed on the live
Supabase `apiClient` — self-service registration has been completely broken since the
2026-08-13 Supabase cutover, not just "unlinked." Fixed with real `supabase.auth.signUp()`
plumbing; fake Google button and fake OTP-code UI removed (neither could have worked). Full
detail in SESSION_LOG.md.

**STILL OPEN / genuinely unverified**:
1. **No live click-through test of registration** — whether a real confirmation email actually
   arrives, and whether this Supabase project's "Confirm email" setting is ON or OFF, was not
   confirmed (no browser tool, no dashboard/MCP access this session). Code handles both
   branches; only a real signup attempt with a real inbox would confirm which one fires. Same
   category of gap as the pre-existing untested password-reset flow.
2. **No standalone Machines list page exists** — Dashboard's new clickable "Machines" stat card
   links to `/clients` (the real browse-in point) instead, since machines are always viewed
   in the context of their owning client in this app. Not a bug, a disclosed scope choice —
   flag if a dedicated Machines list page is ever wanted.
3. **No test coverage for Dashboard/Register/Login/UserAdmin** — this project's only automated
   tests are pure-logic (`customerImport`/`recordPhotoPath`); none of today's changes have any
   automated regression coverage, only lint/typecheck/build verification.

## 2026-08-17 (evening) — User Management Save Changes 400, round 2 — see SESSION_LOG.md

**RESOLVED (build-verified, NOT yet live-verified against production Supabase)**: `UserAdmin.jsx`
save() sent a client-only `effective_permission_count` field (stamped on every user record by
`withPermissionCount()` for the list-badge UI) straight through to the `public.users` PUT —
PostgREST rejects the whole update on any unknown column, so every save 400'd. Same failure class
as the 2026-08-16 `name`/`permission_overrides` bug, one field the original fix missed. Fixed in
`supabaseApiClient.js`'s PUT/PATCH handler (strips `effective_permission_count`/`id`/
`created_at`/`updated_at` for the `users` table now). `npm test`/`lint`/`typecheck`/`build` all
clean. Full detail in SESSION_LOG.md.

**NEW, genuinely open gap found while investigating the above**: `supabase/scripts/qa-verify-
useradmin-save-and-delete.mjs` (2026-08-16) claims in its own header comment to send "the exact
payload shape UserAdmin.jsx's save() sends," but actually hand-crafts a clean, minimal payload —
which is why it reported "live-verified 12/12" while the real UI-driven save was still broken.
Not fixed this session (separate from the reported bug). Should be updated to replicate the real
contaminated `form`-spread shape (including `effective_permission_count`) so it can catch this
class of bug in the future instead of passing around it.

**No Supabase MCP tool access this session** (Queen Bee's own tool list, and independently a
`testing-bee` subagent's) despite MCP server instructions for it appearing in context — could not
query live schema/logs/advisors to confirm this fix against production directly; confirmed via
repository code trace only (two independent traces, same conclusion). Worth checking why MCP
tools aren't actually present next session if live Supabase queries are needed again.

## 2026-08-17 (afternoon) full sweep — see SESSION_LOG.md for full detail. Summary below.

**RESOLVED this session** (fixed and verified, no action needed):
- `anon` default-grant gap on 4 tables — migration 0028 applied + live-reverified 23/23.
- 4 leftover throwaway QA accounts — deleted per explicit approval, confirmed gone.
- Notes/Settings denial-vs-already-deleted messaging — fixed, build-verified 16/16 (NOT
  verified against live production yet — needs a disposable-account REST script if wanted).
- `LiveFirebaseSmokeTest.kt` + web's equivalent dead `test:e2e:live` script — both deleted.
- Web: photo click opens a new tab instead of an in-app viewer — fixed on
  `MachineDetail.jsx`/`JobCardDetail.jsx` (`ServiceRecords.jsx` already had its own).
- `ClientDetail.jsx` Edit/Delete buttons showing regardless of `clients.edit`/`clients.delete`
  permission — gated to match the real RLS policy (never a security hole, was a UX gap).
- Repo hygiene: 4 confirmed-junk/dead files+directories removed, `AGENTS.md`/
  `docs/android/ANDROID_SUPABASE_MIGRATION.md` staleness corrected.

**RESOLVED 2026-08-17 (evening)**: `supabase/migrations/0029_knowledge_base_permanent_file_paths.sql`
is confirmed APPLIED to production. Verified read-only (no rows created) by calling both of its
new RPC functions (`can_access_knowledge_media`/`can_access_knowledge_document`) via the
service_role key from `supabase/.env` — both exist and are callable (previously would have
errored `PGRST202`/"schema cache" if not applied). The migration file's own header still says
"NOT YET APPLIED" as a stale artifact of when it was written — that comment is now incorrect and
should be corrected the next time this file is touched, but the file itself was not edited here to
avoid mixing an unrelated doc-only change into this verification. `supabase/scripts/qa-verify-
kb-permanent-paths.mjs` (the full live write/cleanup test) was NOT run this check — this was a
lighter, non-destructive existence check only, sufficient to answer "is it applied" without
creating throwaway data. Run the full QA script if end-to-end behavior (permanent path storage +
cross-user signed URL) needs re-confirming.

**NEEDS THE USER — not something code alone can finish**:
1. **RESOLVED 2026-08-18** — Android now has the previously-scoped interim: a "Forgot password?"
   link on the Login screen opens the web `/forgot-password` page in the device browser (still no
   deep-link/App-Link to receive a recovery email natively in-app, unchanged/disclosed). See the
   dedicated 2026-08-18 RESOLVED entry near the top of this file.
3. **Real email deliverability for registration/password-reset has never been tested with a
   real inbox** — this blocks confidently telling real staff to self-register at `/register`
   for their Android/web accounts. Needs the user to actually test one real address.
4. **RESOLVED 2026-08-17 (night)** — Deploy to Cloudflare: pushed to GitHub (`7ecb714..c8001e0`)
   and deployed live via `wrangler deploy`, independently byte-verified against the live site
   (see the dedicated RESOLVED entry above). Confirmed no CI/CD auto-deploys this repo (plain
   Worker config, no Pages git integration) — a real `wrangler deploy` remains a separate,
   explicit action each time.

Everything below this point predates today's sweep (Firebase-era history, already-RESOLVED
entries, or genuinely still-open items already itemized above) — kept for historical record,
not re-summarized here.

## RESOLVED (2026-08-17) — silent-success-on-denied-write fixed, live-confirmed 38/38

- Fixed per explicit user instruction ("Yes, go ahead and fix it"). `SupabaseData.kt`'s
  `update()`/`delete()` now request `Prefer: return=representation` and a new
  `requireRowAffected()` throws `ApiException("You do not have permission to do that.")` when the
  returned array is empty — the same message an outright 403 already used, so a denial reads
  identically to the user regardless of which RLS-policy shape produced it. Also added a
  `JSONException` fallback (a 2xx with an unparseable body reports "unable to confirm the change
  was saved," never assumed success) — a real edge case the implementer (`supabase-android-bee`)
  caught that the original fix sketch hadn't covered.
- **Build-verified**: clean Gradle build, 16/16 unit tests (unchanged), 0 lint errors/28 warnings
  (unchanged) — `testing-bee`, real `assembleDebug`.
- **Live-verified against production, the one thing left genuinely unconfirmed when this was
  first found**: `testing-bee` corrected a flawed premise in the original verification task (the
  fix does NOT make PostgREST itself return an error status — it still answers a USING-filtered
  write with `200`/`204`; what changed is the *client* now asks for the representation and can
  tell an empty one apart from a real success). Updated `supabase/scripts/
  qa-verify-phase9-settings-rls.mjs` to measure exactly that contract (added a `clientSeesDenial()`
  helper mirroring `requireRowAffected()`'s own logic, plus 6 new checks proving the converse —
  that a genuinely allowed write, including a no-op edit to identical values, still returns a
  non-empty representation and is never false-denied). **Result: 38/38 checks pass** (the script's
  own check count grew from 32 to 38 — update any reference to "32 checks" elsewhere). Full cleanup
  independently re-verified (0 residual rows/accounts, singleton restored to its exact original
  `updated_at`).
- **Incidentally confirmed, structurally (not live-tested), to close 2 more instances of the exact
  same bug class**: a non-admin `save("users", <someone else's id>, ...)` and a non-creator/
  non-admin edit/delete of a `dashboard_notes` row — both are `USING`-clause policies
  (`users_update_admin`, `dashboard_notes`'s creator-or-admin policies) with the same
  previously-silent-204 shape, now also correctly caught by the same fix since it's applied
  generically to every table's `update()`/`delete()`, not just Settings'.
- **One disclosed, deliberately-not-solved limitation**: a denial and "someone else deleted this
  row a moment ago" are both a zero-row response and both now report "You do not have permission
  to do that." — not literally accurate for the second case. Documented in `SupabaseData.kt`'s
  KDoc rather than solved with a second round-trip; flagged as a real, low-priority follow-up if
  ever wanted.
- Files: `mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/SupabaseData.kt`,
  `supabase/scripts/qa-verify-phase9-settings-rls.mjs`. No RLS policy, migration, `MainActivity.kt`,
  or `Core.kt` change was needed — this was purely a client-side honesty fix.

**Original finding, preserved for history — now fixed, see above:**

## CONFIRMED LIVE (2026-08-17, user ran the script directly) — Android Phase 9 write paths work correctly for authorization, but denied UPDATE/DELETE surface as a silent HTTP 204 instead of an error

- **The write-path QA script blocked overnight (see the RESOLVED entry below) was run for real
  once the user gave a direct, current-turn instruction to run it** — the auto-mode classifier
  that blocked both the subagent and Queen Bee's own attempt overnight did not block a
  same-action run triggered by an explicit user instruction in the conversation. **29/32 checks
  passed.** Every authorization check passed: `settings.access` correctly allows create/update/
  archive/delete on `products_services` and update on `job_card_settings` (including the
  `is_admin()` bypass path for an admin with no explicit grant); a user WITHOUT `settings.access`
  is correctly blocked from actually changing any data (`INSERT` hard-fails 403; `UPDATE`/`DELETE`
  leave the row/singleton **genuinely, server-side-verified unchanged** in every case); cleanup
  fully verified (0 residual rows, 0 residual test accounts, the real `job_card_settings`
  singleton restored to its exact pre-run snapshot).
- **The 3 failures are exactly the finding predicted overnight, now confirmed against real HTTP
  responses, not just a policy reading**: a `settings.access`-lacking user's `PATCH`/`DELETE`
  against `products_services` or `PATCH` against `job_card_settings` returns **HTTP 204** (the
  same status a real, successful write returns), not an error — because those 3 operations are
  gated by `USING`-clause RLS policies, and PostgREST's semantics for a `USING` clause that
  filters out every matching row is "successfully affected 0 rows," not a 4xx. (Only
  `products_services_insert`, a `WITH CHECK` policy, correctly hard-fails 403 — confirmed live
  too.) `SupabaseData.kt`'s `update()`/`delete()` only check the HTTP status code, so
  `MainViewModel.save()`/`deleteThenRun()` would report success to the Android UI even though
  nothing changed server-side.
- **Still not a security bug** — data is never actually exposed or modified; RLS itself is
  correctly enforcing authorization in every case tested. It's a UX-honesty gap: a user whose
  `settings.access` is revoked mid-session, while the Settings screen is still reachable from
  cached nav state, could see a false "saved" message. **Not fixed yet** — flagging as a real,
  now-confirmed (not hypothetical) candidate fix: have `SupabaseData.kt`'s `update()`/`delete()`
  request `Prefer: return=representation` (or check the `Content-Range` header) and treat "0 rows
  affected" as a failure, the same honesty standard this codebase already holds itself to
  elsewhere (e.g. `AccountScreen`'s real-error-not-fake-success handling).

**Original overnight entry, preserved for history — the blocker below is resolved, the finding
above is what actually happened once unblocked:**

## RESOLVED (2026-08-17) — the classifier block was session/trigger-specific, not permanent

- Overnight, both the subagent's own attempt to run `qa-verify-phase9-settings-rls.mjs` and Queen
  Bee's own direct attempt (under a blanket "you're allowed to do everything" grant made *before*
  the specific action) were denied by Claude Code's auto-mode classifier. The next morning, the
  user gave a direct, specific, current-turn instruction ("run that write-path QA script directly
  yourself") and the identical command succeeded without any config change. Durable lesson: a
  broad advance authorization and a specific in-the-moment instruction are not equivalent to this
  classifier, even though both are "the user's real intent" from a human's perspective — see
  [[feedback_classifier_blocks_live_writes_regardless_of_user_authorization]] in Queen Bee's own
  agent memory for the general rule, now updated with this resolution.

## NEW, disclosed, no active data exposure — `anon` role has default table-level grants on every table created after `0002_rls_policies.sql`'s schema-wide revoke (found 2026-08-16 overnight, Android Phase 9 build verification)

- `0002_rls_policies.sql:66-68` does `revoke all on schema public from anon` as deliberate
  defence-in-depth, on top of RLS itself. That revoke is a point-in-time statement — Postgres/
  Supabase's default privileges mean tables created by LATER migrations get ordinary `anon`
  table-level grants back automatically, unless each new migration re-revokes them explicitly
  (none has).
- **Confirmed live, read-only, anon key only**: `clients` (from `0001`, before the revoke)
  correctly returns `401`/`42501` for an anonymous request. `products_services`/
  `job_card_settings` (from `0018`, after the revoke) both return `200 []` for the same kind of
  anonymous request — the RLS policy (`has_active_profile()`) is still what's actually blocking
  real data (confirmed zero rows returned, not real data leaking), but there's only one
  protective layer where `clients` has two.
- **Scope not fully confirmed** — only these 3 tables were checked; whatever else migrations
  `0017`/`0019`-onward created plausibly share the same gap, but a full sweep was blocked by this
  session's own tool-permission classifier. Needs a proper audit, then likely a small new
  migration re-running `revoke all on schema public from anon` (or granting per-table only where
  actually needed) — not attempted this session, since it's a schema change needing the same
  review-then-SQL-Editor process as every other migration, and there is no evidence of real data
  exposure to justify skipping that process urgently.
- Not caused by Phase 9's own work — found incidentally while `testing-bee` was live-verifying
  Phase 9's `SupabaseData.kt` fix (see the matching Android Phase 9 entry in `SESSION_LOG.md`).

## RESOLVED (2026-08-16) — Cloudflare account mismatch, fully fixed and independently confirmed

- This machine's local Wrangler CLI was authenticated as `gerhard.ark.of.war@gmail.com`
  (account `72e8ade6697337b0bc2f2746b5570ff6`) — an unrelated account owning only
  `insightwire`/`lekkervibes` — while the real production `capdashboard` Worker lives under
  `Gerhardvanwijk@gmail.com's Account` (`3f30316d2958f170287083b0b7d680b5`). First discovered
  when a deploy attempt was correctly stopped before running (`wrangler deployments list
  --name capdashboard` returned "This Worker does not exist on your account").
- **Fixed in two steps, both user-approved, both independently verified rather than taken on
  trust**: (1) `frontend/wrangler.jsonc` pinned with `"account_id":
  "3f30316d2958f170287083b0b7d680b5"` (`e54f15c`) — confirmed working by the fact that the
  exact same `deployments list` command's error changed from "Worker does not exist" to
  "Authentication error", with Wrangler's own warning explicitly naming the pinned account,
  proving the pin was being read correctly even while the account itself was still wrong. (2)
  User re-authenticated (`wrangler logout` + `login`) to the correct account. Re-confirmed
  independently afterward via a fresh `wrangler whoami` — genuinely shows
  `gerhardvanwijk@gmail.com` / `3f30316d2958f170287083b0b7d680b5` now.
- **Deployment itself is still gated on the user's explicit go-ahead per standing policy** — this
  entry only closes the account-identity blocker, it is not itself authorization to deploy.
- **UPDATE (2026-08-16, overnight): the user gave that explicit go-ahead** ("push to git and
  deploy... make sure it is live on cloudflare") and a real deploy was run and independently
  verified live — see `SESSION_LOG.md`'s matching overnight entry. This account-identity fix is
  confirmed working under real deploy conditions now, not just via `whoami`/dry-run checks.


## RESOLVED (2026-08-16, later same day) — migration 0027 applied, live-verified end-to-end

- User applied `0027_client_delete_cascade_and_import_updates.sql` via the SQL Editor. Confirmed
  independently, not taken on trust: `qa-check-0026-0027-applied.mjs` shows all
  columns/permission rows live, and a new `qa-verify-0027-cascade-delete.mjs` created a
  throwaway client + machine, deleted the client, then independently re-queried both rows —
  confirmed genuinely gone (real cascade, not just "the delete call didn't throw"), no residual
  data left. **Client deletion (including clients with machines) now actually works.**
- Job Card and Knowledge Base deletion were never blocked on this migration (their cascade FKs
  were already correct) — both were already live as soon as their code shipped.

**Original finding, preserved below for history:**

## ORIGINAL — "Delete Client" fails for any client with machines; migration 0027 written, NOT yet applied (found+fixed 2026-08-16)

- **Root cause, confirmed against the live schema**: `ClientDetail.jsx`'s delete confirmation
  dialog has always said "This will permanently delete `<client>` and all its machines," but
  `0001_initial_schema.sql` defined `machines.client_id` as `references public.clients (id) on
  delete restrict` — the opposite of what the UI promises. Any client with at least one machine
  (almost every real one) cannot actually be deleted; Postgres rejects it with a foreign-key-
  violation error. `sites.client_id`/`job_cards.client_id` were already correct (cascade / set
  null); `machines` was the one broken link.
- **Fix written**: `supabase/migrations/0027_client_delete_cascade_and_import_updates.sql` drops
  and recreates the constraint as `on delete cascade` (constraint name looked up dynamically via
  `pg_constraint`, not guessed). Same migration adds `clients.delete`/`job_cards.delete`/
  `knowledge_base.delete` to `public.permissions` (already RLS-enforced, just never in the
  catalog) and `client_imports.updated_count` (new CSV-importer "update existing customer"
  feature, see below).
- **NOT yet applied — independently confirmed live, not assumed**:
  `supabase/scripts/qa-check-0026-0027-applied.mjs` (service-role, read-only) shows
  `client_imports.updated_count` missing as of 2026-08-16, meaning migration 0027 itself has not
  been run yet. **Client deletion will continue to fail for any client with machines until the
  user applies this migration via the SQL Editor.** The same check independently confirmed
  migration 0026 (`users.photo_path`) IS live, matching the user's own report — Android's
  `PROFILE_COLUMNS` was updated to include it on the strength of that independent confirmation,
  not the report alone.
- Also delivered this session (both platforms, real-build-verified): delete UI for Job Cards and
  Knowledge Base entries (neither had ANY delete capability on web before — not broken, simply
  never built), and a CSV/Excel importer "update existing customer" action (Pastel/Sage One
  Online Accounting export, explicit user request) — see `SESSION_LOG.md`'s matching entry for
  full detail on all of the above.
- Job Cards and Knowledge Base delete do NOT depend on 0027 — `job_card_lines`/`knowledge_notes`/
  `knowledge_service_codes`/`knowledge_media`/`knowledge_documents` all already cascade
  correctly (`0001_initial_schema.sql`), so those two work as soon as the code ships, with no
  migration needed. Only Client deletion (of a client with machines) is blocked on 0027.

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
- **UPDATE (2026-08-16, same day): Android Phase 8 landed**, `e703177`, real-build-verified
  (`BUILD SUCCESSFUL`, 23/23 tests, 0 lint errors/30 warnings, real APK) — `UsersScreen`/
  `UserDetailScreen` write exactly `{full_name, email, role, is_active, effective_permissions}`,
  confirming the prediction below and not replicating web's now-removed `permission_overrides`
  pattern. See `ROADMAP.md`'s Phase 8 entry for full detail.

## RESOLVED (web: shipped before 2026-08-18, confirmed live that day; Android: fixed 2026-08-18) — was: Knowledge Base photo/document uploads permanently break 7 days after upload (found 2026-08-15, during Android parity Phase 5)

Web was already fixed and shipped (migration 0029 + `storage.js`/`KnowledgeMachineDetail.jsx`)
by the time this was re-checked 2026-08-18 — live-reconfirmed then via
`supabase/scripts/qa-verify-kb-permanent-paths.mjs`, 12/12 pass including cross-technician
signed-URL access. Android's display code was still reading `file_url` as if it were a
ready-to-use URL (true when this entry was first written, no longer true once 0029 shipped) —
fixed the same day. See the dedicated 2026-08-18 RESOLVED entry near the top of this file and
`DECISIONS.md`'s matching entry for full detail. Original finding preserved below for history:

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
  "Firestore"/`capdatabasefb2` labels — genuinely accurate at the time this was written (that
  screen really did still probe Firestore). **RESOLVED 2026-08-16**: fixed as Phase 11 of the
  cross-platform parity initiative (`2eb9f33`) — `StatusRepository` now checks real Supabase
  health, and Firebase was removed from Android entirely the same day (Phase 12, `408fe0e`,
  real-proof-verified — see `ROADMAP.md`'s Phase 12 entry). No consistent top-bar back/up
  affordance for the 8 screens reached
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
