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

**Reconfirmed 2026-08-18 (Android Service Certificate parity)**: reading web's implementation
first (`serviceCertificatePdf.js`/`ServiceRecords.jsx`'s `CertificateSection`) directly surfaced a
real, live regression neither implementation bee would otherwise have known to look for — a web
migration (0029) had silently changed the *meaning* of a column (`file_url`: signed URL →
permanent path) that Android's own, unrelated Knowledge Base display code still depended on the
old meaning of. Following step 8 ("fix concrete bugs found in the same flow") caught and closed
this before it shipped as a second, separate regression. Also reconfirmed: splitting a
cross-platform feature into `supabase-android-bee` (data/storage) → hand-review → `android-ui-bee`
(UI/wiring) → hand-review → `testing-bee` (build verification), strictly sequential with Queen Bee
reading the real diff between each stage rather than delegating both halves in parallel or
trusting either bee's self-report, produced zero rework and caught one deliberate, correctly-
reasoned deviation from the brief (`company_settings`'s permission gate) that was right to keep,
not revert.
