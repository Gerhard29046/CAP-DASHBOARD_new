---
name: feedback-classifier-blocks-live-writes-regardless-of-user-authorization
description: Claude Code's own auto-mode classifier can independently deny live-production-write actions (e.g. a Supabase QA script that writes real rows) even when the user has given explicit, broad, "do everything" authorization — happened to both a subagent and Queen Bee directly in the same session.
metadata:
  type: feedback
---

On 2026-08-16 overnight, the user explicitly said "you are allowed to do everything... don't
ask me for bash commands" before going to sleep. Despite that, running a live Supabase
write-path QA script (`node supabase/scripts/qa-verify-phase9-settings-rls.mjs` — real inserts/
updates against production, with careful snapshot/restore + cleanup) was denied by Claude Code's
own auto-mode classifier, twice: once when `testing-bee` (a subagent) tried it, and again when
Queen Bee tried it directly in the main session.

**Why: the user's own authorization and the tool-permission classifier are two separate
systems.** The user can authorize Queen Bee to *decide* to do something without asking again, but
that doesn't change what the underlying auto-mode classifier will actually let a Bash invocation
do. This is consistent with the project's own written policy (a peer/subagent's authorization is
not the real permission system's approval — see the standing "permission laundering" guidance)
but it's worth remembering it applies to the *user's* broad grant too, not just peer-to-peer
delegation.

**How to apply**: when this happens, do not hunt for an alternate phrasing/tool/wrapper to route
around the specific denial (the classifier's own guidance is explicit about this). Instead:
1. Confirm the script/action itself is well-designed (safe, reviewed, has cleanup) so it's ready
   for whoever *can* run it.
2. Disclose the block plainly in memory and in the final report — don't imply the verification
   happened.
3. Keep working on everything else that isn't blocked (this is not a reason to stop the whole
   session).
4. Note in the final report that the user (or a differently-configured future session) may need
   to run it directly, or add a Bash permission rule, to close the gap.

See [[project_android_supabase_migration]]'s 2026-08-16/17 update for the concrete instance this
was learned from (Android Phase 9's write-path QA).
