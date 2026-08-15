---
name: project-android-supabase-migration
description: Separate, explicitly-authorized migration project (started 2026-08-13) moving mobile-android/ off Firebase (Auth+Firestore) onto Supabase Auth+Postgres/RLS, following the user's own A-J phase structure. A-D, E1, E2 done as of 2026-08-15; Phase F (UI/UX) now in progress. Check current phase before assuming more progress happened.
metadata:
  type: project
---

**UPDATE 2026-08-15**: E1 gate passed 2026-08-14 (see [[project_e1_reliability_fix_paused]]).
E2 (photo upload, web+Android) landed and was real-device tested by the user. Phase F (UI/UX
consistency, 2 rounds) then **Phase G (branding/visual identity, 3 rounds) both completed the
same session** — every round: `android-ui-bee` implements (no Bash, manual review only),
`testing-bee` independently real-build-verifies before Queen Bee commits. All 5 rounds combined:
23/23 unit tests unchanged, 0 lint errors throughout. **The "this machine's CLI Gradle build
doesn't work" constraint below is now SUPERSEDED for how to think about it going forward — see
[[project_android_gradle_tls_avast_resolved]] for the real root cause (Avast TLS interception,
not a CA/project defect) and the working-but-not-yet-durable fix.** Phase G shipped the app's
first-ever launcher icon (derived "C" monogram — no source logo asset exists anywhere in the
repo) and fully removed the Google Calendar UI (its backend was already dead). `testing-bee`
caught a real, build-breaking bug in the icon's first draft (`--` inside an XML comment) by
actually rendering the vector art, not just parsing it — see [[technique_subagent_report_retrieval]]
for how these reports get retrieved, and note testing-bee's verification bar is genuinely
strong: it renders artifacts, extracts jars from the Gradle cache to prove classes exist, and
checks APK dex/manifest contents directly rather than trusting "the build succeeded."
**Consistent gap across all of Phase F+G: on-device visual/runtime behavior is never verified
by any agent in this pipeline** — only compile/lint/package. Latest APK installed to the user's
device via `adb install -r` at the end of the Phase G session specifically so a real check is
possible. Still true: `supabase-android-bee`/`migration-audit-bee` were not invocable this
session either (same recurring agent-registration gap, still unfixed, still unexplained).

Separate from the (completed) web Firebase→Supabase migration — do not conflate the two, the
user was explicit about this. Full living record: `docs/android/ANDROID_SUPABASE_MIGRATION.md`
(Firebase-collection→Supabase-table mapping, auth mapping, RLS/permission mapping, schema
gaps, navigation architecture, feature triage, Calendar recommendation, migration sequence,
risks) — re-read that file's current state before continuing, don't rely on this summary
being current as the phases progress.

