---
name: project-e1-reliability-fix-paused
description: Where Phase E1 (Knowledge Base) reliability remediation stood when the session was paused on 2026-08-14 — implementation done and independently spot-checked, but testing-bee/migration-audit-bee gate steps NOT yet run, plus a real leftover-QA-account cleanup bug found
metadata:
  type: project
---

**Status as of 2026-08-14, session paused by user request.** Do not declare E1 complete or start
E2 without picking this back up.

## What's done (verified directly by Queen Bee, not just self-reported)

`supabase-android-bee` implemented the E1 reliability fix (session-expiry/token-refresh +
stream-recovery) requested after `migration-audit-bee`'s first E1 audit found `SupabaseAuth.kt`
never refreshed access tokens and `close(error)` on one table's transient failure killed every
screen's data via `combine()`. Changed: `SupabaseAuth.kt` (expiry tracking, Mutex+generation
-guarded single-flight refresh, `validAccessToken()`/`refreshAfterUnauthorized()`), `SupabaseData.kt`
(`withAuth()` wrapper: refresh-once-retry-once, `UnauthorizedException`/`SessionExpiredException`
split, `observeCollection()` no longer closes on transient failure except on the very first
cold-start fetch), `Core.kt` (stale KDoc fixed, `ApiException` made `open` for the subclass).

Queen Bee personally reviewed the full diff (not just the agent's report) — architecture is
sound: proper expiry tracking from the token response's own `expires_at`/`expires_in` (not a
guessed TTL), token values redacted in `toString()`, no logging anywhere in either file, no
service-role key, `MainActivity.kt` untouched. Also personally ran 3 live scripts and got:
`qa-verify-android-token-refresh-contract.mjs` 18/18, `qa-verify-android-phase-d-rest-contract.mjs`
16/16, `qa-verify-android-phase-e1-knowledge-rest-contract.mjs` 48/48 — all genuinely re-run by
Queen Bee, not trusted from a subagent report.

## What's NOT done yet — required before declaring E1 complete (per user's explicit gate rule)

1. `testing-bee` has not yet independently re-verified this fix (Queen Bee's own script runs are
   not a substitute for the required delegation step).
2. `migration-audit-bee` has not yet done the follow-up independent audit specifically checking
   token refresh/401 handling/retry limits/concurrency/flow lifecycle, per the user's explicit
   audit checklist for this remediation.
3. The "E1 RELIABILITY REMEDIATION" report format the user specified has not been produced.
4. `docs/android/ANDROID_SUPABASE_MIGRATION.md` and `KNOWN_ISSUES.md` have NOT been updated yet
   (Queen Bee was asked to do this centrally after the gate decision, not supabase-android-bee).

## Real bug found, NOT yet fixed, NOT yet approved for cleanup

Both `qa-verify-android-token-refresh-contract.mjs` and `qa-verify-android-phase-d-rest-contract.mjs`
report a false "cleanup PASS" for their throwaway test user. Queen Bee independently confirmed via
direct `getUserById`/`profile row` checks that these 2 accounts are still genuinely live:
- `qa-android-refresh+1786695110465-wr0314@invalid.local` (id `01a5345b-609c-4f29-ae96-0b41a5f0c92c`)
- `qa-phase-d+technician-1786695144406-fx54@invalid.local` (id `7bca20b5-d596-4b5f-9311-40600145f4d4`)

This is IN ADDITION to the 2 pre-existing, already-known, deliberately-untouched leftover accounts
(`qa-fixes+technician-1786627521518-gac2@invalid.local`, `qa-fixes+admin-1786627520045-4gmd@invalid.local`)
— so there are now 4 leftover throwaway accounts total, not 2. **Not deleted** — no approval given,
and the cleanup-code bug itself (likely `admin.auth.admin.deleteUser(uid).catch(() => {})` silently
swallowing a real failure — seen in `qa-verify-android-token-refresh-contract.mjs:206`) needs
investigating before trusting any script's self-reported cleanup again. Root cause not yet
determined — could be an actual `deleteUser` API failure being swallowed, or something about the
concurrent-refresh test leaving multiple sessions/tokens that confuse deletion. Investigate before
next QA script run.

**Why to apply**: don't trust "cleanup: PASS" from these two scripts (or any script using the same
`.catch(() => {})` pattern) without independently re-checking via `listUsers`/`getUserById`, per
[[technique_subagent_report_retrieval]]'s general "verify, don't trust self-report" lesson extended
to QA scripts, not just subagents.

## Next steps when resuming

1. Investigate + fix the QA-script cleanup bug (likely quick), get user approval, delete the 2 new
   leftover accounts (leave the original 2 alone, still no approval for those).
2. Delegate to `testing-bee` for the formal independent verification pass.
3. Delegate to `migration-audit-bee` for the follow-up audit (checklist is in the user's original
   remediation-task message — token refresh, 401 handling, retry limits, concurrency, token
   secrecy, polling recovery, Flow lifecycle, no swallowed auth failures, no E1 regression, no
   Firebase reintroduced, no service-role key, architecture unchanged).
4. Produce the "E1 RELIABILITY REMEDIATION" report in the user's exact requested format.
5. Update `docs/android/ANDROID_SUPABASE_MIGRATION.md` + `KNOWN_ISSUES.md`.
6. Only then decide E1 STATUS (COMPLETE/BLOCKED/INCOMPLETE) — still explicitly NOT E2.
