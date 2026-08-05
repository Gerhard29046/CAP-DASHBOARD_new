# Google Calendar Authentication Redesign — decoupling from Firebase Auth

_Status: design only, 2026-08-05. No code in `functions/` or `frontend/` has been changed
for this yet — see "Implementation steps" at the end for what remains. Written in response
to an explicit instruction: treat this as a first-class migration task, do not assume
Firebase Authentication remains available after the Supabase cutover, and design Google
Calendar to keep using the Google Calendar API while authenticating requests independently
of Firebase Auth._

## 1. Problem statement

Google Calendar is deliberately staying on Firebase Cloud Functions regardless of which
data layer serves the rest of the app (see `docs/ai-memory/DECISIONS.md`, "Google Calendar
moved from Laravel to Firebase Cloud Functions") — the OAuth client, refresh-token storage,
and Calendar API calls are all working and live-tested, and re-platforming that logic isn't
warranted just because Auth is migrating. **That part of the design is correct and stays
unchanged by this document.**

The actual dependency on Firebase Auth is narrower than "Google Calendar depends on
Firebase" suggests — it's specifically about **verifying which app user is making the
request**, not about how the Google Calendar OAuth connection itself works:

- `frontend/src/api/functionsClient.js` calls `auth.currentUser.getIdToken()` (Firebase
  Auth) and attaches it as a bearer token to every Cloud Function call.
- `functions/lib/auth.js`'s `requireUser(req)` verifies that bearer token via
  `admin.auth().verifyIdToken(token)` (Firebase Admin), then loads the caller's profile from
  **Firestore** `users/{uid}` to get `role`/`effective_permissions`/`is_active`.
- 7 of the 8 deployed functions (`googleCalendarStatus/Connect/ListCalendars/
  SelectCalendars/SetDisplayEnabled/Disconnect/Events`) call `requireUser` via a shared
  `guarded()` wrapper, and all 7 also check permissions (verified via `functions/index.js`,
  2026-08-05): `Status` uses `hasAnyPermission` across all 4 calendar permission keys;
  `Connect`/`SetDisplayEnabled` require `calendar.google.connect`; `ListCalendars`/`Events`
  require `calendar.google.view`; `SelectCalendars` requires
  `calendar.google.calendars.select`; `Disconnect` requires `calendar.google.disconnect`.
  **`googleCalendarCallback` is the one exception** — it's browser-navigated (the user's
  browser is redirected there directly by Google, not called via `fetch`/`functionsClient.js`),
  carries no bearer token at all, and is secured entirely by the OAuth `state` parameter
  (validated against a hashed, single-use, 10-minute-TTL Firestore record — see
  `docs/ai-memory/PROJECT_STATE.md`'s 2026-07-23 audit entry). **This redesign does not
  need to touch `Callback` at all** — it has no Firebase Auth dependency to replace.

If `AuthContext` cuts over to Supabase (per the existing Phase 2 runbook), two things break
simultaneously: the frontend no longer has a Firebase ID token to send, and even if it did,
the caller's profile (`role`/`effective_permissions`) will have moved to Postgres and
Firestore's copy will go stale or disappear. **Do not assume Firebase Auth remains
available as a fallback once the Auth cutover happens** — per this session's explicit
instruction, this design should not depend on Firebase Auth continuing to exist at all.

## 2. Design goals

1. Google Calendar's actual functionality (OAuth connect flow, refresh-token storage,
   Calendar API reads/writes) is untouched — zero changes to `googleOAuthClient.js`,
   `googleCalendarService.js`, `googleCalendarStore.js`, or the `system_integrations/
   google_calendar` Firestore document it uses today. That document is a single,
   company-level, admin-managed config object, not per-user auth data — **explicitly out
   of scope for this redesign**, revisit separately and only if/when Firestore itself is
   ever decommissioned entirely (Phase 3, long after this).
2. The caller-identity check (`requireUser`/`requirePermission`) must work with a Supabase
   session and **must not require Firebase Auth to exist**.
3. Support a transition period where both Firebase Auth and Supabase Auth sessions might
   need to work against the same deployed functions, so this doesn't have to be coordinated
   as a single atomic deploy with the frontend's `AuthContext` flag flip. (Whether that
   transition period is actually used depends on the cutover approach chosen — see section
   5 — but the design should not preclude it.)
4. No new secrets stored client-side; the existing pattern of Firebase Secrets
   (`defineSecret`, bound via a shared `SECRETS` array in `functions/index.js`) is reused
   for anything new that Cloud Functions need server-side.

