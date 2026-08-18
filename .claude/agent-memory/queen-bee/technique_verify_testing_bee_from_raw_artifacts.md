---
name: technique-verify-testing-bee-from-raw-artifacts
description: After testing-bee reports Android build/test results, independently re-derive the real numbers from the raw artifacts on disk before repeating them as verified fact — don't just relay its summary.
metadata:
  type: technique
---

Confirmed useful 2026-08-18 (Android Service Certificate build verification). Even when
`testing-bee` genuinely ran the real commands, its prose summary can be paraphrased/rounded —
independently re-derive the exact numbers yourself from the artifacts it produced, all readable
directly with `Read`/`Bash` (grep/awk), no Gradle re-run needed:

- Unit tests: `mobile-android/app/build/test-results/testDebugUnitTest/TEST-*.xml` — each file has
  a `tests="N" skipped="N" failures="N" errors="N"` attribute on its root `<testsuite>` element.
  Sum across all files (`grep -h -o 'tests="[0-9]*" ...' *.xml | awk -F'"' '{...}'`) to get the
  real total, and diff the new file list against the previous known baseline count (see
  `docs/ai-memory/KNOWN_ISSUES.md`'s Android Phase entries for the last recorded baseline) so you
  can say exactly how many tests are new vs. pre-existing, not just "N passed."
- Lint: `mobile-android/app/build/reports/lint-results-debug.xml` — count
  `severity="Error"`/`severity="Warning"` occurrences directly rather than trusting a summary line.
- APK: `mobile-android/app/build/outputs/apk/debug/app-debug.apk` — check it exists, its size, and
  its mtime (should match "today," not a stale artifact from a much earlier session).
- New Gradle dependency check: `git diff --stat -- app/build.gradle.kts gradle/libs.versions.toml`
  — empty output is real proof no new dependency was added, don't just take a bee's word for it.

This is strictly cheaper than re-running the build yourself (which usually isn't even possible —
see [[project_android_gradle_tls_avast_resolved]] for why Queen Bee's own shell typically can't
run Gradle directly on this machine) and catches the case where a subagent's self-report rounds up
or glosses over a partial failure. Combine with
[[feedback_agent_tool_does_not_resume_by_name]]'s existing "check disk artifacts before
re-spawning" guidance — this is the same principle applied to *validating* a report that did
arrive, not just retrieving one that didn't.
