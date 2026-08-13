---
name: project-supabase-calendar-401-bug
description: MOOT as of 2026-08-12 — Google Calendar sync was removed entirely (cost decision), so this 401 bug can no longer occur. Kept only as historical record of a real root-cause investigation technique; do not treat as an open blocker.
metadata:
  type: project
---

**MOOT since 2026-08-12**: Google Calendar sync was removed entirely from the web app and
Cloud Functions (user decision — cost; see `docs/ai-memory/DECISIONS.md` and
`docs/ai-memory/PROJECT_STATE.md`'s 2026-08-12 entry). There is no `googleCalendarStatus`
function left to fail. This memory is kept only because the investigation technique below
(reproducing a Cloud Function's auth-verification logic locally against the real project to
isolate "code is right, deployed environment/secret is wrong") is a reusable pattern for
this repo. Do not act on this as an open bug.

On 2026-08-07, the first-ever test of the Google Calendar auth redesign
([[project-supabase-migration]]) with a **genuinely valid** (not intentionally-malformed)
Supabase session JWT found it fails: `GET googleCalendarStatus` with
`Authorization: Bearer <real valid Supabase access_token>` returns `401 {"message":
"Unauthorized"}` from the live deployed function.

**Why this wasn't caught on 2026-08-06's "verified live" deploy**: that verification
(`PROJECT_STATE.md`/`KNOWN_ISSUES.md` 2026-08-06 entries) only tested a Supabase-issuer
token with a **fake signature** (expecting and getting 401 — correct, since an invalid
signature should fail) and 3 other negative cases. It never tested a real, validly-signed
Supabase session actually succeeding. So "the redesign is genuinely deployed and working"
was true only for the routing/rejection behavior, not for the actual success path — this
2026-08-07 test is the first real positive-path test.

**Isolated so far**: reproduced `verifySupabaseUser()`'s exact logic
(`supabase.auth.getUser(token)` via a service-role client, then a `public.users` profile
query) locally against the real project using the current `supabase/.env` service-role key
— **succeeds** every time, correctly resolving role/permissions. This proves the logic
itself is sound and the current local service-role key is valid and working. The failure
must be specific to the deployed Cloud Function's environment — most likely the
`SUPABASE_SERVICE_ROLE_KEY` Firebase Secret bound to the deployed function no longer
matches the currently-valid key (a stale Secret Manager version, or a rotation that
happened without a following redeploy), or possibly the deployed `SUPABASE_URL` param
differs from the local default — **neither confirmed**, since Queen Bee has no Cloud
Functions log access (`firebase` CLI not installed locally) in this environment.

**How to apply**: before trusting the Google Calendar+Supabase integration for any real
cutover, this must be root-caused and fixed. Recommended next steps: (1) user checks Cloud
Functions logs for the real `verifySupabaseUser`/`getUser` error (Queen Bee can't); (2) as
a first troubleshooting step, re-run `firebase functions:secrets:set
SUPABASE_SERVICE_ROLE_KEY` with the current `supabase/.env` value and redeploy, then re-test
with a real valid session (reuse `supabase/scripts/qa-test-user.mjs` +
`qa-clickthrough.mjs`, both left in the repo, untracked, for exactly this kind of retest).
Not fixed this session — this is a deploy-affecting action outside Queen Bee's direct
permission (deploys are always user-run per CLAUDE.md section 12), and the root cause
wasn't confirmed, so no fix was attempted per the user's own instruction to stop and report
rather than guess-fix anything deploy-related.

Every other part of the 2026-08-07 QA pass (auth, all table reads, full CRUD write/update/
delete, permission bypass via `role=admin`) passed cleanly against the real project using a
throwaway admin-equivalent Supabase Auth test user — this bug is isolated to the Google
Calendar Cloud Functions integration specifically, not the core data layer.
