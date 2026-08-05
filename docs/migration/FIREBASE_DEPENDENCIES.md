# Firebase Dependency Inventory

_Last verified: 2026-08-05, by direct grep/read of the repository (not from memory or prior
claims). This is a snapshot — re-verify before relying on it if significant time has passed
or major refactors have landed. See `docs/migration/PHASE2_CUTOVER_CHECKLIST.md` for how
this feeds into the cutover plan, and `docs/ai-memory/DECISIONS.md`'s Phase 2 runbook for
the approval gates governing when/whether each of these is ever removed._

**Purpose**: a complete, categorized list of every place Firebase is depended on today, so
the eventual cutover/removal work has a concrete checklist instead of relying on memory or
partial greps done ad hoc.

---

## 1. Frontend (`frontend/`) — web client

### 1.1 Core Firebase SDK usage (the actual dependency surface)

| File | Firebase APIs used | Purpose |
|---|---|---|
| `src/lib/firebase.js` | `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/storage` | Single init point. Exports `auth`, `db` (named database `"capdashboard"`), `storage`, `firebaseApp`. Throws at runtime if any `VITE_FIREBASE_*` env var is missing. |
| `src/lib/AuthContext.jsx` | `firebase/auth` (`onAuthStateChanged`, `signInWithEmailAndPassword`, `signOut`), `firebase/firestore` (`doc`, `getDoc`, `getDocs`, `query`, `where`, `collection`) | The live auth context. Loads the `users/{uid}` profile doc (with an email-based fallback query) on every auth-state change. Every page's `useAuth()` call ultimately depends on this file. |
| `src/api/apiClient.js` | `firebase/firestore` (full CRUD + `onSnapshot`), `firebase/auth` (password reset, sign-out), `firebase/storage` (`uploadBytes`, `getDownloadURL`) | The live data layer. All entity CRUD (`clients`, `machines`, `service_records`, `job_cards`, `job_card_lines`, `sites`, `users`, `permissions`, `role_permissions`, `knowledge_*`), file uploads, calendar-event derivation, and the generic `request()` router pages call for anything not covered by `entities`. |
| `src/api/functionsClient.js` | `firebase/auth` (reads `auth.currentUser` to attach a bearer ID token) | Calls the 8 deployed Firebase Cloud Functions (`googleCalendar*`) by name over HTTP. No other Firebase SDK usage — Google Calendar itself is Cloud-Functions-based, not Firestore. |

### 1.2 Consumers (import the above, directly or transitively)

31 files under `src/` import `@/api/apiClient`, `@/lib/AuthContext`, `@/lib/firebase`, or
`@/api/functionsClient` (verified via grep, 2026-08-05):

`App.jsx`, `components/AppLayout.jsx`, `components/LogServiceModal.jsx`,
`components/ProtectedRoute.jsx`, `components/RoleGuard.jsx`, `hooks/useCurrentUser.js`,
`lib/PageNotFound.jsx`, and every page: `AddClient`, `BookIn`, `CalendarPage`,
`ClientDetail`, `Clients`, `Dashboard`, `ForgotPassword`, `InvoiceQueue`, `JobCardDetail`,
`Jobs`, `KnowledgeBase`, `KnowledgeMachineDetail`, `KnowledgeMachineForm`, `Login`,
`MachineDetail`, `Register`, `ResetPassword`, `ServiceRecords`, `SystemSettings`,
`UpcomingServices`, `UserAdmin`.

Practically: **every page in the app** depends on Firebase today, mostly indirectly through
`AuthContext`/`ProtectedRoute` (auth gate) and `apiClient` (data). This is the real blast
radius for the eventual `AuthContext`/`apiClient` cutover — not a small edit.

