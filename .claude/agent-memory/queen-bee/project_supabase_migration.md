---
name: project-supabase-migration
description: Web client fully cut over to Supabase in production as of 2026-08-13 (Firebase deleted from frontend/AuthContext; the last server-side service, dashboardNotes, moved to direct Supabase RLS same day, migration 0023 applied+live-verified). Android is now ALSO migrating to Supabase, as a separate explicitly-authorized project (see project_android_supabase_migration.md) — no longer a settled "stays on Firebase" exception. Always re-check PROJECT_STATE.md's latest dated entry before assuming further progress.
metadata:
  type: project
---

CAP Dashboard's web client (`frontend/`) migrated from Firebase to Supabase (user-requested,
started 2026-08-03) and **the cutover is complete and live in production as of 2026-08-13**
— this is no longer "in progress." Explicit user override that session: "get every single
thing off firebase... this is not live data... i override you now... do the cutover now."

**Current true state (verify against `docs/ai-memory/PROJECT_STATE.md`'s top entry, which is
the authoritative detailed record — this file is only an orientation pointer):**
- `frontend/src/lib/firebase.js` was deleted; the `firebase` npm package was removed;
  `AuthContext.jsx`/`apiClient.js` are Supabase-only now, no Firebase branch to fall back to.
  A real production build was deployed to Cloudflare and verified to contain zero Firebase
  code, with a real throwaway-account login + full CRUD cycle verified against production
  Supabase.
- **No Firebase Cloud Functions exist at all anymore** (`functions/` was deleted entirely
  2026-08-13) and **no server-side service of any kind fronts `dashboard_notes` either** — a
  same-day Cloudflare Worker built to replace the retired Cloud Function was itself deleted
  hours later once direct Supabase RLS (`public.is_admin()`, already used everywhere else in
  this schema) was confirmed to work for "creator or admin" without one. See
  [[firebase_permanently_retired]] for the two-mistakes-in-one-day lesson this produced.
- **Android (`mobile-android/`) is no longer a settled "stays on Firebase" exception** — a
  separate, explicitly-authorized migration to move it onto Supabase too started 2026-08-13.
  See [[project_android_supabase_migration]] for current phase/status; check that file
  before assuming Android is still fully on Firebase OR that it's already been migrated —
  it's a multi-phase, in-progress effort.
- **Old Firestore/Firebase Auth data was NOT deleted** — just no longer read by the web
  client. Whether to archive/delete that data or its GCP project is the user's separate
  decision, not made as part of the cutover.
- **Google Calendar sync was removed entirely on 2026-08-12** (separate user cost decision,
  unrelated to the Supabase cutover itself) — see `[[project_supabase_calendar_401_bug]]`
  (now moot) and `docs/ai-memory/DECISIONS.md`.
- As of 2026-08-13 (UX/UI redesign phase, resumed post-cutover), some newer migrations may
  still be unapplied — check `docs/ai-memory/KNOWN_ISSUES.md`'s top entries for the exact
  current list (was `0018`-`0021` at last check) before assuming a Settings/catalogue/
  photo-upload/Job Card feature is live just because the code is merged.

**Workflow constraint (still true, unchanged since 2026-08-03):** the user will not provide
a Postgres connection string or grant direct DB access. All schema/RLS/storage-bucket work
ships as `.sql` files under `supabase/migrations/` that the user runs manually via the
Supabase SQL Editor — Queen Bee cannot execute or verify DDL directly, only prepare files and
verify effects afterward via read-only scripts (`supabase/scripts/qa-*.mjs`).

Supabase project: name `CAPDATABASE`, ref `cjvrquipmnoihksijful`,
`https://cjvrquipmnoihksijful.supabase.co`. Keys live only in gitignored `frontend/.env` and
`supabase/.env` — never in committed files. The secret (service_role) key was pasted into
chat once during the original 2026-08-03 session; check `KNOWN_ISSUES.md`/`DECISIONS.md` for
whether it's since been rotated before assuming the old value is still valid.

**Recurring pattern that has worked well across many sessions:** before any real `--apply` or
trusting a new feature is production-ready, spot-check real data field-by-field against the
schema/mapper (caught 5+ real schema gaps historically), and prefer scripted QA
(`supabase/scripts/qa-*.mjs` against a throwaway test user, full residual-data cleanup after)
since this environment has no browser automation tool — see
`[[feedback_qa_scripted_verification]]`.

**Recurring tooling artifact:** the Ruflo/Claude Flow `.claude/helpers/auto-memory-hook.mjs`
tooling has repeatedly created spurious 0-byte junk files (root/`frontend/`/`supabase/`,
matching capitalized words recently written in responses) and duplicate `.claude/` cache
dirs, including once a real substantive memory file written to the wrong path
(`frontend/.claude/agent-memory/...` instead of the repo root) that had to be found and
merged later. Check `git status --short` for stray untracked junk or misplaced memory files
at the end of any session touching this repo.
