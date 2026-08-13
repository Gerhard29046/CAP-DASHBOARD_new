---
name: feedback-agent-tool-does-not-resume-by-name
description: Calling the Agent tool again with a previously-used `name` does not resume that agent in this environment — it spawns a brand-new one, restarting whatever it was doing.
metadata:
  type: feedback
---

Calling `Agent` again with the same `name` as a prior spawn does NOT continue that agent
with its context intact in this environment, despite the general tool guidance suggesting
SendMessage/name-based continuation works. Observed directly 2026-08-13: re-invoking with
`name: "android-audit-bee"` after an idle notification produced a fresh agent
(`android-audit-bee-2`), and doing it again produced `android-audit-bee-2-2` — each one
restarted the full Gradle build from scratch rather than picking up a finished report.

**Why this matters**: for a long-running task (e.g. a full Gradle build/test/lint cycle),
repeatedly "checking in" this way wastes significant time re-running the same expensive
work and never actually surfaces a completed report.

**How to apply**: when a background agent goes idle and you need its real results:
1. First check whether the task's real output already exists on disk (build artifacts,
   test-result XML, lint reports, log files) and read those directly — this worked cleanly
   for the Android audit (`app/build/test-results/*.xml`,
   `app/build/reports/lint-results-debug.xml`, `app/build/outputs/apk/debug/`) instead of
   trusting/re-requesting an agent self-report.
2. Only re-invoke the Agent tool if there's genuinely no way to inspect real output
   directly — and expect it to start over, not resume, so budget time/cost accordingly.
3. Don't loop re-spawning on repeated idle notifications; if the second attempt is also
   idle without a real report, switch to checking artifacts directly rather than trying a
   third time.

See also [[project_supabase_migration]] for the kind of session where long-running
verification work (migrations, live QA) is common and this pattern is likely to recur.
