// Playwright config for real, automated mobile UX validation of the Dashboard/Clients
// redesign (2026-08-19). Targets a locally-served copy of the exact production `dist/`
// bundle (via `vite preview`) rather than repeatedly hammering the live Cloudflare Worker.
// Not wired into `npm test` (which stays the existing pure-logic node:test suite) --
// run explicitly via `npx playwright test`.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.QA_BASE_URL || "http://localhost:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Force Chromium for every device preset -- Playwright's built-in iOS presets default to
  // WebKit, whose browser binary wasn't installed (`npx playwright install chromium` only).
  // Chromium's mobile emulation (viewport + touch + UA override) is sufficient for layout/
  // interaction validation; a real WebKit run is a disclosed gap, not silently substituted.
  projects: [
    {
      name: "iPhone SE",
      use: { ...devices["iPhone SE"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
    {
      name: "iPhone 12",
      use: { ...devices["iPhone 12"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
    {
      name: "Pixel 5",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "iPad Mini",
      use: { ...devices["iPad Mini"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
  ],
});
