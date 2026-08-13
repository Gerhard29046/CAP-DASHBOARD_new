---
name: reference-cloudflare-account-mismatch
description: This ("home") machine's wrangler CLI is logged into a different Cloudflare account than the one hosting CAP Dashboard's live production site — verify with `wrangler whoami` before attempting any Cloudflare deploy, don't assume it'll reach the right place.
metadata:
  type: reference
---

Confirmed 2026-08-13: `npx wrangler whoami` in this repo's environment shows the account
`gerhard.ark.of.war@gmail.com`. Production is `capdashboard.gerhardvanwijk.workers.dev`,
implying a `gerhardvanwijk@gmail.com`-owned account (a different Google/Cloudflare account
from the login shown by `wrangler whoami`, though visually similar). Confirmed via a real
probe, not just inference: `npx wrangler deployments list` for the **already-live**
`capdashboard` worker itself fails with `This Worker does not exist on your account [code:
10007]` under these credentials — same failure a brand-new, never-deployed worker would give,
so this isn't "the worker needs a first deploy," it's "wrong account entirely."

**How to apply:** before any real `wrangler deploy`/`wrangler secret put`/`wrangler pages
deploy` against CAP Dashboard's actual production Cloudflare resources, run `npx wrangler
whoami` first and confirm the account matches (or ask the user to confirm which account is
correct if unsure — don't guess). A deploy under the wrong account won't just fail loudly for
an existing worker (as observed) — for a brand-new worker name it could succeed silently
under the wrong account, creating an orphaned resource nobody uses while looking like it
worked. `npx wrangler login` can switch accounts interactively if the user provides the
correct login in this environment.

Real instance this bit (2026-08-13): a Cloudflare Worker briefly built to replace the retired
Firebase Cloud Functions `dashboardNotes` endpoint was fully built and unit-tested (26/26),
confirmed to bundle correctly via `wrangler deploy --dry-run` (which doesn't touch the
account, safe to run), but could not actually be deployed because of this mismatch. Moot for
that specific case now — `dashboardNotes` was redesigned again the same day to use direct
Supabase RLS instead of any server-side service (see [[firebase_permanently_retired]] and
`docs/ai-memory/DECISIONS.md`), so no deploy was ever needed after all. **This memory itself
is not moot** — the account mismatch is a real, standing fact about this machine's wrangler
login, and will matter again the next time `frontend/` (the actual live Cloudflare Worker)
needs a real deploy from this environment.
