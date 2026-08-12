---
name: project-supabase-password-reset-untested
description: The Supabase password-reset link/flow has never been physically clicked/tested by the user — don't report QA as complete or give a go/no-go recommendation without this.
metadata:
  type: project
---

As of 2026-08-07, the Supabase Auth password-reset flow for the 1 migrated user
(`admin@connoisseurauto.co.za`) has been built and code/build-verified
(`ResetPassword.jsx`'s `VITE_AUTH_BACKEND`-aware branch, `send-password-reset-emails.mjs`)
but **never actually clicked or completed by a real human**. The user does not currently
have access to that inbox and explicitly said this specific item can be deferred for now —
it is a known, accepted gap, not a blocker for other QA work.

**Why:** the user asked to be reminded to come back to this later rather than have it
silently assumed to work. It "may work but was not physically tested" — their own words.

**How to apply:** before ever writing a go/no-go recommendation for the Supabase cutover
(see [[project-supabase-migration]] and `docs/migration/PHASE2_CUTOVER_CHECKLIST.md`
section 2 item 8 / section 6's checklist), explicitly call out that this step is still
outstanding unless the user confirms it was completed in the meantime. Do not mark
`PHASE2_CUTOVER_CHECKLIST.md`'s password-reset item as done based on the script being built
and dry-run verified alone — "built and dry-run tested" is not the same as "a real user
clicked a real link and successfully set a password," and this memory exists specifically
because that distinction matters here.
