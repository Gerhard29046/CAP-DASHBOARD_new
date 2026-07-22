# CAP Database — Android Frontend Implementation Plan

Living document. Queen Bee updates this after every phase. Status values: `pending`, `in progress`, `done`, `blocked`.

## Absolute constraints (unchanged all phases)

No new Android project, no Firebase/API client replacement, no live database/Firestore-collection/field-name changes, no Firestore rules changes, no server/website/auth changes, no package name / applicationId changes, no fake backend records, no Google Calendar changes, no commits without explicit approval.

## Design tokens extracted from the website (source of truth)

From `frontend/tailwind.config.js` + `frontend/src/index.css` (`:root`/`.dark` — this app is dark-only already, both blocks are identical):

| Token | HSL (source) | Hex (derived) | Use |
|---|---|---|---|
| background | `222 47% 6%` | `#080C16` | Deep navy app background |
| card | `222 40% 10%` | `#0F1524` | Dark blue card surfaces |
| primary / accent / ring | `213 94% 56%` | `#2584F8` | Bright blue primary actions, active nav |
| primary-foreground | `0 0% 100%` | `#FFFFFF` | Text on primary |
| foreground | `210 40% 96%` | `#F1F5F9` | White primary headings |
| secondary | `222 30% 16%` | `#1D2435` | Secondary surfaces |
| secondary-foreground | `210 40% 90%` | `#DBE6F0` | Text on secondary |
| muted | `222 30% 14%` | `#191F2E` | Muted surfaces |
| muted-foreground | `215 20% 55%` | `#7588A3` | Muted blue-grey secondary text |
| destructive | `0 72% 51%` | `#DC2828` | Error/status red |
| border / input | `222 30% 18%` | `#20283C` | Thin blue-grey borders |
| radius | `0.75rem` | `12dp` | Card/button corner radius (scaled down to `md`/`sm` for smaller elements, matching the site's `calc(var(--radius) - 2px/4px)`) |
| font | Inter | — | Website uses Google Fonts "Inter"; Android will use the system default (Roboto) for Phase 1 to avoid adding a font-loading dependency — flagged as a later "nice to have", not a blocker. |

## Phase status

| # | Phase | Status | Notes |
|---|---|---|---|
| 1 | Theme + app shell (Color/Type/Shape/Spacing, reusable components, scaffold, top bar, bottom nav skeleton, loading/empty/error states, nav routes) | done | 15 new files under `ui/{theme,components,navigation}/`; `MainActivity.kt`'s ad-hoc `CapTheme`/`Dark` replaced with the new `ui.theme.CapTheme` (Queen Bee, single import + deletion). Verified: `assembleDebug` + `testDebugUnitTest` both pass independently (testing-bee), 4/4 unit tests green, only pre-existing unrelated warnings. |
| 2 | Login and session | done | `LoginScreen` restyled with `CapCard`/`CapTextField`/`CapPrimaryButton`, added password-visibility toggle (pure UI state). `AuthRepository`/`login()` untouched. Queen Bee fixed a pre-existing bug the bee flagged: `CapApp`'s loading check conflated "restoring session" with "submitting login", which made the new inline button spinner unreachable — added a distinct `sessionRestored` flag (no change to auth logic). Verified: compileDebugKotlin + testDebugUnitTest both pass. |
| 3 | Mobile dashboard | done | Rebuilt with profile header (`CapUserAvatar`/name/role/email), 2-column `CapStatCard` grid (Clients/Machines/Open Jobs/Due Services, all derived from already-loaded `RecordsState`, no new reads), quick-actions row (visually present, intentionally inert with TODOs — no NavHost/Log-Service/Book-In screens exist yet), Upcoming Services list (`CapListItem`, same "due" predicate as `CalendarScreen`), Recent Clients restyled. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 4 | Clients + client details | done | `ClientsScreen` restyled (`CapSearchField`, `CapListItem` rows, `CapEmptyState`); new `ClientDetailScreen` (contact info, address/notes only if populated, machines with existing `MachineDialog` reused, recent service records, open jobs) shown via local state (no `NavHost` yet — same pattern as `AdaptiveShell`). Existing `ClientDialog`/`MachineDialog`/`save` wiring untouched. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 5 | Machines | done | `MachinesScreen` restyled (`CapSearchField`, `CapListItem`); new `MachineDetailScreen` (client name, serial/type/refrigerant, service history, derived last/next-service dates — no invented fields; `installation_date`/warranty/status rows omitted since they don't exist in the current schema). Existing `MachineDialog`/`save` reused for create+edit. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 6 | Upcoming services | done | `CalendarScreen` (was already the due-list screen) enhanced: search, grouped by due date, overdue/due-soon/upcoming `CapStatusBadge` (string date compare, same convention as existing `ServiceDialog`), technician shown where present, edit via existing `ServiceDialog`. |
| 7 | Service records | done | `ServicesScreen` restyled (search, `CapListItem`); new shared `ServiceRecordDetailScreen` (existing fields only — no notes/photo fields exist for service records, correctly omitted rather than invented). Existing `ServiceDialog`/`save` reused. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 8 | Jobs + job details | done | `JobsScreen` restyled (search, `CapListItem`, status→tone mapping over the 5 existing statuses only); new `JobDetailScreen` (existing fields only — confirmed no aspirational fields from stale `docs/mobile/*` planning docs were added, e.g. no accessories/arrival-condition/quotation/invoice/labour/parts). Existing `JobDialog`/`save` reused. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 9 | Log new service | done | New `LogNewServiceScreen` (scrollable form, existing `service_records` fields only), reachable from the Dashboard quick action via a `selected`-state pseudo-route (no NavHost yet). Real duplicate-submit/completion detection via an `actionMessage` transition watch (independently verified, no fake spinner-delay). "View Jobs"/"View Clients" quick actions wired too as a natural extension of the same mechanism. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 10 | Book in machine | done | New `BookInScreen` — creates a `job_cards` record using only its 6 existing fields (job_number auto-generated same as `JobDialog`, status hardcoded `"Booked In"`); the richer book-in fields the user described (accessories, arrival condition, quotation, notes) don't exist in the schema yet and were correctly left out rather than invented. Same duplicate-submit pattern as Phase 9, wired from the Dashboard quick action. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 11 | Machine knowledge base | done | New `KnowledgeBaseScreen`/`KnowledgeBaseDetailScreen` using the website's real field names (verified against `frontend/src/pages/KnowledgeMachineDetail.jsx` etc. — `manufacturer`/`model_name`/`variant`/`product_code`/`supported_refrigerants`/`technical_specifications`/`main_functions`/notes/media/documents/service codes). Notes creation reuses existing generic `save()`. Service-code "reveal" is a local UI mask only (matches website — Firestore rules are the real gate, not the reveal button). Photo/document **upload** correctly left out — no Storage integration exists in `Core.kt` yet; flagged as a prerequisite for `integration-sync-bee` in a future phase. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 12 | More, account, logout | done | Real bottom-nav restructure: 4 destinations (Home/Clients/Jobs/More) via Phase 1's `CapBottomNavigation`/`CapAppScaffold`/`CapTopAppBar`, replacing the old dropdown-menu + tablet `NavigationRail` (rail dropped deliberately — spec doesn't ask for one, documented in code comment). New `MoreScreen`/`AccountScreen`/`LogoutConfirmDialog`, all permission keys reused unchanged. **Queen Bee caught and fixed a regression**: the bee's first pass dropped the existing "Users" (admin management) screen entirely — it wasn't in the requested More-menu list, but it was reachable before this phase and had no replacement path; added it back into the More screen's Resources group, gated by the existing `users.view` permission, unchanged elsewhere. Verified: compileDebugKotlin + testDebugUnitTest pass. |
| 13 | Connection and Sync Status (finalize) | done | `integration-sync-bee` added the exact 9 required error messages via a new `connectionUserMessage()` (login flow's `userMessage()` left untouched), plus honest `pendingOperations`/`failedOperations` signals to `GlobalStatus` (no fake queue — this app has no offline write queue, so pending is always truthfully 0). `android-ui-bee` restyled `StatusScreen` with the design system and added Current Account/User Role/Pending/Failed Ops/App+Build Version/Environment rows, all from already-available data. Independently verified diffs for both. |

## Final verification (all 13 phases)

`gradlew.bat clean assembleDebug testDebugUnitTest lintDebug` — all 4 tasks **BUILD SUCCESSFUL**. 4/4 unit tests pass. Lint: **0 errors**, 28 warnings, all pre-existing/environmental (dependency-version bumps available, missing app launcher icon) — the only 2 warnings the rebuild itself introduced (`ModifierParameter` ordering in `CapCards.kt`/`CapScreenChrome.kt`) were found and fixed directly (parameter reorder + 4 call-site updates), reverifying to 0 new warnings.

**Regression caught and fixed during review:** Phase 12's first pass silently dropped the existing "Users" (admin management) screen from all navigation — added back into the More screen, gated by the pre-existing `users.view` permission.

**Known gaps, explicitly out of scope (not silently skipped):**
- No NavHost/real back-stack yet — all new screens use local-state pseudo-routing (same pattern throughout, consistent and working, but a real `Navigation-Compose` graph using Phase 1's `CapNavRoutes` would be a natural next step).
- Knowledge Base photo/document **upload** is not implemented — `Core.kt` has no Firebase Storage integration; only existing entries can be viewed/opened. Needs `integration-sync-bee` to add a Storage upload method first.
- Job Card / Book In forms intentionally only use the 7 fields that actually exist in the `job_cards` schema today — the richer fields some stale `docs/mobile/*` planning docs describe (accessories, arrival condition, quotation, invoice, labour/parts totals) don't exist in Firestore yet and were correctly not invented.
- No new automated UI/Compose tests were added for the 13 phases of new screens — only the pre-existing `SyncResourcesTest.kt` (pure logic) grew by one case (Phase 1's `ConnectionTestResult`). Real device/emulator testing per `docs/android/android-device-test-checklist.md` is still pending, as planned.

## Still not done: runtime device testing

Everything above is compile-time verified only. No emulator/device testing has occurred (none was available, and per instructions this build proceeded without it). See `docs/android/android-device-test-checklist.md` for the steps to run once you connect a phone in Android Studio.

## Architectural note on file structure

The existing app is intentionally minimal: 3 Kotlin files (`CapApplication.kt`, `Core.kt`, `MainActivity.kt`) hold everything. The requested target structure (`core/`, `data/`, `ui/{components,navigation,screens,theme}`) will be built incrementally:
- **New code** (theme, reusable components, new screens) goes directly into the target structure from Phase 1 onward.
- **Existing working code** in `Core.kt` (repositories, models, Hilt module) and `MainActivity.kt` (ViewModel, existing screens) is migrated into the target structure gradually, phase by phase, as each area is rebuilt — not moved in one large risky rewrite. This avoids a big-bang refactor that could silently break the working Firebase integration.
- Physical directories follow the existing (pre-existing, harmless) convention: files live under `app/src/main/java/za/co/connoisseurauto/capmobile/...` even though the declared `package` is `com.CAPDATABASE.capdatabase...` — this mismatch predates this task and is left alone per the "don't change package name" rule; it's a folder-naming quirk, not a package rename.
