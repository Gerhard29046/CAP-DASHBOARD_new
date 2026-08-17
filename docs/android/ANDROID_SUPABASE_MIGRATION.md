# Android → Supabase Migration — Phase A/B/C/D

**STALE STATUS LINE BELOW, CORRECTED 2026-08-17 — READ THIS FIRST.** This file's own status
line still said "Phases E–J NOT started" as late as 2026-08-17, which is no longer true and
actively misled an agent that session (see `docs/ai-memory/DECISIONS.md`'s matching entry).
**The migration is fully complete.** Firebase was removed from `mobile-android/` entirely on
2026-08-16 (Phase 12 of the separate cross-platform parity initiative, real-build-verified —
see `docs/ai-memory/ROADMAP.md`'s Phase 12 entry and `CLAUDE.md` §6.2). `Core.kt`'s
`AuthRepository` has a single constructor dependency (`SupabaseAuthRepository`); there is no
`FirebaseAuth`/`FirebaseFirestore` reference left anywhere in `mobile-android/` source. Before
trusting anything below this point about "not started" phases, check `docs/ai-memory/
ROADMAP.md` and `CLAUDE.md` §6.2 for the actual current state — this file was never fully
updated as later sessions (outside this document's own A–D scope) finished the remaining work.

Original content, preserved for history below (describes Phases A–D specifically, which really
were this file's own scope and really are accurately described):

Living document for the Android Firebase→Supabase migration (separate project from the
completed web migration — see `docs/ai-memory/DECISIONS.md`'s 2026-08-13 entries for that
one; do not confuse the two). Status: **Phase A (audit), Phase B (mapping + navigation
foundation), Phase C (authentication), and Phase D (core data: Clients/Machines/Service
Records/Job Cards/Job Card Lines) complete. Phases E–J (secondary features, UI redesign,
logo/icon, testing, Firebase removal, final build) NOT started — see §12.9 for why this
session stopped here rather than continuing through all remaining phases unsupervised.**

Original Phase A/B content is unchanged below (§1–§10); Phase C is §11; Phase D is appended
as §12.

No Firestore data, production Supabase schema, or web application code has been touched by
this work. `firebase-auth` was NOT removed (still genuinely needed — see §11, §12).

---

## 1. Firebase collection → Supabase table mapping

Source of truth: the **live** Supabase schema (`supabase/migrations/0001`–`0023`, cross-checked
against a live read of the production `permissions` table), not an assumption from the web
migration docs alone. Column lists below are the table's *current, final* shape (i.e. already
including every `alter table` from later migrations), not just `0001`'s original draft.

| Firestore collection (Android reads today) | Supabase table | Notes |
|---|---|---|
| `users` | `public.users` | Same shape Android already expects: `full_name`/`email`/`role`/`is_active`/`effective_permissions`. Supabase adds `preferences jsonb`, `created_at`/`updated_at` — harmless extras. |
| `clients` | `public.clients` | `company_name`/`contact_person`/`email`/`phone`/`address`/`notes`/`is_active`. 1:1 with what `ClientsScreen`/`ClientDetailScreen` already read. |
| `machines` | `public.machines` | `client_id`/`site_id`/`brand`/`model`/`serial_number`/`machine_type`/`refrigerant_type`/`installation_date`/`warranty_expiry`/`notes`. **`machine_type` and `warranty_expiry` did not exist when the original schema draft was written — see §4 gap below, Android's current `MachineDetailScreen` predates both and may not display them.** |
| `service_records` | `public.service_records` | `machine_id`/`technician_name`/`status`/`next_service_due`/`notes`/`service_date`/`work_performed`/`findings`/`photos jsonb`. **`service_date`/`work_performed`/`findings`/`photos` are all newer than Android's current screen — see §4.** |
| `job_cards` | `public.job_cards` | `client_id`/`machine_id`/`status`/`fault_description`/`technician_name`/`technician_notes`/`arrival_condition`/`date_completed`/`job_number`/`date_received`/`arrival_photos`/`machine_type`. **`job_number`/`date_received`/`arrival_photos`/`machine_type` are newer than Android's current screen.** |
| `job_card_lines` | `public.job_card_lines` | `job_card_id`/`line_type`/`description`/`quantity`/`unit_price`/`line_total`. Unchanged since the original draft, matches Android's read-only usage exactly. |
| `knowledge_machines` | `public.knowledge_machines` | Original: `name`/`model`/`description`. **Real, current shape is `manufacturer`/`model_name`/`variant`/`product_code`/`category`/`summary`/`supported_refrigerants text[]`/`technical_specifications jsonb`/`main_functions text[]` — completely different from what Android's `KnowledgeBaseScreen`/`KnowledgeBaseDetailScreen` currently expect (`name`/`model`/`description`). This is the single biggest field-mapping change in the whole migration — see §4.** |
| `knowledge_notes` | `public.knowledge_notes` | Real columns: `title`/`content`/`note_type`/`created_by`. Android currently expects `title`/`body` (pre-rename) — **`body`→`content` rename, plus a new `note_type` column, not yet reflected in Android.** |
| `knowledge_service_codes` | `public.knowledge_service_codes` | Real columns: `service_code`/`function_name`/`description`. Android currently expects `code` (pre-rename) — **`code`→`service_code` rename, plus new `function_name` column.** |
| `knowledge_media` | `public.knowledge_media` | Real columns: `file_url`/`original_filename`/`title`. Android currently reads `file_url` (✅ correct) and `caption` (⚠️ **no `caption` column exists — likely should be `title`, see §4 gap, needs confirming against the current web frontend before assuming which is the bug**). |
| `knowledge_documents` | `public.knowledge_documents` | Real columns: `file_url`/`original_filename`/`title`. Not currently read by Android at all (only `knowledge_media` is). |
| *(not read by Android)* | `public.sites` | Exists, zero UI usage on **either** web or Android today. Do not build an Android screen for it without a real product reason — see §7. |
| *(not read by Android)* | `public.permissions`, `public.role_permissions` | Android doesn't fetch the permission catalogue itself — it trusts `users.effective_permissions`, already resolved server-side. Correct, no change needed (see §3). |
| *(not read by Android)* | `public.notifications`, `public.audit_logs` | Exist, zero UI usage on **either** web or Android today. Not in scope. |
| *(new this session, web-only so far)* | `public.products_services`, `public.job_card_settings`, `public.client_imports`, `public.dashboard_notes` | See §7 — feature-by-feature must-have/useful/web-only triage, not a blanket "port everything." |

## 2. Auth → Supabase Auth mapping

| Firebase Auth (Android today) | Supabase Auth (target) |
|---|---|
| `FirebaseAuth.signInWithEmailAndPassword(email, password)` | `supabase.auth.signInWith(Email) { this.email = ...; this.password = ... }` (Supabase Kotlin SDK, `gotrue-kt`/`Auth` plugin) |
| `auth.currentUser` (session restore) | `supabase.auth.currentSessionOrNull()` / `supabase.auth.sessionStatus` `Flow` — Supabase's Kotlin SDK persists sessions locally itself (via its own storage, pluggable), same "just works" characteristic as Firebase Auth's default behavior. |
| `auth.signOut()` | `supabase.auth.signOut()` |
| Firestore `users/{uid}` doc, read by uid then by-email fallback, mapped to `CapUser` | `supabase.postgrest["users"].select { filter { eq("id", session.user.id) } }` — **no by-email fallback needed**: Supabase's `public.users` row is guaranteed to exist per-uid via the `handle_new_auth_user()` trigger (fires on every `auth.users` insert), unlike the Firestore setup where a lookup miss was apparently possible/handled defensively. |
| `is_active`/`active` field check, `role`, `effective_permissions` (List or Map<String,Bool> quirk-handled) | Same fields, already always a clean `text[]` in Postgres (`effective_permissions text[]`) — **simpler** than Firestore's `toCapUser()`, which has to handle both a List and a legacy Map shape. That defensive branch can be dropped. |
| Bearer token: none currently stored/used directly (Firestore SDK handles auth internally) | Supabase's Postgrest/Storage calls are authorized via the session's JWT, held by the Supabase Kotlin client internally — **still no manual token handling needed for normal RLS-gated calls.** Per `CLAUDE.md`'s Android conventions, if a token ever needs to be read/stored directly for some reason, it must go through Keystore-backed encrypted storage — not needed for the baseline login flow itself. |

`CapUser`'s shape (`id/name/email/role/active/permissions`) needs **no redesign** — it maps
almost field-for-field onto `public.users`, which is itself already the same shape the web
app's `AuthContext`/`verifySupabaseUser()` already use successfully. This is the *lowest-risk*
part of the whole migration.

## 3. RLS / permission mapping for Android

Android currently does its own client-side permission gating (`CapUser.hasPermission()`
against `destinations`/`Destination.permission`) and **trusts Firestore rules for the real
enforcement** (Android never bypasses `firestore.rules` today — it just doesn't duplicate its
logic). The same pattern carries over directly:

- **Reads**: every table Android touches already has a `for select using (public.has_permission('...'))`-shaped RLS policy (or `public.has_active_profile()` for catalogue-style tables) — confirmed via `supabase/migrations/0002_rls_policies.sql`. Android's own `Destination.permission` strings (`clients.view`, `machines.view`, `services.view`, `job_cards.view`, `calendar.view`, `knowledge_base.view`, `invoices.queue.view`, `users.view`) were all **confirmed to exist as real, live permission keys** via a direct read of the production `permissions` table — no renaming needed.
- **Writes**: same story — `clients.create`/`.edit`/`.delete`, `machines.create`/`.edit`/`.delete`, etc. all exist and match Android's existing create/edit flows (Android has no delete UI today — matches; RLS having a `.delete` policy doesn't obligate building delete UI).
- **Admin bypass**: `public.is_admin()` is the single, already-proven mechanism (used by `has_permission()` internally, and directly by the `users` table's own policies) — Android needs **zero new server-side logic**, it already just checks `user.role == "admin"`-shaped things client-side for UI purposes while trusting the database for the real gate, exactly the pattern to keep.
- **Real, live permission catalogue is much richer than Android currently uses** (`job_cards.photos.upload`, `machines.reassign`, `services.next_date.schedule`, `users.roles.manage`, `settings.access`, `settings.manage`, `sage.*`, `reports.*`, etc. — 60+ keys total, confirmed via a live read). Android currently only references ~9 of them. This is expected and fine — **do not adopt permission keys Android doesn't have a corresponding feature for**; §7 below is the actual feature-by-feature filter for which of these become real Android screens.
- **One real design decision needed in Phase C**: unlike Firestore rules (which Android has never had to reason about directly, since the Firestore SDK just obeys them transparently), Postgres RLS + the Supabase Kotlin client behave the same way (a blocked query returns 0 rows or a policy-violation error, not a crash) — no architecture change needed, just confirm error-handling parity when this is actually implemented (matches the exact same `UPDATE`-returns-0-rows nuance already documented for the web's `dashboardNotesClient.js` this session).

## 4. Actual schema gaps (not invented — traced against real Android code and real Postgres columns)

**No missing tables.** Every collection Android currently reads has a live Supabase
counterpart. The real gaps are all **field-level drift**, because Android's Firestore
integration was written before several web-driven schema corrections landed this session:

1. **`knowledge_machines` — full field mismatch.** Android expects `name`/`model`/`description`;
   the real, current columns are `manufacturer`/`model_name`/`variant`/`product_code`/
   `category`/`summary`/`supported_refrigerants`/`technical_specifications`/`main_functions`.
   This is a straight rewrite of `KnowledgeBaseScreen`/`KnowledgeBaseDetailScreen`'s field
   reads in Phase D/E, not a schema change.
2. **`knowledge_notes.body` → `content`, plus new `note_type`.** Android's "add note" form
   (`KnowledgeBaseDetailScreen`) needs its field key updated.
3. **`knowledge_service_codes.code` → `service_code`, plus new `function_name`.** Android's
   service-code "reveal" UI needs its field key updated.
4. **`knowledge_media`/`knowledge_documents`: possible `caption` vs. `title` mismatch.**
   Android's code reads `photo.text("caption")` — no `caption` column exists in Postgres
   (only `title`/`original_filename`/`file_url`). Needs a quick check against the *current*
   web `KnowledgeMachineDetail.jsx` before assuming which side is "wrong" — flagged, not
   fixed, per Phase B scope.
5. **`machines`: `machine_type`/`warranty_expiry` are newer than Android's screen.** Real
   columns, real web features, simply added after Android's Firestore integration was last
   touched. Straightforward field additions in Phase D.
6. **`service_records`: `service_date`/`work_performed`/`findings`/`photos` are newer than
   Android's screen.** Same story — real columns, straightforward additions.
7. **`job_cards`: `job_number`/`date_received`/`arrival_photos`/`machine_type` are newer than
   Android's screen.** Same story.

None of these require a new migration — every column already exists in production. This is
purely "Android's field reads need updating to match the schema that already exists," which
is core Phase D work, not a Phase B schema change.

## 5. Data transformation required

- **IDs**: Firestore document IDs (opaque strings) → Postgres `uuid` primary keys (also
  strings at the Kotlin layer — `CapRecord.id: String` already treats ids as opaque strings,
  so **no type change needed** in the data model, just a different ID *format* under the hood).
- **Timestamps**: Firestore `Timestamp`/`FieldValue.serverTimestamp()` → Postgres
  `timestamptz`, exposed by the Supabase Kotlin client as ISO-8601 strings (or `kotlinx-
  datetime` types depending on serializer config) rather than Firebase's `Timestamp` object —
  any current `Timestamp`-specific formatting code will need updating (I did not find any
  such code in the current Android date-formatting helpers, since Firestore actually already
  stores/returns most of this app's dates as plain `date`-shaped strings, not `Timestamp`
  objects, per the schema's `date`/`timestamptz` column split above).
- **Arrays**: `effective_permissions` — Firestore stored this ambiguously (Android's own
  `toCapUser()` defensively handles both a `List` and a legacy `Map<String,Boolean>` shape);
  Postgres's `effective_permissions text[]` is **always** a clean array — this defensive
  branch simplifies away, not a transformation risk.
- **JSONB fields** (`technical_specifications`, `photos`, `arrival_photos`,
  `supported_refrigerants`, `main_functions`): the Supabase Kotlin client (via `kotlinx.
  serialization`) will deserialize these as typed Kotlin structures if a `@Serializable` data
  class is defined, or as raw `JsonElement`/`JsonArray` otherwise — a real, small design
  decision for Phase D (define proper `@Serializable` models vs. reusing `CapRecord`'s current
  generic `Map<String, Any?>` bag approach). Recommend defining typed models for the tables
  actually being rebuilt in Phase D rather than carrying `CapRecord`'s stringly-typed
  approach forward — cleaner, and Kotlin serialization is a natural fit for a real Supabase
  client (unlike the Firestore SDK's document-snapshot style, which `CapRecord` was designed
  around).

## 6. Navigation Compose architecture — foundation built this turn

**Done, not just proposed** (per your explicit "begin now" instruction):

- `ui/navigation/CapNavRoute.kt` — revised to match the app's actual final screen set
  (previously speculative/unwired scaffolding from an earlier phase — e.g. a phantom separate
  "UpcomingServices" route that was never built, a missing "Users" route despite the screen
  existing). Route ids are space-free/snake_case (`"dashboard"`, `"knowledge_base"`, etc.) —
  deliberately never reusing a display label as a route id, since several labels contain
  spaces ("Knowledge Base") and I could not verify on a real build here that Navigation-
  Compose's Uri-template route matching handles that safely (see §9 risk).
- `MainActivity.kt`'s `AdaptiveShell` — replaced the plain `var selected by remember {
  mutableStateOf("Dashboard") }` + manual `when` dispatch with a **real `NavController`/
  `NavHost`**, using the standard Google-recommended bottom-nav pattern (`popUpTo`/
  `saveState`/`restoreState` for the 4 tab destinations, plain push for everything else).
  This is a genuine, real fix — the system back button now actually pops the back stack
  (e.g. leaving "Account"/"Users"/"LogNewService" correctly returns to wherever the user came
  from) instead of doing nothing/exiting, which the app has never had before.
- A small **label↔route-id adapter** (`routeIdForLabel`/`labelForRouteId`) keeps every
  existing screen composable, every `destinations`/`permissionFor()` permission check, every
  title derivation, and **all 13 existing `onNavigate("SomeLabel")` call sites throughout
  the file completely unchanged** — verified by grep that every label ever passed to
  `onNavigate(...)` is covered by the adapter. This was a deliberate risk-reduction choice:
  the alternative (renaming every label throughout the file to route ids) would have touched
  far more code with no compiler available here to catch a typo.
- **Deliberately NOT done this turn**: converting the master-detail screens (Clients→
  ClientDetail, Machines→MachineDetail, Jobs→JobDetail, Services→ServiceRecordDetail,
  KnowledgeBase→KnowledgeBaseDetail) from their current internal `remember` state to real
  nested routes. `CapNavRoute` already reserves the id convention for this
  (`client_detail/{clientId}` etc.) but wiring them is scoped to Phase D, screen-by-screen,
  alongside each screen's actual data-layer swap — converting all five in one navigation-only
  pass, un-buildable/un-testable in this environment, was judged too much simultaneous risk
  for a "foundation" deliverable. Flag if you'd rather these be pulled forward.

## 7. Mobile feature list — must-have, useful, web-only

Deliberately **not** "port every web feature" — triaged against what genuinely belongs on a
phone doing field/workshop work, per your instruction.

**Must-have (core mobile workflow, keep/build for real):**
- Login/session/logout (already real).
- Dashboard (quick glance at stats + due services + quick actions).
- Clients, Machines, Service Records, Jobs — view/search/create/edit (already real, needs the
  field-mapping updates from §4).
- Log New Service, Book In — the two "field technician standing in front of a machine" forms
  (already real, high value, exactly the kind of task a phone is better at than a laptop).
- Upcoming Services / Calendar (due-date list — already real).
- Knowledge Base — viewing machine specs/notes/service-codes in the field is a genuine
  "I'm standing at the machine, need the manual info now" mobile use case. Keep, fix field
  mapping.
- Photo upload for service records/job cards (`service_records.photos`/
  `job_cards.arrival_photos`, real web feature this session, zero Android support today) —
  **this is a strong must-have**, arguably the single most "mobile-native" feature missing
  today (a phone has a camera in your pocket; a desktop workflow for site photos is awkward).

**Useful (real value, not blocking, sensible to add once core is solid):**
- Connection/Sync Status screen (already real, genuinely useful for field connectivity
  troubleshooting — keep).
- Knowledge Base document/photo viewing improvements (in-app viewer instead of "open
  externally").
- Products & Services catalogue — **read-only** lookup while filling in a job card line item
  in the field is genuinely useful; full catalogue *management* (add/edit/archive
  products) is not a mobile task — see web-only below.
- Job Card Settings-driven status/line-type lists (once Android's job card editing reads them
  instead of hardcoded values) — small, real consistency win, not urgent.

**Web-only (do not build for Android — flag explicitly, as requested):**
- **Users/administration** (role editing, permission management, user creation/disabling) —
  genuinely an admin-desk task, not a field task; Android's current read-only "Users" list
  screen is already borderline-unnecessary and shouldn't be expanded into real admin UI.
- **Settings hub** (Job Card configuration, Products & Services *management*, Customer
  Import) — configuration/back-office work, wrong form factor for a phone.
- **Invoice Queue actions** (processing/approval) — Android's current read-only view is
  reasonable as a glance-only screen; the actual invoicing workflow belongs on a desk.
  (Read-only "what's in the queue" is arguably "useful," not "must-have" — kept in that
  bucket above, not this one, since Android already has it and it's harmless.)
- **Dashboard sticky notes** — a "leave a note for the team while at your desk" feature; low
  value on a phone, real complexity (creator/admin RLS) for little mobile-specific payoff.
  Recommend leaving this web-only rather than porting it.
- **Reports** (`reports.*` permission keys exist, zero UI on either platform today) — not in
  scope for either client currently; not an Android gap to fix.

## 8. Calendar recommendation

**Do not recreate Google Calendar sync through Firebase** — confirmed dead already (Phase A),
and it was removed from the web entirely on 2026-08-12 as a deliberate cost decision (see
`docs/ai-memory/DECISIONS.md`). Recreating it, on any backend, would directly contradict that
decision and the standing "no new server-side service unless RLS genuinely can't do it"
guidance from this session's `dashboardNotes` work.

**Recommended architecture, matching what Android already has conceptually:**
- Android's "Calendar" screen has never been a real Google Calendar consumer for its core
  data — it's always been the due-date list, built from `service_records.next_service_due` +
  `machines`/`clients`, exactly matching the web's own "Upcoming Services" calendar (which
  also never depended on Google, per the 2026-08-12 removal notes).
- **Target: Android's Calendar screen should read directly from Supabase**
  (`service_records`/`machines`/`clients`, RLS-gated, same tables it already reads for other
  screens) — no server-side service, no Cloud Function, no Cloudflare Worker needed. This is
  the *same* "does RLS already solve this" question asked (and answered "yes") for
  `dashboardNotes` this session — here the answer is even more clearly yes, since this is
  pure read-only aggregation over already-RLS-gated tables Android already has permission
  logic for.
- **`GoogleCalendarRepository.kt` should be deleted in Phase I** (Firebase removal), once its
  one caller (`loadGoogleEvents()`/`googleEventsResult` in `MainViewModel`) is removed as part
  of wiring the Calendar screen to Supabase directly in Phase D — not before, per your "don't
  remove anything prematurely" instruction, since it's still technically referenced by
  working (if broken) code today.

## 9. Migration sequence (refined from Phase A's recommendation)

1. ~~Phase A — Audit~~ ✅ done.
2. ~~Phase B — Architecture/mapping + navigation foundation~~ ✅ done (this document).
3. **Phase C — Authentication**: Supabase Auth login/session/logout, `CapUser` loaded from
   `public.users` (no by-email fallback needed — see §2), Keystore-backed storage only if a
   raw token ever needs manual handling (not needed for the baseline flow). Add the Supabase
   Kotlin client dependencies (`postgrest-kt`, `gotrue-kt`/`auth-kt`, `storage-kt` — none
   currently present).
4. **Phase D — Core data**: Clients, Machines, Service Records, Job Cards, Job Card Lines —
   swap Firestore reads for Supabase reads screen-by-screen, applying the §4 field-mapping
   fixes as each screen is touched, **and** convert that screen's master-detail flow to a
   real nested route (`CapNavRoute`'s reserved `*Detail` ids) at the same time — one
   combined pass per screen, not two separate rewrites.
5. **Phase E — Secondary features**: Knowledge Base (full field remap per §4), photo upload
   (`service_records.photos`/`job_cards.arrival_photos` via Supabase Storage — new, real
   build, no Firebase Storage code to migrate *from*), Calendar→Supabase (§8).
6. **Phase F — UI redesign**: apply mobile-first visual polish on top of the now-real
   navigation graph — safe to do last since the structural risk (§6) is already resolved.
7. **Phase G — Logo/icon**: genuinely a clean slate (Phase A confirmed zero existing
   launcher icon/logo assets) — no legacy asset to reconcile.
8. **Phase H — Testing**: blocked on device/emulator access in this environment (see §9
   risks) — needs either this machine's Gradle/TLS gap fixed, or the other machine where
   Android builds have worked before.
9. **Phase I — Firebase removal**: delete `GoogleCalendarRepository.kt` (§8),
   `firebase-auth`/`firebase-firestore`/`firebase-storage` deps, `google-services.json`
   (currently git-tracked), the `google-services` Gradle plugin, `FirebaseModule` in
   `Core.kt`. Only after Phase D/E parity is verified, per your explicit instruction.
10. **Phase J — Final production build**.

## 10. Risks / blockers

- **This machine cannot run a real Android build.** Confirmed twice, independently, this
  session: the Gradle wrapper's distribution download fails (TLS trust-chain error), and a
  second attempt using a different, already-cached Gradle 9.2.1 distribution also failed
  (Gradle Plugin Portal resolution, same underlying network/TLS gap). **Today's navigation
  changes are unverified beyond careful manual review** — no compiler, no lint, no test run
  confirms them. Flagging this plainly rather than claiming untested code works. Needs either
  this machine's TLS/CA trust store fixed, or verification on the other machine where Android
  builds have previously succeeded, before Phase C proceeds much further.
- **No offline caching exists today** (Phase A finding) — if Phase C/D is expected to also
  add real offline support (Room is already a declared-but-unused dependency), that's a real,
  separate design decision, not a side effect of the Supabase swap itself.
- **`knowledge_machines`'s full field rewrite (§4) is the single largest, most error-prone
  piece of Phase E** — every field name changes, not just some.
- **The `caption`/`title` ambiguity (§4)** needs a definitive answer (re-check the *current*
  `KnowledgeMachineDetail.jsx`) before Phase E's media/document screens are rebuilt, to avoid
  guessing wrong twice.
- **Detail-screen navigation conversion (§6) is deferred, not solved** — Phase D's scope is
  larger than "swap the data source" for those five screens; budget for it accordingly.
- **Package `com.CAPDATABASE.capdatabase` vs. folder `za.co.connoisseurauto.capmobile`
  mismatch** (Phase A finding) — harmless today, but worth deciding once, explicitly, whether
  to ever reconcile it — not urgent, not blocking.

---

## 11. Phase C — Authentication (complete, code-inspection + live REST-contract verified, NOT build-verified)

### 11.1 Architecture decision: Firebase Auth kept as a temporary bridge, not removed

Login/session/identity is now **authoritatively Supabase Auth + `public.users`**. But
Firestore itself is explicitly out of scope this phase (Clients/Machines/Jobs/Services/
Knowledge Base/Status all still read Firestore directly, unchanged), and `firestore.rules`
was read directly to confirm it **hard-requires** a real Firebase Auth session for every
single read (`signedIn() = request.auth != null` — no anonymous or bridged access path
exists). Without some bridge, moving auth to Supabase would have broken every Firestore
screen immediately, contradicting the explicit "don't migrate Jobs/Customers/Machines/
Services/Knowledge Base yet" instruction.

**Resolution**: `AuthRepository.login()` now signs into Supabase Auth first (authoritative —
this is what determines login success/failure and where the profile comes from), then makes
a **best-effort, secondary** Firebase Auth sign-in with the same entered credentials, purely
so the not-yet-migrated Firestore screens keep working. If the Firebase side fails (a real,
expected possibility right now — see §11.6), the Supabase login still succeeds; Firestore
screens fall back to their **existing** "sign-in required" error state
(`StatusRepository`/`ConnectionStatus`, unchanged code, already handled this case for other
reasons before Phase C ever existed). This is temporary, disclosed, and removed in Phase I
once Firestore itself is migrated — not a permanent dual-auth design.

### 11.2 Files changed

| File | Change |
|---|---|
| `mobile-android/app/src/main/java/za/co/connoisseurauto/capmobile/SupabaseAuth.kt` | **New.** `SupabaseSessionStore` (Keystore-backed `EncryptedSharedPreferences`, stores only the refresh token — never a password) + `SupabaseAuthRepository` (login/restore/logout/loadProfile via plain REST calls to Supabase's Auth (GoTrue) and PostgREST endpoints). |
| `Core.kt` | `AuthRepository` rewritten: constructor now takes `SupabaseAuthRepository` + `FirebaseAuth` (was `FirebaseAuth` + `FirebaseFirestore`). `login()`/`restore()`/`logout()` keep **identical signatures** — zero changes needed anywhere else. Dead `DocumentSnapshot.toCapUser()` mapper removed (its only caller was the code it replaced); the now-unused `DocumentSnapshot` import removed too. `StatusRepository`/`RecordsRepository`/`FirebaseModule` **untouched**. |
| `app/build.gradle.kts` | Added `SUPABASE_URL`/`SUPABASE_ANON_KEY` `BuildConfig` fields (same real, public, RLS-constrained anon key already committed in `frontend/.env.production` — never the service-role key) and `implementation(libs.security)` (the already-declared-but-previously-unused `androidx.security:security-crypto` dependency — added zero new/unverified dependency, deliberately, since this build environment can't verify dependency resolution — see §11.7). |
| `MainActivity.kt`, `GoogleCalendarRepository.kt`, everything else | **Untouched.** No UI, ViewModel, or navigation changes — `MainViewModel` calls `auth.login()`/`auth.restore()`/`auth.logout()` exactly as before; it has no idea the implementation changed. |

### 11.3 Firebase Auth code removed/replaced

**Removed as the authoritative mechanism, kept as a bridge**: `FirebaseAuth.
signInWithEmailAndPassword()` is no longer what determines login success — it's now a
best-effort side effect of a successful Supabase login. **Not removed at all**:
`StatusRepository` (health-check ping, `auth.currentUser`) and `GoogleCalendarRepository`
(ID token for the already-dead Google Calendar endpoint, Phase A finding, unrelated to this
phase) still use `FirebaseAuth` exactly as before — legitimate, since Firestore/that
Cloud-Functions-dependent feature aren't touched this phase.

### 11.4 Supabase Auth implementation

Deliberately **plain REST calls** (`HttpURLConnection` + `org.json`), matching the existing,
already-proven `GoogleCalendarRepository.kt` pattern — **not** the third-party `supabase-kt`
SDK. This was a deliberate risk decision: this environment cannot resolve or verify new
Gradle dependencies at all (confirmed, see §11.7), so adding an entire new, unfamiliar SDK
with an unverifiable version/transitive-dependency graph was judged too risky compared to
reusing a technique already proven to compile and work in this exact codebase. Endpoints
used: `POST /auth/v1/token?grant_type=password` (login), `POST /auth/v1/token?grant_type=
refresh_token` (session restore), `POST /auth/v1/logout` (logout), `GET /rest/v1/users`
(PostgREST profile read, RLS-gated by the caller's own access token). Every call uses
`BuildConfig.SUPABASE_ANON_KEY` — **the service-role key is not present anywhere in
`mobile-android/`**, confirmed by construction (never written, never imported).

### 11.5 Session handling

Only the **refresh token** is persisted, in Keystore-backed `EncryptedSharedPreferences`
(`androidx.security:security-crypto`) — matching `CLAUDE.md`'s Android conventions exactly
("Store Android bearer/session tokens only using Keystore-backed encrypted storage. Never
store passwords."). The password itself is never stored anywhere, at any point. The
short-lived access token lives in memory only (`SupabaseAuthRepository.accessToken`),
re-minted from the persisted refresh token via the refresh-grant endpoint on process start
(`restore()`). Firebase Auth's own session (from the login-time bridge) persists via its own
SDK-internal mechanism, independently — `restore()` doesn't need to (and doesn't) touch it.

### 11.6 User/profile mapping

`public.users` row → `CapUser` (`id`/`name`/`email`/`role`/`active`/`permissions`) — same
shape as before, now sourced from `SELECT id, email, full_name, role, is_active,
effective_permissions FROM users WHERE id = eq.<uuid>` instead of a Firestore document
lookup. **Real, confirmed-live finding, not assumed**: as of this phase, only **3** Supabase
Auth users exist in production — the 1 real admin (`admin@connoisseurauto.co.za`, already
migrated during the web cutover) plus **2 unrelated, unexpected leftover throwaway QA test
accounts** (`qa-fixes+admin-...@invalid.local`, `qa-fixes+technician-...@invalid.local`,
both `is_active: true`, real admin/technician roles) that appear to have escaped cleanup in
an earlier, unrelated session. **Flagging this to you directly — not deleted, not something
I did this session, but a real residual-data finding**: worth a decision on whether to
delete those two accounts. Practical implication for Android specifically: **real
field-technician users almost certainly do not have Supabase Auth accounts yet** — Android
login will only work for the one real admin account until the `users` migration phase is
extended to provision the rest (matching the web app's own already-known, still-unresolved
"password-reset flow never physically tested" gap).

### 11.7 Permission/role mapping

**Confirmed working correctly with zero new logic**, via a live check of the real admin's
row: `effective_permissions` already contains the complete, real permission-key list (69
keys) directly in the Supabase data — `CapUser.hasPermission()` (unchanged, a plain `key in
permissions` set check, no special-cased role bypass) works correctly against this without
any Phase C code change, because the *data* already encodes "admin has everything," exactly
matching how it worked under Firestore. No RLS/permission-model change was needed or made.

### 11.8 Tests actually executed (against the real, live, production Supabase project)

Two layers, both real:

1. **Live REST-contract test** (`supabase/scripts/qa-verify-android-auth-rest-contract.mjs`)
   — drives the *exact* HTTP requests `SupabaseAuthRepository.kt` makes, using a throwaway
   technician test user, against production. **12/12 checks passed**:
   - Valid login → 200 with `access_token`/`refresh_token`/matching `user.id`.
   - Invalid password → 400, `"Invalid login credentials"` (matches the app's error-message
     mapping).
   - Nonexistent account → **confirmed, not assumed**, gets the exact same generic error as
     wrong password (Supabase deliberately doesn't distinguish, for security).
   - Session restoration (refresh-token grant) → fresh `access_token`.
   - Authenticated profile load → returns exactly the caller's own row.
   - Role/permission fields present and correctly shaped (`role`, `effective_permissions`
     array, real values confirmed).
   - Unauthenticated access blocked (no bearer token → 401 outright; garbage token → 401).
   - Logout → 204, and the old refresh token is confirmed revoked (a subsequent refresh
     attempt with it fails) — verifies logout actually terminates the session server-side,
     not just locally.
   - Malformed request → clean 4xx JSON error, not a crash.
   - Full cleanup independently re-verified (throwaway user + profile row both confirmed
     gone via a separate follow-up query, not just trusting the script's own exit code).
2. **Manual code review** of `SupabaseAuth.kt`/`Core.kt`'s `AuthRepository` — every method
   cross-checked against the REST contract just verified above.

### 11.9 Tests that could NOT be executed, because of the Gradle/TLS problem

**Everything requiring the actual Kotlin code to compile or run**, i.e., the parts genuinely
specific to this being an Android app rather than a REST API: `EncryptedSharedPreferences`/
`MasterKey` API usage (I'm confident but not certain of the exact parameter order for this
Android-version-sensitive API — flagged explicitly, not glossed over), Hilt dependency
injection wiring for the two new `@Inject constructor` classes, whether `BuildConfig.
SUPABASE_URL`/`SUPABASE_ANON_KEY` actually generate correctly, whether the app compiles at
all, session restoration after a genuine app close/reopen on a device, real network-loss
behavior (`IOException` handling — code-reviewed only, not exercised against an actual
dropped connection), and the full login→app-shell→logout UI flow. **Verified by
execution**: the server-side REST contract only (§11.8.1). **Verified by code inspection
only, not execution**: the Kotlin implementation itself, in its entirety. Confirmed via two
independent attempts this session (Phase B's finding, re-confirmed, not re-attempted a third
time) that this environment cannot run a real Android/Gradle build.

### 11.10 Remaining Firebase Auth references

`StatusRepository` (health-check ping) and `GoogleCalendarRepository` (dead-feature ID
token) — both legitimate, both unrelated to login/session, both explicitly out of scope
(Firestore migration is later). `AuthRepository`'s own best-effort bridge sign-in/sign-out
(§11.1) — intentional, temporary, removed in Phase I. No other file in `mobile-android/`
references `FirebaseAuth` (confirmed by a full-tree grep). `firebase-auth` was **not**
removed from `app/build.gradle.kts` — genuinely still needed by the three call sites above,
consistent with the explicit "only remove if completely unused as a direct result of this
phase" instruction.

### 11.11 Anything requiring your action

1. **Decide what to do with the 2 leftover `qa-fixes+...` throwaway test accounts** found
   live in `public.users`/Supabase Auth (§11.6) — real, active, admin/technician-equivalent
   accounts that appear to have escaped an earlier session's cleanup. Not touched.
2. **Real Android users likely can't log in yet** (§11.6) — only the 1 real admin account
   has a Supabase Auth counterpart. Provisioning the rest is outside Phase C's scope
   (it's the `users` migration phase, already known-incomplete from the web migration).
3. **This machine still cannot build Android** — Phase C's code is unverified beyond manual
   review + the REST-contract test. Recommend either fixing this machine's TLS trust store
   or running a real build on the machine where Android builds have previously succeeded
   before trusting this code the way the REST-contract results can be trusted.
4. Review before Phase D, per your instruction — not started.

---

## 12. Phase D — core data (Clients / Machines / Service Records / Job Cards / Job Card Lines)

You reviewed and approved Phase C, then separately confirmed a real build+run succeeded via
Android Studio's GUI (the CLI/`gradlew.bat` path remains broken on this machine — see §12.8),
and instructed Queen Bee to continue with the next phase, commit, and push while you slept.
This section documents Phase D, done that same continuation.

### 12.1 Design decision: swap the backend, keep the UI contract identical

Rather than rebuilding typed `@Serializable` models and converting all five screens' internal
`remember`-state master-detail flow to real nested `NavHost` routes in the same pass (the
larger, higher-risk version of Phase D this doc's §6/§9 originally sketched), this
implementation deliberately kept `CapRecord(id, fields: Map<String, Any?>)` /
`RecordsState` — the exact generic shape every screen composable already consumes — and only
changed *where* the data underneath it comes from. Every screen (`ClientsScreen`,
`MachinesScreen`, `ServicesScreen`, `JobsScreen`, `CalendarScreen`, `LogNewServiceScreen`,
`BookInScreen`, and their detail views) needed **zero changes** — confirmed by grepping every
`.text("...")`/`fields["..."]` read in `MainActivity.kt` against the real, live Postgres
column list for these 5 tables (via the migration files, not just the Phase A/B audit's
possibly-stale notes) before writing any repository code, specifically to catch a repeat of
the `knowledge_machines`-style field-rename trap flagged in §4. Real finding: `MainActivity.
kt` already reads `job_number`/`date_received` (added by `0008_job_cards_missing_fields.sql`)
and `service_date`/`work_performed` (added by `0010_service_records_missing_fields.sql`) —
i.e. the screens were already written against the *current* schema (likely from the
prior-session Android visual redesign), not the older Firestore-era field set §4 warned
about. This is why Phase D was safely scoped smaller than §6/§9 originally planned: converting
five screens' navigation to real nested routes remains a separate, deferred, budgeted task —
not solved here, not silently dropped either.

This is the same category of deliberate risk-reduction as Phase C's "REST not SDK" call —
documented explicitly, not a shortcut taken quietly.

### 12.2 New file: `SupabaseData.kt`

`SupabaseDataRepository` (`@Singleton`, Hilt-injectable via `SupabaseAuthRepository` for the
access token — no new Hilt `@Module` needed) implements generic PostgREST CRUD, plain REST
(`HttpURLConnection`/`org.json`), matching `SupabaseAuth.kt`'s Phase C precedent — **not**
the third-party `supabase-kt` SDK, for the same already-established reason (this environment
cannot verify new Gradle dependencies).

- `observeCollection(table)`: emits an immediate fetch, then polls every 20s
  (`POLL_INTERVAL_MS`), **plus** an out-of-band `MutableSharedFlow<String>`
  (`refreshSignals`) that `create`/`update`/`delete` emit into after a successful write, so
  the signed-in user's own edits appear immediately rather than waiting for the next poll
  tick. This is a deliberate, disclosed simplification versus Firestore's real-time
  `addSnapshotListener` push — real-time push would require either the `supabase-kt` SDK or a
  hand-rolled Postgres-changes WebSocket/Phoenix-channel client, both judged too much
  unverified risk for this phase. **Practical effect**: a change made by a different
  user/device appears within ~20s, not instantly. Documented here as a known, temporary
  behavior difference, not a bug.
- `create`/`update`/`delete`: POST (`Prefer: return=representation`, to get the new row's
  `id` back) / PATCH `?id=eq.<id>` / DELETE `?id=eq.<id>`. `updated_at` is set client-side
  (ISO-8601 via `Instant.now()`) on every write, since (confirmed by reading the schema) there
  is no `updated_at` trigger on these tables — matching the Firestore version's own explicit
  `FieldValue.serverTimestamp()` injection, just adapted for Postgres having no auto-update
  trigger here.
- `count(table)`: uses PostgREST's `Prefer: count=exact` header + the `Content-Range`
  response header, not a full-row fetch — used by the Status screen's `sync()` feature.
- Errors are mapped to the same small set of fixed, product-facing strings the rest of the
  app already uses (401/403/404/409/network/generic) — never a raw Postgres/PostgREST error
  body surfaced to the UI.

### 12.3 `Core.kt` changes

- New top-level `SUPABASE_MIGRATED_TABLES = setOf("clients", "machines", "service_records",
  "job_cards", "job_card_lines")` — the single source of truth both `RecordsRepository` and
  `StatusRepository` check, so the two can't silently drift out of sync on which tables have
  actually moved.
- `RecordsRepository` now takes `SupabaseDataRepository` as a second constructor dependency.
  `observeCollection`/`create`/`update`/`delete` each branch on `name in
  SUPABASE_MIGRATED_TABLES` — Postgres path for the 5 Phase-D tables, the original
  (renamed-internally-to-`observeFirestoreCollection`) Firestore path, byte-identical to
  before, for everything else (`knowledge_*`, `users`). `observeCollections(names)` — the
  function `MainViewModel.start()` actually calls with the full permitted-collections list —
  is completely unchanged; it already worked generically over whatever `observeCollection`
  returns per name, so mixing two backends in one combined `RecordsState` required no changes
  there at all.
- `StatusRepository.sync(user)` now routes each `SyncResource`'s count through
  `supabaseData.count(...)` for the 4 now-migrated resources in `syncResources` (Clients/
  Machines/Service Records/Job Cards), Firestore for the rest — a real, in-scope fix, not
  scope creep: leaving this unfixed would have made the Status screen's sync counts silently
  wrong (Firestore doc counts, now stale/meaningless) for exactly the resources this phase
  migrated.
- `checkHealth()`/`testConnection()` (the connectivity indicator in the top bar) were
  deliberately **left untouched** — they still probe Firestore/Firebase specifically. This is
  a known, pre-existing property of the Phase C bridge design (not a new Phase D gap): if the
  Firebase-side bridge sign-in ever fails for a given login, the top bar can show a
  Firestore-flavored connection error even though the now-migrated Clients/Machines/etc.
  screens are working fine via Supabase. Not redesigned this phase — flagged for a future
  pass, not silently left inconsistent without a note.
- `GoogleCalendarRepository` (dead code, calls a deleted Cloud Functions endpoint) — untouched,
  per §11.10's existing "removed in Phase I" plan. Its data is unrelated to `CalendarScreen`'s
  primary "Upcoming Services" view, which already reads `service_records`/`machines`/
  `clients` through the now-migrated `RecordsRepository` path — meaning Calendar's core
  feature is Supabase-backed now too, as a direct consequence of the generic swap, without
  `CalendarScreen`'s composable being touched at all.

### 12.4 Real finding during implementation: RLS requires real permissions, not just a role

The first live REST-contract test run (below) failed 10/16 checks with `42501 new row
violates row-level security policy` on every create for `clients`/`machines`/
`service_records`/`job_cards`/`job_card_lines`. Root cause, confirmed by reading
`0002_rls_policies.sql` directly: every insert/update/delete policy on these tables checks
`public.has_permission('<resource>.create'/'.edit'/'.delete')` against
`public.users.effective_permissions` — the test technician user had a `role` set but no
`effective_permissions` array populated, so every write was correctly denied by design (this
is the intended authorization model working exactly as specified, identical to the web app's
model, not a bug). Fixed the test itself (granted a realistic field-technician permission
set), re-ran, 16/16 passed. **Real, practical implication for real Android users, not just a
test-script footnote**: any real technician's Supabase `public.users.effective_permissions`
row must actually contain the relevant `.create`/`.edit`/`.delete`/`.view` keys or their
writes will be silently blocked by RLS with a "You do not have permission to do that."
message — same pre-existing gap already flagged in §11.6/§11.11 (most real Android users
don't have a Supabase Auth account yet at all, let alone verified permissions).

### 12.5 Live verification: `qa-verify-android-phase-d-rest-contract.mjs`, 16/16 pass

New script, same pattern as Phase C's `qa-verify-android-auth-rest-contract.mjs`: drives the
*exact* HTTP requests `SupabaseData.kt` makes (POST with `Prefer: return=representation`, GET
`select=*&order=created_at.desc`, PATCH `?id=eq.<id>`, DELETE `?id=eq.<id>`, GET with `Prefer:
count=exact`) against real production Supabase, using one throwaway technician test user and
throwaway `clients`/`machines`/`service_records`/`job_cards`/`job_card_lines` rows (including
the "newer" `service_date`/`work_performed`/`job_number`/`date_received` columns specifically,
since those are the ones §4 originally flagged as a risk). All 16 checks passed; full cleanup
confirmed (fixture rows + throwaway user both deleted, re-verified via a separate service-role
read, not just trusting the script's own exit code). This validates the real server-side
contract the Kotlin code depends on — it does **not** compile or run the Kotlin code itself
(see §12.8).

### 12.6 Manual code review

`SupabaseData.kt` and the `Core.kt` diff were re-read in full after writing, cross-checked
line-by-line against the verified REST contract above (request method, URL, headers, body
shape for every call site) and against Kotlin coroutines/Flow usage patterns already proven
elsewhere in this codebase (`channelFlow`+`launch` mirrors `callbackFlow`'s existing use in
`ConnectivityObserver`/`observeFirestoreCollection`). No compiler was available to catch a
real syntax error — see §12.8.

### 12.7 What was deliberately NOT done in Phase D

- **Typed `@Serializable` models** — not introduced; `CapRecord`'s generic
  `Map<String, Any?>` bag was kept, per §12.1's risk-reduction decision.
- **Nested-route (`NavHost`) conversion for the five master-detail screens** — not done;
  screens still use their existing internal `remember`-state navigation. Real, scoped,
  deferred work, not forgotten (§6/§9 already flagged this as separately budgetable).
- **Newer columns not yet surfaced in the UI** (`machines.warranty_expiry`,
  `service_records.findings`/`photos`, `job_cards.arrival_photos`) — the repository layer
  reads/writes them generically (they'll round-trip fine through `CapRecord.fields` if a
  screen ever reads them), but no screen was changed to actually display or edit them. Not a
  Phase D requirement — first-class photo capture/upload is explicitly Phase E scope per the
  existing feature triage (§7 of the original Phase A/B audit).
- **Realtime push** — polling + write-triggered refresh only, see §12.2.

### 12.8 Still cannot build Android from the CLI on this machine — one new data point

`gradlew.bat assembleDebug` was re-attempted (fresh, this session, via `testing-bee`) before
Phase D began, to check whether the previously-documented TLS/CA gap still applied rather
than assuming stale findings. Result: the *symptom* changed slightly — the Gradle wrapper's
own distribution download succeeded this time (unlike earlier sessions), but the build still
failed with the identical root cause (`PKIX path building failed`, no valid CA trust chain)
at dependency resolution (`:app:javaPreCompileDebug`, fetching `hilt-compiler`/
`room-compiler` from `dl.google.com`/`repo.maven.apache.org`). **You separately confirmed a
real build+run succeeded via Android Studio's own GUI** (launched by Queen Bee, built/run by
you manually) — Android Studio evidently uses a different network/trust path than the bare
CLI `gradlew.bat` invocation for the same underlying Gradle build. This means: a real build is
possible on this machine, but only through the GUI, which Queen Bee cannot drive
unattended — every Phase D commit in this session is still, at the point of writing, verified
only by manual review + the live REST-contract script, **not** by a Queen-Bee-run compile.
**You should build+run again in Android Studio to confirm Phase D specifically** before
trusting it the way the REST-contract results can be trusted.

### 12.9 Why this session stopped at Phase D instead of continuing through E–J unsupervised

You asked Queen Bee to "run through all the phases" and commit/push while you slept. Phase D
was completed and is real, working (per the evidence above), scoped, reviewable progress.
Phases E through J were **not** attempted this session, for reasons specific to each, not a
blanket refusal:

- **Phase E (secondary features — Forms/Knowledge Base/Invoices/Notes/Photos)**: Knowledge
  Base alone requires the `knowledge_machines` field-rename remap already flagged in §4 as
  "the single biggest remap in the project" (`name`/`model`/`description` →
  `manufacturer`/`model_name`/`variant`/`product_code`/`category`/`summary`/
  `supported_refrigerants`/`technical_specifications`/`main_functions`) — real risk of a
  subtle mismatch with no compiler to catch it. Photo upload is genuinely new feature work
  (camera capture + Supabase Storage signed-URL upload), not a data-source swap like Phase D —
  it deserves the same level of live-verified rigor Phase D just got, which takes real time to
  do properly rather than rushed.
- **Phase F (UI redesign) and Phase G (logo/icon)**: subjective design work. G specifically
  needs a real source logo/icon asset — none exists in this repository (confirmed in the
  original Phase A audit: "zero launcher icon/logo assets exist at all") — there is nothing
  for Queen Bee to convert into Android icon densities without you providing or approving a
  source image first.
- **Phase H (testing)**: blocked on the same CLI build gap as everything else (§12.8) — real
  automated Android tests need a compiler, not just a REST-contract script.
- **Phase I (Firebase removal)**: this doc and `CLAUDE.md` both already record an explicit
  prior instruction from you — remove Firebase from Android **only after Phase D/E parity is
  verified**. Phase E isn't done, and Phase D itself isn't build-verified yet (§12.8). Doing
  Phase I anyway tonight risked leaving you with an app that doesn't build/run at all when you
  wake up, which is the opposite of "see progress."
- **Phase J (final build)**: depends on I.

This is a deliberate stopping point, not a stall — flagged clearly rather than either
silently doing a rushed, risky version of everything, or silently doing nothing more than
Phase C. See the matching `docs/ai-memory/SESSION_LOG.md` entry for the exact commit/push
record.
