---
name: feedback-commit-uncommitted-work-promptly
description: Don't let multiple sessions of verified Supabase-migration work sit uncommitted in the working tree — commit promptly once build/test-verified, even mid-migration.
metadata:
  type: feedback
---

On 2026-08-07, an entire day's worth of Phase 3 work (Google Calendar auth redesign,
deployed and live-verified; `VITE_AUTH_BACKEND` frontend flag wiring; password-reset flow)
from the 2026-08-06 sessions was found still sitting uncommitted in the working tree, one
day later, with only a stale HEAD (`f7b5df0`, 2026-08-05) on `origin/main`. The user's
reaction on being told this: commit and push it immediately, framed as risk-reduction
("I don't want to risk losing it").

**Why:** the existing pattern across `DECISIONS.md`/`SESSION_LOG.md` entries was to
commit+push at explicit end-of-day request, but nothing prompted a commit checkpoint
*during* long, multi-part sessions once a distinct unit of work (e.g. the whole Functions
deploy + flag-wiring block) was already build/test-verified. That left real completed,
verified work exposed to loss for longer than necessary.

**How to apply:** once a coherent unit of Supabase-migration (or any) work is genuinely
build/test-verified — not mid-edit, not half-done — proactively suggest committing it
(with a clear message) even if the user hasn't asked to end the session yet, rather than
waiting for an explicit "let's push before I go" prompt. Still don't push without normal
judgment about what's safe (this project's `.claude/settings.json`/`frontend/.claude/`
tooling-artifact noise should stay excluded regardless — see the recurring-artifact note in
[[project-supabase-migration]]).
