# Mobile UX Validation Report — Dashboard & Clients Redesign

**Date**: 2026-08-19
**Scope**: `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Clients.jsx`,
`frontend/src/components/AppLayout.jsx`, `frontend/src/components/ui/dialog.jsx`,
`frontend/src/components/StatCard.jsx`, `frontend/src/index.css`.
**Tooling**: `@playwright/test` (new devDependency, Chromium engine), run against a locally
served copy of the exact production `dist/` bundle (`vite preview`), logged in through the real
UI with a throwaway Supabase Auth QA account (created/deleted via the repo's existing
`supabase/scripts/qa-test-user.mjs`, fully cleaned up — verified gone after this session).
**Test suite**: `frontend/tests/e2e/mobile-ux.spec.js` + `frontend/playwright.config.js`
(committed, runnable any time via `npx playwright test` from `frontend/`).
**Viewports**: iPhone SE (375×667), iPhone 12 (390×844), Pixel 5 (393×851), iPad Mini
(768×1024) — all forced to the Chromium engine (WebKit binary wasn't installed in this
environment; a real Safari/WebKit run is a disclosed gap, not silently substituted).

## Result: 12/12 automated checks pass, after fixing 3 real bugs this suite found

This was **not** a rubber-stamp run. The first pass against the just-built redesign failed
outright and surfaced genuine, previously-undetected defects — exactly the value automated
device testing is supposed to provide over eyeballing a Figma mock. All three are now fixed,
verified by re-running the same suite, and are live in the codebase (not yet deployed — see
"Not done" below).

### Bugs found and fixed

1. **Sitewide horizontal padding bug** (`AppLayout.jsx`, pre-existing since the 2026-08-19
   "Phase 1" mobile-first pass, not introduced today). `.safe-area-x` (a plain CSS rule, not a
   Tailwind `@layer` utility) has identical specificity to `px-4`/`md:px-8` and compiles later
   in the stylesheet — it was silently overriding the real 16px/32px content padding down to
   `0px` on every phone without a physical notch (i.e. almost every device), on both the mobile
   header and every page's main content wrapper. Content was rendering flush against the screen
   edges sitewide. Fixed by replacing the combo with `pl-/pr-[max(<base>,var(--safe-left/right))]`
   arbitrary-value classes, which correctly compose the base padding and the safe-area inset
   instead of one silently replacing the other.
2. **Real horizontal overflow on phones** (`AppLayout.jsx`, `Dashboard.jsx`). Both flex items
   (`<main>`) and CSS Grid items (the two dashboard panels) default to `min-width: auto`, i.e.
   they refuse to shrink below their content's un-wrappable minimum width. A long value with no
   breakable whitespace — the signed-in user's greeting (falls back to email), or a genuinely
   long service description rendered with `truncate` (`white-space: nowrap`) — could silently
   force its entire row/column, and therefore the whole document, wider than the viewport.
   Reproduced with real data (a 647-row production client list, real service records) at
   393px width: `document.documentElement.scrollWidth` was 740px against a 393px viewport
   before the fix. Fixed with `min-w-0` on the affected flex/grid items.
3. **Every dialog reset scroll position to the top the instant it opened** (`dialog.jsx`,
   affects every `Dialog` in the app, not just the new Clients filter sheet). Traced via
   instrumented event/mutation-observer logging to Radix's internal focus-guard bootstrapping,
   which runs and moves focus *before* Radix's own public `onOpenAutoFocus` callback fires — so
   intercepting that specific callback is structurally too late. Fixed with a standard modal
   scroll-lock (`useDialogScrollLock` in `dialog.jsx`): freeze `<body>` in place while any
   dialog is mounted, restore the exact prior scroll position on unmount. This can't be
   defeated by whatever Radix does internally, regardless of timing.

### What the suite actually verifies (pass/fail per viewport)

| Check | iPhone SE | iPhone 12 | Pixel 5 | iPad Mini |
|---|---|---|---|---|
| Dashboard loads with zero console/page errors | ✅ | ✅ | ✅ | ✅ |
| No horizontal overflow (`scrollWidth <= clientWidth`) | ✅ | ✅ | ✅ | ✅ |
| Stat-card strip overflows horizontally + snaps on phones | ✅ | ✅ | ✅ | n/a (tablet) |
| Stat-card strip is the static grid (no overflow) on tablet | n/a | n/a | n/a | ✅ |
| Swiped cards stay fully visible (no zero-size/clipped cards) | ✅ | ✅ | ✅ | n/a |
| Clients: Filters icon button visible, inline bar hidden (phone) | ✅ | ✅ | ✅ | n/a |
| Clients: inline bar visible, Filters button hidden (tablet) | n/a | n/a | n/a | ✅ |
| Filter sheet opens as a partial bottom sheet (not full-screen) | ✅ | ✅ | ✅ | n/a |
| Closing the filter sheet preserves scroll position exactly | ✅ | ✅ | ✅ | ✅ |
| No console/page errors during the filter flow | ✅ | ✅ | ✅ | ✅ |

