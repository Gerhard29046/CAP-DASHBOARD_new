---
name: project-ruflo-statusline-dashboard-investigation
description: Why the Ruflo/Claude-Flow "swarm/hooks/memory/ctx/time" statusline dashboard may not render on this machine — root cause is a missing plugin marketplace, not a broken script
metadata:
  type: project
---

Investigated 2026-08-14 after the user reported "still not showing the bar dashboard" —
clarified to mean the Ruflo/Claude-Flow statusline row (Swarm/Hooks/🧠/💾/ctx/⏱ time), not
anything in the CAP Dashboard web/Android app.

**The script itself is not broken.** `node .claude/helpers/statusline.cjs` (and the same
invocation with piped non-TTY JSON stdin matching what Claude Code sends — model name,
context_window.used_percentage, cost) both produced correct 2-3 line ANSI output with no
errors, no hang. `.claude/settings.json`'s `statusLine.command` config is syntactically
correct and points at the right file.

**Real, concrete finding — the "ruflo" plugin marketplace this project's `.claude/
settings.json` depends on is not actually installed on this machine:**
- Project `.claude/settings.json` → `enabledPlugins`: `ruflo-core@ruflo`,
  `ruflo-swarm@ruflo`, `ruflo-rag-memory@ruflo`, `ruflo-neural-trader@ruflo` (all `@ruflo`
  marketplace).
- Global `~/.claude/settings.json` → `extraKnownMarketplaces` only lists
  `claude-code-plugins` (the official anthropics repo) — **no `ruflo` marketplace entry at
  all**, and global `enabledPlugins` only has `frontend-design`/`figma`.
- Global `~/.claude.json` → `installedPlugins`/`enabledPlugins` are both empty `{}`.
- `~/.claude/plugins/marketplaces/ruflo` directory **does not exist** on disk.
- So every `Swarm`/`Hooks`/`🧠`/`💾` number the statusline shows (confirmed live: `Swarm
  0/15`, `Hooks 16/16` [a static count of configured hook entries in settings.json, not
  proof anything ruflo-specific ran], `🧠 0%`, `💾 5MB` [literally the tiny script's own
  `process.memoryUsage().heapUsed`, the local-fallback path]) is backed by
  `buildLocalFallback()`/local overlays, not a real running swarm/plugin — there is no real
  ruflo install behind it on this machine to source real data from.
- Whether an `enabledPlugins` reference to an unregistered marketplace can make Claude Code
  skip the REST of that settings.json (including the unrelated `statusLine` field) was not
  confirmed — no way to inspect Claude Code's internal settings loader from here. Flagged as
  the leading hypothesis, not a certainty.

**Ties into an already-repeatedly-flagged pattern** (see prior KNOWN_ISSUES.md entries
2026-08-05/07/12 about recurring 0-byte Ruflo/Claude-Flow tooling artifacts, and a duplicate
`frontend/.claude/agent-memory/queen-bee/` copy) — this tooling has never cleanly "taken" as
a real install on any machine this project has been worked from so far.

**RESOLVED 2026-08-14, same session — user chose "install it for real":**
- `claude plugin marketplace add ruvnet/claude-flow` → registered correctly as marketplace
  name `ruflo` (npm packages `ruflo`/`@claude-flow/cli` both point at
  `github.com/ruvnet/claude-flow`, confirmed via `npm view ... repository.url` first, not
  guessed) — matches the `@ruflo` suffix the project's `enabledPlugins` already expected.
- `claude plugin install <name>@ruflo -s project -y` run for all 4:
  `ruflo-core` (0.2.6), `ruflo-swarm`/`ruflo-rag-memory`/`ruflo-neural-trader` (0.2.1 each) —
  `claude plugin list` confirms all 4 now `Status: ✔ enabled`, `Scope: project`.
- **Real, verified effect**: `node .claude/helpers/statusline.cjs` now resolves `RUFLO_VERSION`
  as `3.38.9` (was the hardcoded fallback `3.32.8` before install) — proof the script now finds
  a real local install via `getPkgVersion()`'s candidate scan, not just the baked default.
  `Swarm`/`Hooks`/`🧠`/`💾` still read `0/15`/`16/16`/`0%`/`5MB` in this one-off manual probe —
  expected, not a failure: this Bash-tool invocation runs outside Claude Code's actual runtime,
  so there's no live swarm/hook activity for it to report yet.
- The plugin installer **rewrote `.claude/settings.json`** (key reordering + added a trailing
  newline) as a side effect of `claude plugin install`, confirmed via `git diff` to be a pure
  reformat — every value (statusLine command, the same 4 enabledPlugins, all hooks, permissions,
  env, `agent: "queen-bee"`) is byte-identical in content, nothing lost or changed semantically.
  Left uncommitted (working tree), same as it was before — not committed without being asked.
- **Likely still needs a session restart** to take full effect — Claude Code loads
  plugins/settings at session start, so this already-running session probably won't show live
  hook/swarm activity until the user starts a fresh `claude` session. Not independently
  confirmed (would require ending this session to test).