## 3. Recommended architecture

**Verify the caller's Supabase session server-side via `supabase.auth.getUser(token)`, then
look up their permissions from Postgres with a service-role client** — mirroring the exact
two-step shape `requireUser` already has (verify token → load profile), so
`hasPermission`/`requirePermission`/every one of the 8 functions' call sites needs **zero
changes**. Only `requireUser`'s internals change.

### Why `getUser(token)` over manual JWT/JWKS verification

Two ways to verify a Supabase-issued JWT server-side:

- **(a) `supabase.auth.getUser(token)`** — pass the bearer token to a `@supabase/supabase-js`
  client; it calls Supabase's Auth server to validate the token and returns the user. One
  extra network round-trip per request, but no key management, no JWKS caching, no
  signing-algorithm assumptions to get wrong, and it's the officially documented way to
  validate a token server-side.
- **(b) Local JWKS verification** (e.g. via the `jose` library, fetching Supabase's
  `/auth/v1/.well-known/jwks.json` and verifying the signature locally) — faster (no
  round-trip), but adds a new dependency, key-rotation/caching logic, and only works if the
  project uses asymmetric (ES256/RS256) signing keys; older Supabase projects may still use
  a shared HS256 secret instead, which changes the verification code path entirely.

**Recommendation: (a) for the initial implementation.** These functions already round-trip
to Google's Calendar API and are guarded by a 20s client-side timeout
(`functionsClient.js`) — one more short round-trip to Supabase's Auth server is not a
meaningful regression, and avoiding key-management code entirely is worth more than the
latency here. Revisit (b) only if this measurably matters in practice post-cutover.

### Issuer-routed dual verification (supports the transition period)

Rather than a hard cutover of `requireUser` from one verification method to the other,
decode the bearer token's payload (without verifying the signature yet) to read its `iss`
(issuer) claim and branch:

```
Firebase ID tokens:  iss = "https://securetoken.google.com/<firebase-project-id>"
Supabase JWTs:       iss = "https://<project-ref>.supabase.co/auth/v1"
                      (confirm exact value against a real token before implementing --
                      Supabase's issuer format has changed across GoTrue versions)
```

- `iss` matches Firebase → existing code path, unchanged (`admin.auth().verifyIdToken` +
  Firestore `users/{uid}` read).
- `iss` matches Supabase → new path: `supabase.auth.getUser(token)` (service-role or anon
  client, either works for this call) to get the verified `sub` (Supabase user uuid) +
  email, then a **service-role** Postgres query — `select role, effective_permissions,
  is_active from public.users where id = $1` — bypassing RLS deliberately (this is
  trusted server-side code, same trust level Firebase Admin already had), returning the
  exact same `{ uid, role, effectivePermissions }` shape `requireUser` returns today.
- Neither matches → `401 Unauthorized`, same as an invalid token today.

This means **both auth backends work simultaneously against the same deployed functions**
for as long as both exist — the frontend's `VITE_AUTH_BACKEND` flag (per the existing
runbook) can flip independently of any Cloud Functions redeploy, in either order, without a
coordinated-downtime window. The Firebase branch becomes dead code (safe to delete) only
once Firebase Auth is actually retired in Phase 3 — not before.

### New Firebase Secrets needed

Following the exact existing pattern (`GOOGLE_CALENDAR_CLIENT_ID`/`_SECRET`, `defineSecret`
in `functions/lib/googleOAuthClient.js`, bound via the shared `SECRETS` array in
`functions/index.js`):

