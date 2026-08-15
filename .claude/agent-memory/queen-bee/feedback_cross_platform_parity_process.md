---
name: feedback-cross-platform-parity-process
description: Standing process rule (2026-08-15) for every future feature request the user flags as cross-platform — read web first, then Android, compare explicitly, modify existing code, report parity. Applies to all work after this date, not just the in-flight 13-commit revamp.
metadata:
  type: feedback
---

When the user says a feature request should apply to both Android and web, follow this exact
sequence before writing any code — do not skip straight to implementing an Android version from
assumption:

1. **Read the website implementation first** — actual components, services, Supabase queries,
   database fields, permissions, routes, UI behavior. Not a summary from memory; read the current
   files.
2. **Read the Android implementation second** — what already exists for the same feature, even
   partially. Grep before assuming something is missing (this session repeatedly found real,
   precise answers this way — e.g. confirming Android has *zero* `dashboard_notes` consumers
   rather than guessing at partial coverage).
3. **Compare explicitly**: what web does / what Android does / what Android is missing / what
   Android does differently / bugs in either / whether Supabase schema already supports it.
4. **Modify existing code, don't fork a parallel version.** If Android has a partial
   implementation, extend/refactor it in place. UI doesn't need to be pixel-identical (different
   platforms, different interaction patterns) but workflow/data/permissions/fields/behavior/
   outcomes must match.
5. If the user says "both platforms," actually touch both — do not finish Android and assume web
   is already fine without checking.
6. **Supabase is the only source of truth going forward** — this reinforces [[firebase_permanently_retired]]
   but now explicitly extends the *spirit* of that policy to Android too, in the context of this
   parity work (Android's own remaining Firebase footprint is a separate, already-scoped removal —
   see [[project_android_supabase_migration]] — this rule is about not adding anything *new* on
   Firebase while that removal is still in progress).
7. **No fake features** — no mock data, decorative buttons, dead navigation, hardcoded users,
   placeholder-that-looks-functional. Matches this session's own established bar (e.g. catching
   `CapStatCard`'s missing `onClick` rather than reporting the dashboard cards as done because
   *some* cards on the screen were tappable).
8. Fix concrete bugs found in the same flow while you're there, but keep scope controlled and
   document what changed separately from the main feature.
9. **Verify the complete flow**, not just that the screen compiles: UI → state → service →
   Supabase → response → UI, including navigation, permissions, loading/empty/error/success
   states.
10. **Report parity explicitly at the end of every feature**: Website (what exists/changed),
    Android (what exists/changed), Shared backend (what was reused/changed), Parity
    (complete/partial), Verification (exactly what was tested), Remaining gaps.

**Why this matters, in the user's own framing**: this is evolving one existing product, not
building a second application beside it. The precise, verified-not-guessed findings this session
already produced (Book In's 5 missing fields, Notes' zero-consumer status, the real Firebase
footprint being just the `users` collection, `CapStatCard` having no `onClick`) are the model to
keep following — the user has shown they check these claims, so precision over confident-sounding
summaries.
