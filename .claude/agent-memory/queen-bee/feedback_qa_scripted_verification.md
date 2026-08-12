---
name: feedback-qa-scripted-verification
description: No working browser-automation tool is available in this environment for this project — use scripted API/data-layer verification (throwaway admin test user + direct Supabase calls mirroring each page's real code) instead of claiming a UI click-through, and say so explicitly.
metadata:
  type: feedback
---

On 2026-08-07, asked to do a "full manual click-through" of the frontend, discovered the
`mcp__claude-in-chrome__*` browser tools described generically in the system prompt are not
actually loaded/available as callable tools in this project's session (no `ToolSearch`
function present either). Rather than fake a visual walkthrough, disclosed the limitation
to the user upfront and substituted the most rigorous verification actually available:
a script (`supabase/scripts/qa-clickthrough.mjs`, kept in the repo, untracked) that signs in
as a throwaway Supabase Auth test user and drives the exact same
`supabase.from(table).select/insert/update/delete()` calls
`frontend/src/services/supabase/database.js`/`entities.js`/`supabaseApiClient.js` make for
every page, plus a real HTTP call to the deployed Google Calendar Cloud Function with the
resulting session's access token.

**Why:** the user's approval (2026-08-07, "Proceed with Option 2") authorized creating a
temporary admin-equivalent Supabase Auth test user specifically to unblock this kind of
testing without needing the real migrated user's (still-unset) password. Being explicit
that this tests the real auth/data/RLS layer end-to-end but does NOT verify visual
rendering, navigation, or client-side JS bugs was well-received — no pushback on the
substitution, and it's what actually found a real bug (see
[[project-supabase-calendar-401-bug]]) that a superficial pass might have missed.

**How to apply:** in this repo, don't assume browser tools are available just because the
system prompt mentions them generically — check for `ToolSearch`/`mcp__claude-in-chrome__*`
tool availability first, and if absent, default to this scripted-verification approach
(throwaway test user + direct API calls mirroring real page code) rather than either
fabricating a browser session or refusing to verify at all. Always do a final residual-data
sweep after using a throwaway test user/data (see [[project-supabase-migration]] and the
qa-test-user.mjs/qa-clickthrough.mjs scripts) — one QA run this session left a second,
unexpected duplicate test user behind that only a full sweep (not just deleting the one
tracked ID) caught.
