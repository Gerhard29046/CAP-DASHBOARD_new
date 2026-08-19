---
name: technique-safe-area-x-padding-cascade-bug
description: frontend/src/index.css's .safe-area-x class silently zeroes out px-4/md:px-8 padding wherever combined on the same element — real, sitewide, found 2026-08-19.
metadata:
  type: project
---

`.safe-area-x` (`frontend/src/index.css`) is a plain CSS rule, not inside a Tailwind `@layer`
block, so it compiles AFTER every Tailwind utility (including `px-*`/`md:px-*`) in the final
stylesheet. At identical specificity (both single-class selectors), the later one wins the
cascade. Combining `safe-area-x` with any `px-*`/`pl-*`/`pr-*` on the same element means
`.safe-area-x`'s `padding-left/right: var(--safe-left/right)` (0px on virtually every device
without a real notch) silently REPLACES the intended base padding instead of adding to it.

**Why: found real, sitewide impact** — `AppLayout.jsx`'s mobile header and every page's main
content wrapper (`px-4 ... safe-area-x` / `px-4 md:px-8 ... safe-area-x`) had their real
16px/32px horizontal padding collapsed to 0 on every phone, since the 2026-08-19 "Phase 1"
mobile-first pass introduced `.safe-area-x` — undetected for a full day+ across multiple
mobile-first phases because no real browser had run against the app until Playwright testing
was set up (see [[technique_playwright_real_ui_validation]]).

**How to apply**: never write `className="... px-4 ... safe-area-x ..."`. Use
`pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))]` (adjust the base value per
breakpoint, e.g. `md:pl-[max(2rem,var(--safe-left))]`) instead — this composes correctly
regardless of cascade order. `.safe-area-x` alone (no competing padding utility on the same
element, e.g. `MobileBottomNav.jsx`'s nav bar) is fine as-is. Check any NEW `safe-area-x` usage
for this exact combo before shipping it.
