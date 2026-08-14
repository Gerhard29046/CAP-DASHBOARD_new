---
name: project-e1-reliability-fix-paused
description: E1 (Android Knowledge Base + Supabase/Firestore reliability) — RESOLVED 2026-08-14, gate PASSED. Kept for the investigation history/technique; see the resolution note at top before trusting anything below as current status.
metadata:
  type: project
---

**RESOLVED 2026-08-14 (third session, same day as the pause below): E1 gate PASSED.** The
architectural question this file was blocking on is answered: the Firestore `"users"` collection
is Option C (intentionally transitional). `Core.kt`'s `observeFirestoreCollection("users")` was
fixed so a listener error on it degrades to last-known-good/empty data and retries after 20s
instead of calling `close()` — deliberately stricter than the Supabase-stream policy (never
closes, not even cold-start) because the real trigger (`firestore.rules:31` `isAdmin()` vs.
Android's Supabase `users.view` permission — two unsynchronized systems) isn't transient.
`testing-bee` independently verified via a real Gradle build (16/16 unit tests, 7 new
deterministic tests proving no duplicate listeners/leaks/runaway retries/shared-flow
termination), unchanged regression baselines (19/19, 21/21, 48/48), unchanged QA-account count
(4/4). See `docs/ai-memory/DECISIONS.md`/`KNOWN_ISSUES.md`/`SESSION_LOG.md`'s matching 2026-08-14
entries for full detail. **No Users migration/removal/Firebase removal was performed — that
product decision remains genuinely open.** E2/Photo Upload/Calendar still NOT STARTED, not
authorized by this resolution.

**Durable lesson worth keeping**: `supabase-android-bee` and `migration-audit-bee` were both
unavailable this session (`Agent type '...' not found. Available agents: android-ui-bee,
testing-bee`) despite having definition files under `.claude/agents/` — same class of gap as
[[feedback_agent_tool_does_not_resume_by_name]]'s subagent-tooling quirks. When a designated
worker bee isn't actually invocable, do the work directly as Queen Bee with full disclosure
rather than blocking or silently reaching for agent-definition edits (which the user explicitly
forbade touching to "fix" this) — then get independent verification from whichever bee **is**
registered instead of self-certifying. Root cause of the registration gap itself is still not
investigated — check at the start of a future session whether it persists.

---

**Original pause note below, preserved for history — status line superseded by the resolution
above, do not treat "E1 is NOT complete" as current.**

**Status as of 2026-08-14 (second session continuing the pause).** E1 is NOT complete. Do not
start E2, Photo Upload, or Calendar. Do not modify `Core.kt`/`MainActivity.kt` until the open
architectural question below is resolved.

## What's done and independently verified

The E1 reliability fix (session-expiry/token-refresh + stream-recovery in `SupabaseAuth.kt`/
`SupabaseData.kt`/`Core.kt`) correctly protects all 10 Supabase-backed data streams
(`clients`/`machines`/`service_records`/`job_cards`/`job_card_lines`/`knowledge_machines`/
`knowledge_notes`/`knowledge_media`/`knowledge_documents`/`knowledge_service_codes`).

`testing-bee` independently verified 9 of 14 required criteria against live production
Supabase with real command output (token expiry tracking, 401 detection, retry-loop
prevention, failed-refresh behavior, token redaction, Phase A-D CRUD regression, Phase E1
Knowledge Base regression, no Firebase reintroduced, no service-role credential in Android).
3 more (single-flight refresh, concurrent-refresh protection, refresh-and-retry-once) are
statically sound but genuinely can't be dynamically exercised in this environment — the
auth/data layer isn't unit-testable as currently structured (no injectable base URL/session-
store interface — a real follow-up if machine-enforced coverage is ever wanted).

Queen Bee independently re-verified (not just trusted) `testing-bee`'s two most load-bearing
claims: personally read `Core.kt:258-292`/`MainActivity.kt:127-144` to confirm the `users`
finding below, and ran a fresh `listUsers()` query to confirm the QA account count.

**Real correction to a previously-documented constraint**: `gradlew.bat` CAN build on this
machine when `JAVA_HOME` points at Android Studio's bundled JBR (`testing-bee` got a genuine
`BUILD SUCCESSFUL` + a real APK). The TLS/CA gap only blocks *uncached* dependencies —
`lintDebug` specifically still fails on one never-cached artifact. Update future environment
assumptions accordingly instead of assuming CLI Gradle is fully broken here.

## THE open finding — architectural determination required, do NOT guess

The E1 fix left an 11th collection, `"users"`, untouched — it's still routed to
`Core.kt:258-268`'s `observeFirestoreCollection()`, which still calls `close(error)` on any
Firestore listener error. `MainActivity.kt:127-138` combines it via `Core.kt:270-292`'s
`combine()` alongside the 10 now-fixed streams, so a Firestore error on `users` still
permanently kills every other screen's data. Not hypothetical — `Core.kt`'s own KDoc
documents the Firebase-bridge login as best-effort and expected to fail for most real
accounts today (only 1 real user has a Supabase account so far).

**Per explicit user instruction: do not guess at the fix.** First determine whether `users`
is (A) intentionally still Firebase/Firestore during the migration, (B) supposed to have
already migrated to Supabase (a real gap), (C) intentionally retained as a transitional
dependency for a different reason than A, or (D) obsolete/removable. This is planned as a
separate, fresh investigation task by the user, not something to resolve inline. See
`docs/ai-memory/KNOWN_ISSUES.md`'s matching OPEN entry (2026-08-14) for full detail.

## QA infrastructure state

The QA-script cleanup false-PASS bug (2 scripts silently reporting "PASS" while a throwaway
Supabase Auth account was still live) was investigated, root-caused by reading the actual
code, and fixed — see `docs/ai-memory/KNOWN_ISSUES.md`'s RESOLVED entry for the exact
mechanism. Both fixed scripts re-run live and clean (19/19, 21/21). `testing-bee` found one
more instance of the same bug class in a new script it wrote itself, caught it via its own
independent verification, and fixed it (20/20 after).

**Exactly 4 leftover QA accounts remain live, independently re-verified twice this session**
(once by Queen Bee after the script fixes, once again by Queen Bee after `testing-bee`'s full
run) — none deleted, none authorized for deletion:
- `qa-fixes+admin-1786627520045-4gmd@invalid.local`, `qa-fixes+technician-1786627521518-gac2@invalid.local`
  (original 2, predate this session, cause never identified)
- `qa-android-refresh+1786695110465-wr0314@invalid.local`, `qa-phase-d+technician-1786695144406-fx54@invalid.local`
  (the 2 that leaked from the now-fixed cleanup bug)

## Next steps when resuming

1. Determine `users`' architectural status (A/B/C/D above) — the user's own stated next task,
   in a fresh session.
2. Only then: decide/implement whatever `users` needs (may or may not require Kotlin changes
   to `Core.kt`/`MainActivity.kt` — don't assume the answer before the investigation).
3. Resume the original gate sequence: `migration-audit-bee` (read-only follow-up audit) →
   update `docs/android/ANDROID_SUPABASE_MIGRATION.md` + `KNOWN_ISSUES.md` → the final "E1
   RELIABILITY REMEDIATION" report in the user's exact specified format → E1 status decision
   (COMPLETE/BLOCKED/INCOMPLETE) — still explicitly not E2.
4. Minor cleanup items still outstanding, not blocking: several stray zero-byte junk files in
   the working tree (shell-quoting accidents), one hardcoded-tautological check in
   `qa-verify-android-token-refresh-contract.mjs:202` (cosmetic, doesn't affect correctness).
