---
name: firebase-permanently-retired
description: User issued a formal, written, PERMANENT/NON-NEGOTIABLE policy (2026-08-13) — never create, restore, or depend on any Firebase/GCP resource for CAP Dashboard's web app, ever, including for testing/convenience/missing-feature workarounds. Read before any backend/infra/auth/storage decision on the web app.
metadata:
  type: feedback
---

The user posted a full written policy document titled "CAP DASHBOARD — PERMANENT FIREBASE
RETIREMENT & ARCHITECTURE RULES" (2026-08-13, explicitly "Status: PERMANENT / NON-NEGOTIABLE").
Full text lives in the conversation and is summarized in `docs/ai-memory/DECISIONS.md`'s
2026-08-13 entry — this memory is the behavioral instruction, that file is the audit record.

**The rule, in one line:** for the web app, never create/restore/extend anything Firebase or
GCP (Firestore, Firebase Auth, Firebase Storage, Cloud Functions, Firebase Hosting, GCP
billing, `firebase`/`firebase-admin` deps, Firebase env vars/credentials) — not as a fallback,
not temporarily, not for a quick test, not because old Firebase code/infra still exists in the
repo. The authoritative stack is Cloudflare Workers + Supabase (Auth/Postgres/RLS/Storage/Edge
Functions) exclusively.

**Why:** explicit user policy to eliminate unexpected/unnecessary Google/Firebase billing
dependency risk — same root motivation as [[project_supabase_migration]]'s cutover and the
Google Calendar removal, now made a standing rule rather than a one-off decision. The user was
explicit that a missing feature, failed test, or deployment problem does NOT constitute
authorization to reach for Firebase — if something seems to need Firebase, stop and report the
gap rather than implement it or auto-enable GCP billing.

**How to apply:** Before any new backend/data/auth/storage/function work on the web app
(`frontend/`, `workers/`, `supabase/`), default to Supabase or Cloudflare Workers. Never
`npm install firebase`/`firebase-admin` again, never write a new Firestore read/write, never
spin up a new Firebase Cloud Function, never create Firebase test users/documents even as
throwaway QA data (use Supabase test users/records instead, per
[[feedback_qa_scripted_verification]], and clean up fully afterward). If existing Firebase
code/infra is found during a task, report it — don't extend it, don't assume it should stay,
don't quietly leave it either without flagging.

**Mistake actually made, corrected the same session (2026-08-13, later that day) — don't
repeat this**: after this policy was recorded, Queen Bee kept reporting the `dashboardNotes`
sticky-notes feature as blocked on "GCP billing disabled, user needs to re-enable it and
redeploy Cloud Functions" — twice, in two separate turns, despite this memory already
existing. That is *exactly* the forbidden move (section 9 of the policy: never enable/depend
on paid Google services to unblock development). The user had to correct this sharply
("stop this is your last warning"). **The actual correct move, every time a Firebase/GCP
blocker comes up**: treat it as a sign the Firebase dependency itself needs removing, not as
something the user needs to pay to unblock.

**Follow-up, same day: `dashboardNotes` went through two designs before landing on the right
one.** First fix: migrated hosting off Firebase Cloud Functions to a Cloudflare Worker. Then,
when the user asked "can Dashboard Notes safely use Supabase Auth + RLS directly?", re-
investigating found the ORIGINAL premise (the migration's own comment: "Postgres RLS alone
can't express creator-or-admin") was simply wrong for this codebase — `public.is_admin()`
already existed and was already the exact pattern used for this everywhere else. Final design
(user-approved, `supabase/migrations/0023_dashboard_notes_direct_rls.sql`): direct Supabase
Auth + RLS, no server-side service of any kind — the Worker was deleted too. **Generalize
both lessons**: (1) when a feature reports a Firebase/GCP-shaped blocker, the default response
is "how do I remove this Firebase dependency," not "here's what you need to enable"; (2)
before accepting "this needs a server-side service" as a given (inherited from an old
comment, an old design, or Queen Bee's own earlier work in the same session), actually check
whether existing RLS primitives (`public.is_admin()`, `public.has_permission()`) already
solve it — this schema solves "creator or admin" and similar rules via RLS everywhere else,
so a server-side service should be the exception, not the default.

**RESOLVED (2026-08-13, same day, later still)**: the Android-scope question above was
answered — the user explicitly authorized a **separate** Android→Supabase migration project
(not by extending this web policy's original text, but as its own standalone, phased
authorization with an A-J phase structure). See [[project_android_supabase_migration]] and
`docs/android/ANDROID_SUPABASE_MIGRATION.md`. `mobile-android/` is no longer a settled
"stays on Firebase" exception — it's now an active migration target, currently at Phase B
(mapping + navigation foundation done, Phase C/authentication not yet started, gated on
review). Keep applying this file's core lesson (prefer RLS over a new server-side service,
never re-enable a Firebase/GCP dependency to unblock something) to Android work too as it
proceeds.

**This memory should not be treated as historical/decaying** the way most `project`-type
migration-status memories here are — it's a `feedback`-type standing behavioral constraint
that overrides any older, looser framing that might still exist elsewhere (e.g. if
`AGENTS.md` or an older doc is ever found describing Firebase as an active option, that doc is
wrong, not this rule).