### Screenshots

Full-viewport screenshots were captured for both pages at every viewport
(`frontend/test-results/screenshots/`, gitignored — regenerate any time with
`npx playwright test`). Visually confirmed: the greeting now genuinely truncates with an
ellipsis instead of overflowing; content has real, visible margin from the screen edges; the
stat-card strip peeks the next card as a scroll affordance; the Clients filter sheet renders as
a real bottom sheet (rounded top, drag handle, partial height, backdrop) matching native app
UI conventions, not a shrunken desktop modal.

### Console/network health

Zero console errors and zero uncaught page errors across all 12 test runs (both pages, all
4 viewports) — captured via `page.on("console")`/`page.on("pageerror")` for the entire login →
navigate → interact flow. No `TypeError: Cannot read properties of null` or any other runtime
error was observed anywhere in this suite.

### Performance (coarse signal only, disclosed limitation)

Load time (navigate → Dashboard's greeting visible, i.e. authenticated + first meaningful
data paint) was consistently **under 2 seconds** against the local preview server across all
4 viewports during this run. This is a coarse signal, not a lab-grade metric: no throttled/
slow-network emulation was configured, and this is Chromium's headless engine, not a real
device. Treat it as "nothing is grossly broken," not a performance benchmark.

## What this report does NOT cover (disclosed gaps, not silently skipped)

- **No visual regression / Figma diffing.** No Figma mockup or prior baseline screenshot set
  exists for this app, so there is nothing to diff against. The bullet list of claims in the
  original request ("compare against expected design mockups") isn't achievable without that
  baseline existing first.
- **No WebKit/Safari run.** Only the Chromium binary was installed in this environment;
  Playwright's iOS device presets were forced onto Chromium's mobile emulation instead of real
  WebKit. iOS Safari-specific bugs (there have been real ones historically with `scroll-snap`
  and `position: fixed` + `dvh` units) are not ruled out by this run.
- **No true Cumulative Layout Shift (CLS) score.** Chromium only reliably reports the
  `layout-shift` PerformanceObserver entry type for real, non-headless paints; a genuine CLS
  number was not captured. The horizontal-overflow and scroll-jump bugs above are the concrete,
  real defects this session actually found and fixed — treat those as the substantive layout-
  stability findings, not a numeric score.
- **No production/live-URL run.** Tested against a local `vite preview` server serving the
  exact production `dist/` bundle, not the currently-deployed Cloudflare Worker (which still
  has the pre-fix bugs above until redeployed).
- **The `ceorkm/mobile-app-ui-design` GitHub repo was fetched and reviewed** (it is a Claude
  Code "Skill" — markdown design guidance, no executable code) and its principles (rounded-2xl
  cards, tinted resting shadows on mobile, 8pt spacing) were applied selectively to
  `StatCard.jsx`/`Dashboard.jsx`/`Clients.jsx`, mobile-only, with desktop left unchanged. It was
  not "installed" as a package — there is nothing installable in it.
- **`code --add-mcp '...'`** targets VS Code's own CLI (`code` = VS Code, not this Claude Code
  session) and doesn't apply here; it would not have added a tool to this session even if run.
  Real browser automation was instead obtained by installing `@playwright/test` directly as a
  project devDependency, which is what actually produced everything in this report.

## Recommendation

**Ready to ship the code fixes**, on the evidence gathered:
- `npm run lint` / `npm run typecheck` clean.
- `npm test` 76/76 (existing pure-logic suite, unaffected).
- `npm run build` clean.
- 12/12 new Playwright checks pass across 4 device profiles, after 3 real bugs were found and
  fixed by this exact process (not hypothetical — reproduced with real production data).

**Not yet deployed** — this report reflects the local build only. Recommend deploying once
you're satisfied with the report, the same way the previous redesign commit was pushed and
deployed (build → wrangler deploy → byte-level live verification).