**Phase structure (user's own, A through J)**: A=audit, B=architecture/mapping+nav
foundation, C=authentication, D=core data (Clients/Machines/Jobs/Services/Products),
E=secondary features (Forms/Knowledge Base/Invoices/Notes/Photos), F=UI redesign, G=logo/
icon, H=testing, I=Firebase removal, J=final build. **Each phase requires explicit review/
approval before the next starts** — this is a hard, repeatedly-stated constraint from the
user's own original spec. As of 2026-08-14: A, B, C, D done. E-J not started.

**2026-08-14: user asked to "run through all the phases" unsupervised overnight — Queen Bee
did NOT comply literally, and this was the right call.** Completed D (the phase already
approved and in progress), then explicitly stopped and documented per-phase reasons for not
rushing E-J (§12.9 of the migration doc): E needs the same rigor D just got plus genuine new
photo-upload feature work; F/G are human design work (G has literally no source logo asset in
the repo); H needs a real compiler this environment doesn't reliably have; I is gated by a
*standing prior instruction* (not something Queen Bee invented) requiring verified D/E parity
first; J depends on I. **Lesson for future overnight/broad-scope instructions in this
project**: when a user issues a broad "just do everything" instruction while unavailable to
redirect, the responsible move is to complete the increment already in flight properly
(with real verification), then stop at a clean, documented boundary rather than either (a)
literally attempting everything with degrading verification rigor as scope grows, or (b)
silently doing less than asked without explanation. Explaining *why* each skipped phase was
skipped (not just "I stopped") is what made this defensible — do this again if it recurs.

**Phase D key facts**:
- `SupabaseData.kt` (new): generic PostgREST CRUD + polling-based "observe" (20s interval +
  immediate refresh on the user's own writes) for `clients`/`machines`/`service_records`/
  `job_cards`/`job_card_lines`. Plain REST, matching `SupabaseAuth.kt`'s Phase C precedent —
  not the `supabase-kt` SDK, same "can't verify new Gradle deps here" reasoning.
- **Deliberately scoped smaller than the doc's original §6/§9 sketch**: kept `CapRecord`/
  `RecordsState`'s existing generic `Map<String, Any?>` shape instead of typed models + real
  nested-route navigation — verified first (via grep) that screens already read current
  Postgres column names, so a pure backend swap needed zero screen changes. Nested-route
  conversion remains a real, deferred, separately-budgeted follow-up, not solved.
- **Real finding**: RLS on these 5 tables requires `effective_permissions` actually populated
  per user (not just a `role`) — first REST-contract test run failed 10/16 with `42501`
  errors until the test itself was fixed to grant realistic permissions; this is the intended
  design working correctly, not a bug, but reconfirms the already-known gap that most real
  Android users don't have a properly-provisioned Supabase account yet.
- Live REST-contract test (`qa-verify-android-phase-d-rest-contract.mjs`): **16/16 pass**
  against real production Supabase.
- **This machine's CLI Gradle build still fails** (same TLS/CA root cause, now surfacing at
  dependency resolution rather than the wrapper download) — **but Android Studio's own GUI
  build, launched by Queen Bee (`start studio64.exe <project path>`) and driven manually by
  the user, DID succeed.** Queen Bee cannot drive that GUI itself. This is the one
  known-working build path on this machine going forward — ask the user to re-run it after
  future Android changes rather than assuming CLI verification is possible.

**Phase C (authentication) key facts**:
- Login/session/identity now authoritatively Supabase Auth + `public.users` (new
  `SupabaseAuth.kt`, plain REST calls matching the existing `GoogleCalendarRepository.kt`
  pattern — deliberately NOT the third-party `supabase-kt` SDK, since new Gradle dependency
  resolution can't be verified in this environment at all). `Core.kt`'s `AuthRepository` kept
  an identical public signature, so zero UI/ViewModel changes were needed.
- **Real architectural resolution, not glossed over**: `firestore.rules` requires a live
  Firebase Auth session for every read, confirmed by reading the rules file directly — since
  Firestore isn't migrated yet, Supabase-only auth would break every Firestore screen. Fixed
  with a disclosed, temporary bridge: Supabase login is authoritative, then a best-effort
  secondary Firebase sign-in (same credentials) keeps unmigrated screens working; a bridge
  failure never fails the Supabase login itself. Removed in Phase I.
- **Real, live, unexpected finding, directly shapes Phase D+ expectations**: only 3 Supabase
  Auth users exist in production total — 1 real admin (already migrated) + 2 unrelated
  leftover throwaway QA test accounts (`qa-fixes+admin-...`/`qa-fixes+technician-...
  @invalid.local`, active, real roles) that escaped an earlier session's cleanup — flagged to
  the user, not deleted. Practical consequence: most real Android users almost certainly
  cannot log in via Supabase yet, same root gap as the web migration's still-untested
  password-reset flow.
- **Live REST-contract test, 12/12 pass**
  (`supabase/scripts/qa-verify-android-auth-rest-contract.mjs`) — drives the exact HTTP
  requests the Kotlin code makes against real production Supabase (login, wrong password,
  nonexistent account, session restore, profile load, role/permission shape, unauthenticated
  blocked, logout + confirmed server-side token revocation, malformed request, full cleanup
  independently re-verified). This is real verification of the server-side contract, but
  **not** of the Kotlin code compiling/running — see the environment-constraint note below,
  unchanged in kind from Phase B, now confirmed a third time.

**Key Phase A/B findings worth remembering**:
- No missing Supabase tables — every Firestore collection Android currently reads already
  has a live Postgres counterpart. Real gaps are field-level drift, not schema gaps:
  `knowledge_machines`'s entire column set changed (`name`/`model`/`description` →
  `manufacturer`/`model_name`/`variant`/`product_code`/`category`/`summary`/
  `supported_refrigerants`/`technical_specifications`/`main_functions`) since Android's
  Firestore integration was last touched — the single biggest remap in the project.
- Real permission-key confirmation should be done via a **live read of the production
  `permissions` table** (60+ real keys), not just grepping migration files — most were
  seeded via a data-migration script, not SQL INSERTs, so grep alone under-counts.
- Android currently has zero offline caching, zero Firebase Storage/photo usage, and zero
  real navigation (`NavHost`) despite all three having declared-but-unused dependencies —
  confirmed via full-tree grep, not assumed.
- `GoogleCalendarRepository.kt` is confirmed dead code (calls a Cloud Functions endpoint
  deleted from the web app 2026-08-12). Recommendation: Android's Calendar screen should
  read `service_records`/`machines`/`clients` from Supabase directly, no server-side
  service — same "check if RLS already solves it" reasoning that resolved
  [[firebase_permanently_retired]]'s `dashboardNotes` saga, applied proactively here.
- Feature scope is explicitly triaged (must-have/useful/web-only) per user instruction not
  to blindly port every web feature — Users/administration, the Settings hub, Dashboard
  Notes, and Invoice *processing* (not viewing) were flagged web-only; photo upload was
  flagged as the single biggest genuinely-missing mobile-native feature.

**Environment constraint, real and repeated — check before claiming Android code is
tested**: this machine cannot run a real Android/Gradle build. Confirmed via two
*independent* attempts: the pinned Gradle wrapper's distribution download fails (TLS/CA
trust-chain gap, see [[reference_cloudflare_account_mismatch]]-adjacent machine-tooling
issues, though this is a distinct root cause from that Cloudflare-account one), AND directly
invoking an already-cached alternate Gradle 9.2.1 distribution also fails (Gradle Plugin
Portal resolution — same underlying TLS gap, not a Gradle-version-compatibility issue).
Android code changes in this environment are manually-reviewed only (e.g. Phase B's
`AdaptiveShell`/`NavHost` rewrite was verified by grepping every `onNavigate("label")` call
site against the new adapter) — always disclose this explicitly, never imply a build/test
was run when it wasn't. Verify on the other machine where Android builds have previously
succeeded, or get this machine's TLS trust store fixed, before trusting Android code here
the way this session's Supabase QA scripts could be trusted for the web.
