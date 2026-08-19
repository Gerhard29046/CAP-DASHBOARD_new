---
name: technique-flex-grid-min-width-auto-overflow
description: Flex/grid items default to min-width:auto (won't shrink below unbreakable content), a recurring real horizontal-overflow bug source on phones — always check `truncate`/long-string containers have min-w-0 up the ancestor chain.
metadata:
  type: project
---

CSS flex items AND CSS grid items both default to `min-width: auto`, meaning the browser won't
shrink them below their content's min-content width — which, for anything using `truncate`
(`white-space: nowrap`) or otherwise containing an unbreakable string (a long email/name used as
a greeting fallback, a long unbroken word), equals that content's full single-line width. If
ANY ancestor in the flex/grid chain lacks `min-w-0` (or isn't otherwise constrained), that
unbreakable width silently propagates up and can force the entire row/column — and therefore
`document.documentElement.scrollWidth` — wider than the viewport. `truncate` alone, without
`min-w-0` somewhere up the chain, does NOT reliably clip anything.

**Why: found real, twice in one file** (`frontend/`, 2026-08-19, via
[[technique_playwright_real_ui_validation]], reproduced with real production data — 647 real
clients, real service-record descriptions):
- `AppLayout.jsx`'s `<main className="flex-1 ...">` (a flex item of the sidebar/main row) had
  no `min-w-0` — any long greeting/email anywhere on any page could force the whole row wider
  than the viewport.
- `Dashboard.jsx`'s `<div className="grid lg:grid-cols-2 ...">` panels — the CSS Grid analog of
  the exact same bug, triggered by a real, long `truncate`d service description.

**How to apply**: whenever adding `truncate` (or any `white-space: nowrap`) to text that could
plausibly be long/unbreakable (names, emails, descriptions, free-text fields), trace every
ancestor up to the nearest non-flex/non-grid block and confirm each flex/grid item in that chain
has `min-w-0` (or `overflow` other than visible, which auto-computes min-width to 0 per spec).
Don't assume `truncate` alone is sufficient — verify with a real narrow-viewport browser render,
not just a lint/build pass, since this class of bug is invisible to both.
