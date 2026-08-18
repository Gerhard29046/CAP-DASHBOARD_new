---
name: technique-live-verify-password-reset-without-email
description: How to prove a Supabase password-reset/recovery flow genuinely works end-to-end in production without a browser or real inbox — reusable for any future auth-flow verification in this environment.
metadata:
  type: technique
---

Built and run successfully 2026-08-18 (`supabase/scripts/qa-verify-password-reset-flow.mjs`,
11/11 pass against production). This environment has no browser tool and no way to check a real
inbox (see [[feedback_qa_scripted_verification]] for the general pattern this extends) — this
script closes that specific gap for password recovery:

1. `admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } })` — the
   exact same server-side primitive `resetPasswordForEmail()` triggers, minus the email-send step.
2. `fetch(action_link, { redirect: "manual" })` — follow the verify link exactly as a real browser
   would, without auto-following the redirect, and read the `Location` header. This is the step
   that actually turns the one-time token into a real session; skipping it and just inspecting the
   link proves nothing about whether the mechanism works.
3. Parse `access_token`/`refresh_token`/`type` out of the redirect's URL hash fragment (this is
   exactly what the client SDK's `detectSessionInUrl` does automatically in a real browser —
   done manually here since there's no browser to run that JS).
4. `createClient(...).auth.setSession({ access_token, refresh_token })` then
   `.auth.updateUser({ password: newPassword })` — the exact call the real reset-password page
   makes.
5. **The real proof step, don't skip it**: sign in again with the OLD password (must now fail) and
   the NEW password (must now succeed) — confirms the change actually took effect server-side, not
   just that `updateUser()` returned a 2xx.
6. Also assert the redirect target in step 2 matches the real production URL (not `localhost`) —
   this incidentally proves Supabase's Site URL / Redirect URL allowlist is configured correctly,
   a separate thing that's easy to get wrong and hard to verify any other way from this
   environment.
7. Clean up the throwaway account and independently re-verify via a fresh `listUsers()` call that
   it's actually gone, matching this project's standing QA-script cleanup discipline.

Reusable for any Supabase Auth link-based flow (recovery, signup confirmation, magic link) — swap
`type: "recovery"` and the client-side call in step 4 for whatever the real flow does.
