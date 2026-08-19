---
name: technique-playwright-real-ui-validation
description: How to stand up real Playwright browser validation against this app (frontend/) using a throwaway Supabase QA account, when the user wants actual automated testing instead of manual click-through claims.
metadata:
  type: project
---

Confirmed working recipe (2026-08-19), reusable any time real UI/browser validation is needed
and no `mcp__claude-in-chrome__*` tools are practical or available:

1. `cd frontend && npm install -D @playwright/test && npx playwright install chromium` (only
   Chromium — WebKit/Firefox binaries aren't pre-installed on this machine; force
   `browserName: "chromium"` on every Playwright device preset in `playwright.config.js`, since
   the built-in iOS presets (`iPhone SE`/`iPhone 12`/`iPad Mini`) default to WebKit and will
   fail with "Executable doesn't exist" otherwise).
2. Build the real production bundle (`npm run build`) and serve it locally
   (`npx vite preview --port 4173 &`), rather than repeatedly hammering the live Cloudflare
   Worker or using the dev server (which may behave differently). Point `playwright.config.js`'s
   `baseURL` at `http://localhost:4173`.
3. Log in through the real UI (not a mocked session) using a throwaway Supabase Auth QA account:
   `cd supabase && node scripts/qa-test-user.mjs create` → prints email/password/uid. Pass as
   env vars into the Playwright run (`QA_EMAIL=... QA_PASSWORD=... npx playwright test`).
   **Always clean up afterward**: `node scripts/qa-test-user.mjs delete <uid>` then
   `verify-gone <uid>` — don't just trust the create/delete call succeeded, confirm.
4. For debugging a specific failure, write small disposable `tests/e2e/debug-*.spec.js` files
   that `page.evaluate()` DOM inspection (e.g. walk `document.querySelectorAll("body *")`
   looking for `getBoundingClientRect().right > viewportWidth`) — far faster than guessing from
   a screenshot. Delete these before committing; only the real assertion spec should ship.
5. `frontend/test-results/` and `frontend/playwright-report/` are real output but regenerable
   and large — gitignored (see root `.gitignore`), not committed. The `.spec.js` files and
   `playwright.config.js` ARE committed as a real, rerunnable regression suite.

See also [[technique_safe_area_x_padding_cascade_bug]] and
[[technique_flex_grid_min_width_auto_overflow]] — both found using this exact setup, on the
very first real run against a redesign that had already passed lint/typecheck/build/unit-test
verification. That's the whole point: those checks don't catch real-browser layout bugs.