### 1.3 Environment variables (client-side, `frontend/.env` / `.env.production`)

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FUNCTIONS_BASE_URL   (base URL for functionsClient.js's callable-function HTTP calls)
```

`vite.config.js` throws at build time in `production` mode if any of the 6 `VITE_FIREBASE_*`
keys is missing (verified 2026-08-05 — build succeeds on this machine because
`.env.production` has them; the plain `.env` here currently only has Supabase keys, which
would block `npm run dev` locally until Firebase dev keys are added back — a local
environment gap, not a code regression).

### 1.4 Already-built, unwired Supabase equivalents (for parity reference)

These exist and are verified (lint/typecheck/test clean) but are **not imported by any page
or `App.jsx`** — Firebase remains the only live path:

- `src/services/supabase/client.js`, `auth.js`, `database.js`, `storage.js`, `entities.js`,
  `SupabaseAuthContext.jsx`
- `src/api/supabaseApiClient.js` (drop-in equivalent of `apiClient.js`)

---

## 2. Firebase Cloud Functions (`functions/`) — Google Calendar backend

**Not in scope for this migration** — Google Calendar is deliberately staying on Firebase
Cloud Functions regardless of which data layer serves the rest of the app (see
`DECISIONS.md`, "Google Calendar moved from Laravel to Firebase Cloud Functions"). Listed
here for completeness, since it's still a real Firebase dependency that will outlive the
Firestore/Auth/Storage cutover.

| File | Role |
|---|---|
| `functions/index.js` | 8 exported `onRequest` functions: `googleCalendarStatus/Connect/Callback/ListCalendars/SelectCalendars/SetDisplayEnabled/Disconnect/Events`. |
| `functions/lib/firebaseAdmin.js` | Shared Admin SDK init (used to read/write `system_integrations/google_calendar` and the OAuth CSRF-state collection in Firestore). |
| `functions/lib/auth.js` | `requireUser`/`requirePermission` guards — validates the caller's Firebase ID token and checks `effective_permissions`. |
| `functions/lib/googleOAuthClient.js`, `googleCalendarService.js`, `googleCalendarStore.js` | OAuth flow + Google Calendar API calls + Firestore-backed token/status storage. |

**Dependencies**: `firebase-admin@^12.6.0`, `firebase-functions@^5.1.1` (`functions/package.json`).

**Deployment**: region `africa-south1`, project `capdatabasefb2`. Live-tested end-to-end
2026-07-24 (see `PROJECT_STATE.md`).

**Consequence for the Supabase cutover**: even after Auth/Firestore/Storage move to
Supabase, the frontend will still call these 8 Cloud Functions unchanged
(`supabaseApiClient.js`'s `googleCalendarRoute`/`calendarEvents` already do this — see
section 1.4). `functionsClient.js`'s ID-token bearer auth, however, is Firebase-Auth-specific
(`auth.currentUser` from `firebase/auth`); if/when `AuthContext` cuts over to Supabase, this
file needs its own fix to attach a Supabase session token instead, and 7 of the 8 functions'
`requireUser`/`hasAnyPermission` guard (currently verifying a Firebase ID token) need an
equivalent update to verify Supabase JWTs instead. **Now designed** — see
`docs/migration/GOOGLE_CALENDAR_AUTH_REDESIGN.md` (2026-08-05) for the full recommended
architecture (issuer-routed dual verification, so both Firebase and Supabase tokens work
simultaneously against the same deployed functions) and ordered migration steps. Not yet
implemented in `functions/` or `frontend/`.

---

## 3. Firestore Security Rules (`firestore.rules`)

Enforces role/permission checks (`isAdmin()`/`hasPermission()`) against
`users/{uid}.effective_permissions` for every collection Firestore currently serves. This is
the **only** authorization layer for direct Firestore access today (Laravel middleware does
not protect it — see `CLAUDE.md` section 6.1). Stays fully active and unmodified throughout
the migration; only becomes removable after Firestore itself is decommissioned (Phase 3,
long after cutover + soak period).

---

## 4. Android (`mobile-android/`) — native client

**Explicitly out of scope for this phase** per current instructions — listed for inventory
completeness only, not touched.

| File | Firebase APIs used |
|---|---|
| `Core.kt` | `FirebaseApp`, `FirebaseAuth`, `FirebaseAuthException`, `FirebaseFirestore`, `FirebaseFirestoreException`, `DocumentSnapshot`, `FieldValue`. This is Android's entire data/auth layer — direct Firestore CRUD + Firebase Auth, no Laravel/Supabase involvement today. |
| `GoogleCalendarRepository.kt` | `FirebaseAuth` (reads the current user's ID token to call the same 8 Cloud Functions as the web client, read-only). |
| `MainActivity.kt` | References Firebase indirectly through `Core.kt`'s app-level init. |
| `app/src/androidTest/.../LiveFirebaseSmokeTest.kt` | Instrumented test hitting real Firebase — confirms live Firebase connectivity as part of Android's test suite. |

Per `docs/ai-memory/PHASE2_CUTOVER_CHECKLIST.md` section 1, the working assumption is
**web-only cutover — Android stays on Firebase** for an unscoped, undecided transitional
period. Building Supabase parity for Android (Kotlin SDK or a REST wrapper, offline/Room
caching equivalence, etc.) is a separate, unestimated project, not a subtask of this web
migration.

---

## 5. Laravel (`backend/`) — mostly dead code, no direct Firebase dependency

`backend/composer.lock` is the only match for "firebase" in `backend/` (a transitive/incidental
string match, not a real package dependency — verified, no Firebase PHP SDK is installed).
Laravel never talked to Firebase directly; it has its own MySQL-backed models/controllers for
clients/machines/service records/job cards/users/permissions/Google Calendar, but **neither
active client (web or Android) calls these endpoints** — see `CLAUDE.md` section 8. Not
relevant to this Firebase→Supabase migration either way; flagged here only so "Laravel has no
Firebase dependency" isn't left unverified.

---

## 6. Summary — what actually needs to change at cutover time

| Layer | Firebase today | Supabase equivalent | Cutover action needed |
|---|---|---|---|
| Web Auth | `firebase/auth` via `AuthContext.jsx` | `SupabaseAuthContext.jsx` (built, unwired) | Flip `App.jsx`'s provider behind a flag — **[approval]**, see runbook step 6-7 |
| Web Firestore CRUD | `apiClient.js` | `supabaseApiClient.js` (built, unwired) | Same flag/flip — **[approval]** |
| Web Storage | `firebase/storage` in `apiClient.js` | `storage.js` (built, unwired) | Same flag/flip — **[approval]** |
| Web → Google Calendar | `functionsClient.js` (Firebase ID token) | Not built — needs Supabase-JWT-aware auth on both the client call and all 8 Cloud Functions' `requireUser` guard | **Not designed yet** — new work, separate from the data-layer cutover |
| Firestore Security Rules | `firestore.rules`, fully active | RLS policies (`0002_rls_policies.sql`, applied and verified) | No action until Firestore itself is decommissioned (Phase 3) |
| Android | `Core.kt` (Firestore + Auth), `GoogleCalendarRepository.kt` | None | **Explicitly deferred** — decision needed on timing (see checklist section 1) |
| Laravel | None (dead code) | N/A | No action |
