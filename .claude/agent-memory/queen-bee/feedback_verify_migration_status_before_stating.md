---
name: feedback-verify-migration-status-before-stating
description: Never tell the user a migration is "not applied yet" from memory/KNOWN_ISSUES.md alone — always run (or write) a live qa-check-00XX-applied.mjs script first. User got angry (2026-08-19) when told to apply a migration they'd already run.
metadata:
  type: feedback
---

Never state a migration's applied/not-applied status as current fact based on
`docs/ai-memory/KNOWN_ISSUES.md`/`PROJECT_STATE.md` alone — those files are snapshots and go
stale the moment the user applies something via the SQL Editor without telling this session.

**Why**: told the user migration 0031 was "not applied, needs the SQL Editor" purely from a
stale memory entry, without checking. The user had already applied it. They were, correctly,
angry: "i already did the fkn migration why dont you check that yourself before telling me i
need to do it." This is the exact same "before recommending from memory" rule already binding
generally, but this repo hits it specifically and repeatedly on migration status because
applying migrations is the one class of action only the user can perform (Queen Bee/agents
cannot run DDL directly here), so memory drifts out of sync with reality constantly and
silently.

**How to apply**: before telling the user any migration needs applying, or reporting one as
"still not applied" in a status summary, either (a) check if a `supabase/scripts/qa-check-00XX-
applied.mjs` script already exists and run it, or (b) write one on the spot (cheap — every
migration either adds a checkable column/table via `.from(table).select()`, or, for a
trigger-only migration like 0031, do a real throwaway insert/update and check the resulting
row, then delete and confirm gone). This is fast (seconds) and cheap — there's no excuse to
skip it before making a claim the user can immediately falsify from their own memory of what
they did. See [[technique_playwright_real_ui_validation]] for the same "verify live, don't
relay stale state" discipline applied to a different layer.
