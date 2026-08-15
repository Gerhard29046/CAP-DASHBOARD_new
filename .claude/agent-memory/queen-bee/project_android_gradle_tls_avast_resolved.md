---
name: project-android-gradle-tls-avast-resolved
description: Root cause of this machine's long-standing "Android CLI Gradle build fails" gap — Avast TLS interception, not a project/CA defect. A legitimate workaround exists but isn't durable yet.
metadata:
  type: project
---

Found 2026-08-15 by `testing-bee` while verifying [[project_e1_reliability_fix_paused]]'s
follow-on Phase F work. Every prior session (see `docs/ai-memory/KNOWN_ISSUES.md`'s now-SUPERSEDED
entries) treated this machine's `gradlew.bat` failures as an unexplained PKIX/CA trust-chain gap,
narrower each time (wrapper download, then specific uncached dependencies). The real cause: **Avast
Antivirus TLS-intercepts this machine's HTTPS traffic.** Its root CA is trusted by Windows already
but was never trusted by Android Studio's bundled JBR `cacerts` — that's the actual reason the
Android Studio GUI build has always worked (different trust stack) while a bare CLI Gradle
invocation always failed on whatever dependency happened to be uncached that session.

**Working fix, used once for real (23/23 unit tests, lint 0 errors, real APK assembled)**: copy
the JBR's `cacerts`, import the OS-trusted Avast root into the copy, point the Gradle **daemon**
at it via `-Djavax.net.ssl.trustStore=<path>` inside `org.gradle.jvmargs` (must go through
`org.gradle.jvmargs` specifically — the daemon, not the launcher JVM, resolves dependencies;
`-Djavax.net.ssl.trustStoreType=Windows-ROOT` alone breaks SunJSSE's default `SSLContext` init).
Did not disable certificate validation. Verify supply-chain integrity of anything downloaded this
way by checking the resolved jar's SHA-1 against Maven Central's published `.sha1` before trusting
it (Avast is a real interception point, not a hypothetical one).

**Not yet durable** — this was a scratch/one-off trust-store override for one verification run,
not a standing capability. Making it permanent (import the Avast root into the JBR's real
`cacerts`, or disable Avast's HTTPS scanning for build traffic) is a system-level change requiring
the user's own explicit approval — don't do it unprompted. Until the user acts on this: **do not
assume a bare `gradlew.bat` invocation will work** — re-derive/request the same trust-store
workaround (or ask `testing-bee` to redo it) each time a real CLI build is needed, rather than
either assuming the old "CLI is broken here" default or assuming this one success generalizes
automatically.
