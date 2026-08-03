---
name: project-supabase-migration
description: Firebase-to-Supabase migration is in progress, phased, Phase 0 done as of 2026-08-03 — check current phase before assuming Supabase is live or that Firebase was removed.
metadata:
  type: project
---

CAP Dashboard is migrating from Firebase to Supabase (user-requested, 2026-08-03), but this
is a live production app (real Firebase Auth users, real Firestore business data, a real
live-tested Google Calendar OAuth connection — see `docs/ai-memory/PROJECT_STATE.md`
2026-07-24 entry) — so the migration is deliberately phased, not a one-shot cutover.

**Why:** The task brief that kicked this off assumed a greenfield migration (generic
vehicle/invoice schema, invented agent roles like "Database Agent"/"Security Agent" that
don't exist in this repo's `.claude/agents/`) and asked to delete Firebase outright. Neither
matched reality: the real domain is machine-servicing (clients → sites → machines → service
records/job cards, see `frontend/src/api/apiClient.js`), and the only real worker bees
(`android-ui-bee`, `integration-sync-bee`, `testing-bee`) are Android-only per their file
ownership rules — none can touch `frontend/`, `backend/`, or Firebase config. This work has
to be done directly by Queen Bee, sequentially.

**How to apply:** Before doing anything with this migration, re-check
`docs/ai-memory/PROJECT_STATE.md`'s "Firebase -> Supabase migration" entry and
`docs/ai-memory/ROADMAP.md`'s matching entry for the current phase — Phase 0 (schema +
inert scaffolding, done 2026-08-03) does not mean any Supabase code is wired in. Do not
assume progress continued between sessions; verify by checking whether `AuthContext.jsx` /
`apiClient.js` still import from `@/lib/firebase` (Firebase still active) vs.
`@/services/supabase/*` (would indicate a real cutover happened). Phase 2 (actual auth/data
cutover, Firebase removal) is destructive/irreversible-ish and requires explicit user
approval per CLAUDE.md section 12 — never assume it was silently approved.

Supabase project: name `CAPDATABASE`, ref `cjvrquipmnoihksijful`. Keys live only in
gitignored `frontend/.env` (publishable/anon) and `supabase/.env` (secret, server-side
only) — never in committed files. Both keys were pasted into chat during the 2026-08-03
session; the secret key should be rotated once migration tooling stabilizes.

**Workflow constraint (2026-08-03):** the user will NOT provide a Postgres connection
string or grant direct DB access. All schema/RLS/storage-bucket work must ship as `.sql`
files under `supabase/migrations/` for the user to run manually via the Supabase SQL
Editor — Queen Bee cannot execute or verify them directly. This means migration files
must be gotten right in one shot (no live iteration against the real project); always
re-review a migration file fully before telling the user it's ready to run. Currently
`0001`-`0005` exist, none have been confirmed run yet. Phase 2 (actual app cutover) is
gated on the user confirming those migrations succeeded — don't start Phase 2 work
without that confirmation even if other Phase 1 items (service layer, frontend scaffolds)
are done.

**Recurring tooling artifact:** the Ruflo/Claude Flow `.claude/helpers/auto-memory-hook.mjs`
tooling appears to create spurious 0-byte files at the repo root/`frontend/` matching
capitalized words recently written in responses (seen: `,+`, `functions/Postgres`,
`frontend/Postgres`, `frontend/where(field`, plus a duplicate `frontend/.claude/`
tooling-cache dir). None of these are intentional writes. Check `git status --short` for
stray untracked junk before ending any session touching this repo and delete anything
that's clearly a 0-byte/garbage artifact, not just Supabase-migration sessions.

The Firestore->Postgres migration script
(`supabase/scripts/migrate-firestore-to-postgres.mjs`) is being built out incrementally
but deliberately never executed — it needs Firebase Admin credentials the user said
they'll provide "later when we are ready to migrate production data." Don't ask for
those credentials proactively; wait for the user to raise it.