- `SUPABASE_URL` — already known (`https://cjvrquipmnoihksijful.supabase.co`), not
  secret, but simplest to store alongside for consistency (or hardcode as a constant,
  matching how `PROJECT_ID`/`REGION` are handled elsewhere in this codebase — a documented,
  known minor drift risk already noted in `PROJECT_STATE.md`'s 2026-07-23 audit entry).
- `SUPABASE_SERVICE_ROLE_KEY` — required for the trusted permission lookup (RLS-bypassing,
  same as `migrate-firestore-to-postgres.mjs`/`smoke-test.mjs` already use locally).
  **Recommend rotating this key before using it here** — `docs/ai-memory/KNOWN_ISSUES.md`
  already flags it was pasted into a chat transcript once during Phase 0; don't deploy a
  new production dependency on a key that's already known to need rotation without
  rotating it first.

### Frontend change (`functionsClient.js`)

Needs to attach whichever backend's token is actually live, mirroring the same dual-stack
philosophy:

```
Firebase active  (VITE_AUTH_BACKEND=firebase, current default):
  await auth.currentUser.getIdToken()          // unchanged

Supabase active  (VITE_AUTH_BACKEND=supabase):
  const { data } = await supabase.auth.getSession();
  data.session?.access_token
```

This is a small, isolated change — `functionsClient.js` currently imports only `auth` from
`@/lib/firebase`; it would need to become flag-aware the same way `App.jsx`'s auth provider
selection is planned to be (see `PHASE2_CUTOVER_CHECKLIST.md` section 3.1). Not a reason to
delay the frontend `AuthContext` cutover — this file is small and isolated, not part of the
"13+ file blast radius" the checklist already flags for `AuthContext`/`apiClient` itself.

## 4. What does NOT change

- `functions/lib/googleOAuthClient.js`, `googleCalendarService.js`,
  `googleCalendarStore.js` — the actual Google OAuth/Calendar API logic. Zero changes.
- `system_integrations/google_calendar` Firestore document — stays in Firestore
  indefinitely unless a much later, separate decision moves it. It is not per-user data and
  has no auth-coupling problem.
- The 8 functions' exported names, routes, request/response shapes, or
  `requirePermission(user, key, res)` call sites — all unchanged, since `requireUser`'s
  return shape is preserved exactly.
- Android's `GoogleCalendarRepository.kt` — explicitly out of scope (Android stays on
  Firebase per the existing web-only-cutover assumption); it will keep working unchanged
  against the Firebase-issuer branch for as long as Android stays on Firebase Auth.

## 5. Migration steps (ordered, tagged like the existing Phase 2 runbook)

1. **[decision]** Confirm the exact `iss` claim value Supabase issues for this project —
   decode a real Supabase session JWT (e.g. via `smoke-test.mjs`'s test user, or the
   browser devtools on a local Supabase-auth test build) rather than assuming the format.
2. **[no-approval]** Confirm/rotate `SUPABASE_SERVICE_ROLE_KEY` per the note above.
3. **[implementation, not started]** Add `@supabase/supabase-js` to `functions/package.json`.
   Write the issuer-routing + Supabase-branch logic in `functions/lib/auth.js`. Add unit
   tests (this repo's existing pattern for `functions/` — see `functions/*.test.js`, 46/46
   passing as of the last verified run — covers `requireUser`/`requirePermission`; extend
   rather than replace).
4. **[no-approval]** Local verification: `node --check`, `npm test` in `functions/`.
5. **[approval]** Deploy the updated functions (`firebase deploy --only functions`) — this
   is additive (new issuer branch only), the existing Firebase-token path is unchanged, so
   this is safe to deploy well ahead of any frontend Auth cutover with zero behavior change
   for current (Firebase-authenticated) callers. Still needs explicit approval per CLAUDE.md
   section 12 (any Functions deploy does), same as every other deploy in this project.
6. **[implementation, not started]** `functionsClient.js`'s flag-aware token attachment
   (section 3, "Frontend change"), built and tested behind the same
   `VITE_AUTH_BACKEND` flag `AuthContext`'s cutover already plans to use — natural to build
   these two flag-aware pieces together when that work starts, not necessarily before.
7. **[no-approval, once 5 and 6 exist]** With the frontend flag flipped to `supabase` in a
   local/staging build only, manually verify each of the 8 Google Calendar operations
   (status, connect, list calendars, select calendars, toggle display, disconnect, events)
   works end-to-end against a Supabase-authenticated session.
8. **[decision]** Once section 7 is clean and the actual `AuthContext` cutover (checklist
   section 4) happens, decide whether to keep the dual-stack branch indefinitely (near-zero
   cost, supports Android staying on Firebase Auth long-term per the existing "Android stays
   on Firebase" assumption) or remove the Firebase branch once Android also migrates
   (Phase 3-adjacent, unscoped, no timeline yet).

## 6. Why this doesn't block the rest of Phase 2

Nothing above requires this to happen before `0013` is applied, before the `users`/`storage`
migration phases run, or before `entities.js`/`supabaseApiClient.js` are wired into the
frontend behind a flag. It only needs to be resolved **before the `AuthContext` flag is
actually flipped to `supabase`** (checklist section 3.1) — added there as an explicit
blocking dependency in `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`.
