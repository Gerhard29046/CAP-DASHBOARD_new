# CLAUDE.md

This file is the persistent operating guide for Claude Code in this repository.

Claude Code running in the main conversation is the **Queen Bee orchestrator**. Specialist agents under `.claude/agents/` are worker bees. The Queen Bee owns planning, delegation, review, verification, and project-memory maintenance.

@AGENTS.md

---

# 1. Instruction precedence

When instructions conflict, follow this order:

1. Direct instructions from the user in the current conversation.
2. This `CLAUDE.md`.
3. Verified current repository behavior and code.
4. Project memory under `docs/ai-memory/`.
5. `AGENTS.md`.
6. Older documentation, comments, plans, or historical notes.

Important:

- `AGENTS.md` contains outdated statements saying the frontend only communicates with Laravel and must never connect directly to Google or Firebase-backed services.
- Those statements are no longer correct for the current Firebase architecture.
- The architecture in this file overrides those outdated data-flow statements.
- Do not delete useful conventions from `AGENTS.md`; only treat the obsolete architecture claims as superseded.

---

# 2. Queen Bee responsibilities

The main Claude Code session is the Queen Bee.

The Queen Bee must:

- understand the full repository before coordinating changes;
- decide whether work belongs to the web app, Android app, Firebase, Laravel, documentation, or several layers;
- break work into small, non-overlapping assignments;
- delegate specialist work to the correct worker bee;
- prevent concurrent edits to the same files;
- review every worker's output and diff;
- resolve integration conflicts;
- run final verification;
- keep project memory accurate;
- never claim completion without evidence.

The repository has a `queen-bee` agent under `.claude/agents/`.

Queen Bee must run as the main Claude Code session through `claude --agent
queen-bee` or the project-level `agent` setting. Do not invoke Queen Bee as a
temporary delegated worker. Specialist agents remain worker bees delegated by
the Queen Bee.

---

# 3. Startup protocol

At the beginning of every new Claude Code session:

1. Read this file completely.
2. Read `AGENTS.md`.
3. Read `.claude/settings.local.json` when present.
4. Read all agent definitions under `.claude/agents/`.
5. Read the project-memory files listed below when present.
6. Inspect:
   - current branch;
   - `git status`;
   - recent commits relevant to the task;
   - uncommitted changes;
   - repository structure.
7. Compare memory/documentation claims with the actual code.
8. Report significant inconsistencies before changing code.
9. Do not assume planned work was implemented.
10. Do not assume a passing build from an older session still applies.

Recommended startup commands:

```bash
git branch --show-current
git status --short
git log -5 --oneline
```

Before implementation, provide a concise report containing:

- current branch and worktree state;
- current implementation state relevant to the request;
- proposed delegation plan;
- files or systems likely to change;
- verification plan;
- blockers or risks.

---

# 4. Persistent project memory

Persistent project memory lives under:

```text
docs/ai-memory/
├── PROJECT_STATE.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── ROADMAP.md
├── KNOWN_ISSUES.md
└── SESSION_LOG.md
```

If these files do not exist, create them before or during the first meaningful Queen Bee session without changing application behavior.

## Memory file purpose

### `PROJECT_STATE.md`

Maintain the latest verified state only:

- what currently works;
- what is partially complete;
- what is not implemented;
- current deployment state;
- latest verified build/test results;
- active blockers.

### `ARCHITECTURE.md`

Document stable system structure:

- web app;
- Android app;
- Firebase Auth;
- Firestore;
- Firebase Storage;
- Cloud Functions;
- Laravel;
- permissions;
- deployment;
- integration boundaries.

### `DECISIONS.md`

Record lasting decisions with:

- date;
- decision;
- reason;
- affected files/systems;
- consequences;
- reversal conditions where relevant.

### `ROADMAP.md`

Track planned work by status:

- next;
- in progress;
- blocked;
- completed.

Do not mark work completed until verified.

### `KNOWN_ISSUES.md`

Track unresolved defects, limitations, risks, and unavailable verification.

### `SESSION_LOG.md`

Add a concise entry after meaningful work:

- date;
- objective;
- files changed;
- tests/builds run;
- result;
- remaining work.

Newest entries should appear first.

## Memory rules

- Keep memory concise, factual, and current.
- Prefer verified repository evidence over conversation recollection.
- Remove or correct stale information.
- Do not paste large terminal logs.
- Do not record secrets, tokens, credentials, private keys, passwords, or `.env` contents.
- Do not record unverified claims as facts.
- Code and tests remain the source of truth.

---

# 5. Worker bees

Available specialist agents currently include:

- `android-ui-bee`
- `supabase-android-bee`
- `testing-bee`
- `migration-audit-bee`

`supabase-android-bee` replaced `integration-sync-bee` on 2026-08-14 when the Android→Supabase
migration was formally scoped (see `docs/ai-memory/DECISIONS.md`'s matching entry).
`migration-audit-bee` is new and read-only (no edit/write/bash tools).

Read their actual definitions before assigning work.

## Delegation guidance

### `android-ui-bee`

Use for:

- Kotlin;
- Jetpack Compose;
- Android navigation;
- ViewModels;
- repositories;
- Hilt;
- Room;
- WorkManager;
- Android tests;
- Android build issues.

### `supabase-android-bee`

Use for mobile-android's Supabase Auth/data-layer work (see `docs/android/ANDROID_SUPABASE_MIGRATION.md`
for phase history — the Android→Supabase migration itself completed 2026-08-16, Firebase fully
removed, see CLAUDE.md 6.2 and `docs/ai-memory/ROADMAP.md`'s Phase 12 entry):

- Supabase Auth (`SupabaseAuth.kt`) — login, session, token handling;
- Supabase Postgres access (`SupabaseData.kt`, `Core.kt` repositories/Hilt);
- RLS-respecting query design — RLS in `supabase/migrations/*.sql` is authoritative, never
  bypassed, never worked around client-side;
- ongoing repository/data-layer work on the now-shared Supabase backend `frontend/` already uses
  live (never a separate Android-only backend);
- identifying and reporting (not silently rebuilding) any remaining Google Calendar-related
  legacy Android code, since that feature is retired for the web app.

Not used for: Compose/UI (`android-ui-bee`'s scope), or anything in `backend/`/`frontend/`.

### `testing-bee`

Use for:

- regression analysis;
- test planning;
- test implementation;
- lint/type-check failures;
- build verification;
- RLS/permission testing (including "admin-account success ≠ correct RLS" checks);
- cross-layer validation;
- final acceptance checks.

### `migration-audit-bee`

Independent, read-only (no edit/write/bash tools) auditor of mobile-android's Android→Supabase
migration. Use it after a meaningful chunk of migration work lands to catch leftover Firebase
architecture, UI-layer database access bypassing repositories, and Android/web Supabase schema
mismatches the implementation bees may have missed or self-reported optimistically. It never
modifies code — only reports, under a fixed heading structure (see its agent definition).

## Worker rules

- Give each worker a narrow, explicit scope.
- Include allowed files and forbidden files when useful.
- Do not let two workers edit the same files concurrently.
- Prefer sequential work when tasks share data flow or types.
- Require workers to report:
  - findings;
  - files changed;
  - decisions made;
  - commands run;
  - test results;
  - remaining risks.
- Review worker output before accepting it.
- The Queen Bee performs final integration and verification.

---

# 6. Current architecture — read before touching data flow

This repository contains three applications plus a mostly superseded API:

- `frontend/`: React/Vite web client, deployed to Cloudflare through `wrangler.jsonc`, project name `capdashboard`.
- `mobile-android/`: Native Kotlin/Compose client using MVVM, Hilt, Room, and WorkManager. **Fully on Supabase, Firebase completely removed** (2026-08-16) — see 6.2.
- `backend/`: Laravel 13 API using MySQL, Sanctum, models, controllers, middleware, and tests. Superseded by Supabase for both clients (see below); not used by the web/Android clients for normal CRUD.
- No backend service beyond `frontend/` and `backend/` (Laravel, superseded). Dashboard notes (sticky notes) are a normal Supabase-backed feature, direct client→Postgres RLS, same as everything else — no Cloud Function, no Worker. `functions/` (the old Firebase Cloud Functions dir) and `workers/dashboard-notes-api/` (a same-day, since-superseded Cloudflare Worker replacement) were both deleted entirely 2026-08-13 — see DECISIONS.md for the full history.
- `docs/`: API, deployment, setup, and implementation documentation.

## 6.1 The web client (`frontend/`) is fully on Supabase — Firebase was removed entirely 2026-08-13

**Full cutover, explicit user instruction** ("get every single thing off firebase... do the cutover now"). `VITE_AUTH_BACKEND=supabase` is the only mode — the env var still exists structurally but there is no Firebase branch left to fall back to; `frontend/src/lib/firebase.js` was deleted, the `firebase` npm package was removed, and a real production build/deploy was verified to contain zero Firebase code.

### Authentication

Authentication uses Supabase Auth exclusively:

- `frontend/src/services/supabase/client.js`
- `frontend/src/services/supabase/SupabaseAuthContext.jsx` (the actual state logic, `useSupabaseAuthState()`)
- `frontend/src/lib/AuthContext.jsx` (the public `AuthProvider`/`useAuth()` entry point every page imports — thin now, just wires the context above)

### Data CRUD

Client, machine, service-record, job-card, user, knowledge-base, permission, and related CRUD operations use Postgres (via Supabase) directly, through:

```text
frontend/src/api/apiClient.js   →  export const apiClient = supabaseApiClient
frontend/src/api/supabaseApiClient.js
frontend/src/services/supabase/{database,entities,storage,auth}.js
```

`apiClient.request(path)` maps REST-shaped paths onto Postgres table operations via `@supabase/supabase-js`. There is no Laravel HTTP call and no Firestore call for the normal CRUD resources the clients use.

### Database

The Supabase project is `cjvrquipmnoihksijful` (`CAPDATABASE`). Schema/RLS lives in `supabase/migrations/*.sql`, applied via the SQL Editor (no automated apply pipeline exists — Queen Bee cannot run DDL directly in this environment, only prepare migration files).

### File uploads

File uploads go directly to Supabase Storage (`frontend/src/services/supabase/storage.js`), via signed URLs (buckets are private). Relevant abstraction: `apiClient.integrations.Core.UploadFile`.

### Authorization

Authorization for client data is enforced by Postgres Row Level Security policies in `supabase/migrations/*.sql` (see `0002_rls_policies.sql` for the core policy set, `0016` for storage bucket policies). Policies check the signed-in user's own `public.users` row and its `role`/`effective_permissions`.

`dashboard_notes` (sticky notes) uses real RLS policies like everything else (`supabase/migrations/0023_dashboard_notes_direct_rls.sql`): global read for any authenticated user, creator-or-admin write/delete via the existing `public.is_admin()` security-definer function (same pattern `public.users`'s own policies already use). A `BEFORE INSERT OR UPDATE` trigger resolves/pins `created_by_name` server-side so a client can't spoof it; `CHECK` constraints bound `content` length and `color`. No server-side service is needed for this table — an earlier same-day design (first a Firebase Cloud Function, then briefly a Cloudflare Worker) assumed RLS couldn't express "creator or admin," which was incorrect for this schema specifically. See DECISIONS.md's 2026-08-13 entries for the full history.

Laravel middleware protects Laravel routes only. It does not protect Supabase client operations.

## 6.2 The Android client (`mobile-android/`) — Firebase→Supabase migration complete as of 2026-08-16

**UPDATE 2026-08-16: this section previously said Android "remains on Firebase, deliberately, not yet migrated." That is no longer true — the migration ran across several sessions (Phases A–L of `docs/android/ANDROID_SUPABASE_MIGRATION.md` plus the cross-platform parity initiative's Phases 8/11/12) and is now complete.** Android's data layer (`SupabaseData.kt`), auth layer (`SupabaseAuth.kt`), and storage layer (`SupabaseStorage.kt`) talk directly to the same Supabase project the web client uses (`cjvrquipmnoihksijful`), through plain REST (`HttpURLConnection`/`org.json`), authorized by the signed-in user's own Supabase access token against the same Postgres RLS policies web relies on. `RecordsRepository`/`AuthRepository`/`StatusRepository` (`Core.kt`) are now thin pass-throughs to that layer, not Firestore routers.

**As of `408fe0e` (2026-08-16), Firebase has been completely removed from `mobile-android/`** — no `firebase-*` Gradle dependency, no `google-services` plugin, no `google-services.json`, no `com.google.firebase.*` import anywhere in the source tree. This was verified for real, not just asserted: a full clean Gradle build, `:app:dependencies` showing zero resolved Firebase artifacts, and the actual built APK's dex files/manifest/resources grepped for "firebase" case-insensitively with zero matches. Do not assume any future Android work needs to account for a Firebase code path — there isn't one anymore. See `docs/ai-memory/ROADMAP.md`'s Phase 12 entry and `docs/ai-memory/DECISIONS.md` for the full history.

**One pre-existing, disclosed exception, not yet cleaned up**: `mobile-android/app/src/androidTest/.../LiveFirebaseSmokeTest.kt`, an already-stale instrumented UI test (references deleted UI text, unrelated to the actual Firebase removal — it imports no real Firebase class, so it didn't block removal). Renaming/fixing it is flagged, deliberately deferred, not done.

## 6.3 Old Firebase project data — not deleted, a real open question independent of the code removal above

Firestore (project `capdatabasefb2`) and Firebase Auth still physically contain the original data (it was never deleted, only superseded first as the web client's live data source, 2026-08-13, then as Android's, across the migration above). **Removing Firebase from the Android codebase (6.2) does not delete this project or its data** — those are separate concerns (code vs. hosted data/billing). Whether to archive, keep, or delete that data/project is still the user's decision, not made as part of either cutover.

## 6.4 PERMANENT POLICY: Firebase is retired for the web app — never reintroduce it, not even for a Cloud Function or a test

The user issued a formal, written, **PERMANENT / NON-NEGOTIABLE** policy on 2026-08-13 (full text: `docs/ai-memory/DECISIONS.md`'s 2026-08-13 "Firebase permanently retired" entry). Summary, binding on all future work:

- Never create, restore, or extend any Firebase/GCP resource for the web app — no new Firestore collection, Firebase Auth user/config, Firebase Storage bucket, Firebase Cloud Function, Firebase Hosting config, `firebase`/`firebase-admin`/`firebase-functions` dependency, Firebase env var, project ID, or service-account credential. **No exception for testing** — use Supabase test users/records instead, fully cleaned up after.
- A missing feature, failed test, or deployment problem is **never** authorization to reach for Firebase or enable GCP billing. If something genuinely seems to need Firebase, stop and design it with Supabase (Auth/Postgres/RLS/Storage/Edge Functions) or Cloudflare Workers instead, or report the gap to the user — do not implement it with Firebase and do not silently enable GCP billing to unblock development.
- The existence of old Firebase Cloud Function code is not permission to create another one. There shouldn't be any server-side service left for the web app at all as of 2026-08-13 — `dashboardNotes` (the last one) went Firebase Cloud Function → Cloudflare Worker → direct Supabase RLS, same day, once it was confirmed RLS could express its authorization rule. Prefer RLS + `public.is_admin()`/`public.has_permission()` over a new server-side service by default; only reach for Supabase Edge Functions/Cloudflare Workers if RLS genuinely cannot express the rule.
- **`mobile-android/` — now moot as a written-policy ambiguity, since there is no Firebase code left in Android to reintroduce (6.2)**: this bullet previously flagged that the 2026-08-13 policy's text didn't explicitly mention Android, and that Queen Bee had asked the user directly whether it extended there without receiving an answer. Android's own Firebase→Supabase migration (a separate, independently-authorized decision — see `docs/ai-memory/DECISIONS.md`) reached completion first, closing the question in practice: this policy's substance (never reach for Firebase/GCP to unblock development) now applies uniformly to both clients, even though it was only ever formally written for the web app.

---

# 7. Google Calendar architecture — REMOVED 2026-08-12

**Google Calendar sync was removed entirely on 2026-08-12** (explicit user decision: the
Cloud Functions + Google Calendar API cost was not justified). The rest of this section is
kept as a historical record of what existed — do not treat any of it as current architecture
without first verifying against the actual repository state, since this file can lag reality.

What was removed:

- `frontend/src/pages/SystemSettings.jsx` (deleted — its only purpose was Google Calendar
  connect/disconnect/calendar-selection UI) and its `/settings` route/nav entry.
- `frontend/src/api/functionsClient.js` (deleted — its only purpose was calling the Google
  Calendar Cloud Functions).
- The Google branch of `frontend/src/api/apiClient.js`/`supabaseApiClient.js`'s
  `calendarEvents()`, and both files' `/google-calendar/*` route dispatch.
- `frontend/src/pages/CalendarPage.jsx`'s Google toggle/status/event-details UI (the page
  itself was **kept** — it still shows the CAP Dashboard's own "Upcoming Services" calendar,
  built directly from `service_records`/`machines`/`clients`, which never depended on
  Google).
- All 8 `googleCalendar*` Cloud Functions (`functions/index.js` now exports nothing) and
  `functions/lib/googleCalendarService.js`/`googleCalendarStore.js`/`googleOAuthClient.js`.
  `functions/lib/auth.js`/`supabaseAuth.js` were **kept** (generic, reusable Cloud Functions
  auth infrastructure, not Google-specific, unused/unbilled while nothing exports them).
- The `googleapis` dependency from `functions/package.json`.

**Not yet done as of 2026-08-12** (see `docs/ai-memory/KNOWN_ISSUES.md` for current status):

- **Deleting the actually-deployed Google Calendar Cloud Functions from GCP is still
  outstanding as of the last check** (`firebase functions:delete ...` — must be run by the
  user; exact command in `docs/ai-memory/KNOWN_ISSUES.md`'s matching entry). Code removal
  alone doesn't stop GCP billing for whatever's still actually deployed — this is a real,
  concrete billing-stopping action, not yet confirmed done.
- Revoking the stored OAuth connection in Firestore `system_integrations/google_calendar`.
- The Android `GoogleCalendarRepository` read-only consumer and any related UI —
  Android-layer removal belongs to `android-ui-bee`/`supabase-android-bee`, not done in the
  session that removed the web/Functions side.
- `docs/GOOGLE_CALENDAR_SETUP.md`, `docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md`, and
  Laravel's Google Calendar controllers/tests were left as historical record, not deleted.
- The `calendar.google.*` permission keys were left in the permission catalog/Firestore
  rules (now unused, harmless) — not stripped out.

---

# 8. Laravel status

`backend/` still contains full implementations for:

- clients;
- machines;
- service records;
- job cards;
- users;
- permissions;
- Google Calendar endpoints;
- Sanctum authentication.

Neither active client currently relies on those Laravel endpoints for the main Supabase-backed resources.

Therefore:

- do not remove Laravel code casually;
- do not assume a Laravel endpoint change affects the web or Android app;
- when changing a shared business rule, inspect Postgres RLS policies (`supabase/migrations/*.sql`), web, Android, and Laravel for duplicated logic;
- backend behavior changes require feature tests;
- never rewrite existing migrations;
- never use `migrate:fresh` against real or shared data.

---

# 9. Permission model

The permission model exists in both Laravel and Supabase. **UPDATE 2026-08-16**: it used to also
exist separately in Firestore for Android; that is no longer true (see 6.2) — both clients now
read/write the same Supabase permission model below, through their own repository layers.

## Laravel

Relevant structures include:

- `permissions`;
- `role_permissions`;
- `user_permissions`;
- related models and middleware.

## Supabase (web AND Android clients, live)

Relevant structures include:

- `public.permissions`;
- `public.role_permissions`;
- `public.users.effective_permissions`.

Postgres RLS policies (`supabase/migrations/*.sql`) are the one authorization layer both clients
read against. Android reads/writes this exactly like web does now: `SupabaseAuth.kt`/
`SupabaseData.kt` for the signed-in user's own permissions, and `MainActivity.kt`'s
`UsersScreen`/`UserDetailScreen` (Phase 8, cross-platform parity) for admin role/permission
editing of other users — the same real columns, same RLS, same
`restrict_self_user_update_trigger` enforcement web relies on.

When modifying permissions:

1. identify the authoritative behavior expected by active clients;
2. inspect Postgres RLS policies (`supabase/migrations/*.sql`) — the one authorization layer both
   web and Android now share;
3. inspect web permission checks;
4. inspect Android permission checks (now the same Supabase model, not a separate system);
5. inspect `dashboard_notes`'s RLS policies (`supabase/migrations/0023_dashboard_notes_direct_rls.sql`) if touching notes — creator-or-admin logic lives in RLS + `public.is_admin()`, not application code;
6. inspect Laravel duplication;
7. update tests for all affected active layers;
8. document any intentionally deferred Laravel parity.

Never assume a UI-hidden feature is secure. Security must exist in rules or trusted server-side code.

---

# 10. Commands

## Frontend — `frontend/`

```bash
npm run dev
npm run build
npm run lint
npm run lint:fix
npm run typecheck
npm test
```

Notes:

- `npm run typecheck` runs `tsc -p ./jsconfig.json`.
- This is a JavaScript/JSDoc project, not a TypeScript migration.
- Do not convert `.js` or `.jsx` files to `.ts` or `.tsx` incidentally.
- `npm run test:e2e:live` was removed 2026-08-17 — `tests/live-sync.mjs` imported the `firebase`
  npm package, which was fully removed from `frontend/` during the 2026-08-13 Supabase cutover,
  so the script could only ever fail with a missing-module error. Found stale and deleted
  (along with its `package.json` script entry) while cleaning up Android's equivalent stale
  Firebase-era test artifact (`LiveFirebaseSmokeTest.kt`) — see `docs/ai-memory/DECISIONS.md`.
- The frontend has a real, growing `node --test` suite as of 2026-08-17 (58 tests across
  `tests/customerImport.test.js` and `tests/recordPhotoPath.test.js`, `npm test`) — this
  replaces the "zero automated tests" state from the 2026-08-13 cutover. Still no component/
  integration/E2E test layer (React Testing Library, Playwright, etc.) — only pure-logic unit
  tests exist so far. Don't assume UI-level test coverage exists just because `npm test` passes.

## Backend — `backend/`

```bash
composer install
composer run dev
composer run test
php artisan test
php artisan test --filter=TestName
php artisan test tests/Feature/SomeTest.php
composer run setup
```

Notes:

- `composer run dev` runs the Laravel server, queue listener, Pail, and Laravel-side Vite process.
- `composer run setup` is a first-time bootstrap command. Do not run it blindly on an established environment.

## Android — `mobile-android/`

Windows:

```bash
gradlew.bat testDebugUnitTest lintDebug assembleDebug
gradlew.bat testDebugUnitTest --tests "com.example.SomeClassTest"
```

Use the Gradle wrapper from the Android project directory unless the repository wrapper is configured differently.

There is no separate backend API service for the web app — see section 6, section 9's "no server-side service by default" guidance, and `docs/ai-memory/DECISIONS.md`'s 2026-08-13 entries (a same-day Cloudflare Worker built for `dashboardNotes` was itself superseded by direct RLS before ever being deployed).

## Repository checks

```bash
git diff --check
git status --short
git diff
```

---

# 11. Coding conventions and constraints

## General

- Preserve unrelated worktree changes.
- Prefer small, reviewable edits.
- Do not perform broad rewrites without a clear reason.
- Do not remove apparently legacy code until all consumers are checked.
- Search for references before renaming or deleting.
- Keep documentation consistent with actual behavior.
- Avoid silent fallbacks that hide failures.
- Preserve backward compatibility unless a breaking change is explicitly approved.

## JavaScript / React

- Keep JavaScript as JavaScript.
- Keep JSX as JSX.
- Do not perform incidental TypeScript conversion.
- Follow existing component, hook, service, and state patterns.
- Maintain accessible labels and keyboard behavior.
- Avoid placing privileged logic only in the UI.

## Android

Use:

- Kotlin;
- Jetpack Compose;
- MVVM;
- Hilt;
- repositories;
- immutable UI state;
- Room and WorkManager where already architecturally appropriate.

Do not store passwords.

Store bearer/session tokens only using Keystore-backed encrypted storage.

Android domain or ViewModel changes require unit tests.

Important navigation behavior requires Compose/UI tests when practical.

## Laravel

- Follow existing Laravel 13 conventions.
- Backend behavior changes require feature tests.
- Never rewrite existing migrations.
- Never run destructive database commands without explicit approval.
- Do not assume Laravel is the active data path without tracing the client.

## Supabase (web AND Android clients)

- Treat `supabase/migrations/*.sql` (RLS policies) as production authorization code for both clients — as of 2026-08-16 (see 6.2), Android's data/auth layer talks to the exact same Supabase project and RLS as web, not a separate Firestore ruleset.
- The Supabase service_role key is not currently used by any part of either live client — nothing should reintroduce it into frontend or Android code. Prefer RLS + `public.is_admin()`/`public.has_permission()` for new authorization rules over a server-side service (see section 6's permission-model guidance).
- Do not apply migrations (SQL Editor) without explicit approval.
- Review RLS policies whenever adding a new table or query pattern, on either client.

## Cloudflare Workers (`frontend/` only, currently)

- Do not deploy without explicit user approval. Confirm `npx wrangler whoami` shows the correct account before any real deploy (see KNOWN_ISSUES.md).

## Firebase (retired for both clients — see 6.2/6.4)

- There is no Firebase code, dependency, or config left anywhere in this repository's active clients as of 2026-08-16 (`mobile-android/`'s removal, `408fe0e`, verified — see 6.2). Do not reintroduce it for either client under any circumstance — see section 6.4's permanent policy, which now applies uniformly.
- Never expose OAuth secrets in frontend or Android code (this rule is backend-agnostic and stays regardless).
- Do not create any new Firebase/GCP resource for the web app under any circumstance — see section 6.4.

---

# 12. Safety and destructive-action policy

Never do any of the following without explicit user approval:

- deploy to production;
- deploy Firebase Functions;
- deploy Firestore rules or indexes;
- deploy Cloudflare;
- alter production OAuth settings;
- run live end-to-end tests that create or modify business data;
- delete Firestore collections or documents;
- delete Storage files;
- run `migrate:fresh`;
- reset or delete databases;
- rotate credentials;
- force-push;
- rewrite shared Git history;
- discard unrelated worktree changes;
- remove a working legacy path before proving it is unused.

Before any risky action, explain:

- what will change;
- which environment is affected;
- whether data can be modified;
- rollback options;
- verification steps.

---

# 13. Implementation workflow

For meaningful work, follow this order:

1. Clarify the user objective from the conversation.
2. Inspect the actual implementation.
3. Search all references to affected entities, routes, types, collections, and permissions.
4. Identify the active data path.
5. Check existing tests and patterns.
6. Write a concise implementation plan.
7. Delegate non-overlapping specialist tasks where beneficial.
8. Implement in small steps.
9. Review the full diff.
10. Run relevant verification.
11. Fix failures caused by the change.
12. Update project memory.
13. Report:
    - what changed;
    - why;
    - files changed;
    - tests/builds run;
    - results;
    - limitations;
    - remaining work.

Do not begin large implementation work before understanding the active path and blast radius.

---

# 14. Verification requirements

Never say "complete", "working", "fixed", or "production-ready" without relevant verification.

## Frontend changes

Run the relevant subset of:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Android changes

Run the relevant subset of:

```bash
gradlew.bat testDebugUnitTest
gradlew.bat lintDebug
gradlew.bat assembleDebug
```

## Laravel changes

Run focused tests first, then broader tests when practical:

```bash
php artisan test --filter=RelevantTest
php artisan test
```

## Firestore rule changes

Validate syntax and behavior through the available Firebase tooling or emulator when available.

If the emulator or Java runtime is unavailable:

- state that clearly;
- perform static review;
- inspect every affected read/write path;
- do not claim live rule enforcement was tested.

## Final repository checks

Always inspect:

```bash
git diff --check
git status --short
git diff
```

Report pre-existing failures separately from failures introduced by the current work.

---

# 15. Completion and memory update protocol

After meaningful verified work:

1. Update `docs/ai-memory/PROJECT_STATE.md`.
2. Add lasting decisions to `docs/ai-memory/DECISIONS.md`.
3. Update `docs/ai-memory/ROADMAP.md`.
4. Add unresolved items to `docs/ai-memory/KNOWN_ISSUES.md`.
5. Add a concise entry to `docs/ai-memory/SESSION_LOG.md`.
6. Correct stale architecture documentation when discovered.
7. Re-check `git status`.
8. Summarize exact verification evidence.

A task is not complete when code has merely been written. It is complete only when:

- the requested behavior is implemented;
- the integration points are reviewed;
- relevant tests/builds pass, or unavailable verification is disclosed;
- project memory reflects the new verified state;
- no unrelated work was damaged.

---

# 16. First-run Queen Bee setup

If the memory structure does not yet exist:

1. create `docs/ai-memory/`;
2. create the six memory files listed above;
3. populate them only from:
   - current repository code;
   - Git history;
   - existing verified documentation;
   - tests/builds actually run;
4. do not modify application behavior as part of memory setup;
5. show the user the proposed memory files before committing them.

When a new session starts, the Queen Bee should reconstruct context from:

- this file;
- `AGENTS.md`;
- `.claude/agents/`;
- project-memory files;
- current code;
- Git status and history.

Do not rely on one old conversation transcript as the only source of truth.
