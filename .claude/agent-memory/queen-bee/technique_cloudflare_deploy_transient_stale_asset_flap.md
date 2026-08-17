---
name: technique-cloudflare-deploy-transient-stale-asset-flap
description: Cloudflare Workers Static Assets deploy for capdashboard intermittently serves a mix of old/new asset hashes for 1-2 minutes after a successful deploy — how to detect it for real and confirm convergence rather than trusting the CLI's own success message.
metadata:
  type: technique
---

Confirmed twice now (2026-08-16 overnight, 2026-08-17 night) on the `capdashboard` Cloudflare
Worker (`frontend/`, Workers Static Assets, not Pages): immediately after a `wrangler deploy`
that reports success, the live site can serve **inconsistent** asset-hash combinations across
consecutive requests to the same URL for roughly 1-2 minutes — not just old-vs-new, but
sometimes a third combination that matches neither the pre-deploy nor post-deploy build
(2026-08-17: a JS bundle whose only difference from the correct build was one embedded
static-asset hash reference, `optimaoutline-vxfUIDGc.svg` vs `-CFA3pTYI.svg` — same byte size,
genuinely different content, confirmed via `cmp`, not a caching illusion).

**This is real platform behavior, not a shell/local-caching artifact** — confirmed via
`CF-RAY`/`CF-Cache-Status` response headers (different edge POPs/cache states disagreeing) and
a byte-level `cmp` between the locally-built file and the live-fetched one. Don't dismiss a
"the hash looks wrong" observation as just `curl`/DNS/browser caching without checking headers
first, especially on this machine which also has a separate, unrelated TLS-interception
confound (Avast — see `project_android_gradle_tls_avast_resolved.md`) that could otherwise be
blamed instead.

**How to detect and resolve, in order:**
1. After `wrangler deploy` reports success, don't stop there. Fetch the live `index.html` with
   `Cache-Control: no-cache` several times in a row (5-8x, a few seconds apart) and extract the
   referenced `assets/index-*.{js,css}` hashes each time. If they're not 100% consistent across
   all requests, the deploy hasn't converged yet.
2. `wrangler deployments list` — confirm which version is at 100% traffic. A second,
   unexplained deployment entry appearing 1-2 minutes after your own (different Version ID, you
   didn't run `wrangler deploy` again) is part of this same phenomenon, not a rogue actor or a
   second agent deploying behind your back — don't waste time investigating who did it.
3. Re-run `wrangler deploy`. If it reports "No updated asset files to upload," that confirms
   your build's asset set is already correctly registered — the flap is purely a
   serving/propagation-consistency issue, not a wrong-content-was-uploaded issue.
4. Poll again with `Cache-Control: no-cache` until 6+ consecutive requests agree.
5. Final proof, not just "the hash looks right": download the live-served JS bundle and `cmp`
   it byte-for-byte against the local `dist/` file with the matching name. A hash match plus a
   `cmp` match is real evidence; a hash match alone is enough in practice but `cmp` is what
   actually closed this out both times.

**Why:** this pattern already appeared once (2026-08-16, described in PROJECT_STATE.md as "a
transient extra deployment version briefly serving a stale bundle before a re-deploy corrected
it") and reappeared with a near-identical shape on the very next deploy. Worth expecting on
every future `capdashboard` deploy — budget a few minutes of polling before declaring a deploy
verified, don't just trust `wrangler deploy`'s own "Success!" output or a single `curl`.

**How to apply:** any time Queen Bee runs `wrangler deploy` for `capdashboard` (or any other
Cloudflare Worker in this repo using Workers Static Assets), treat the CLI's own success
message as necessary but not sufficient — always do the poll-and-`cmp` sequence above before
reporting a deploy as "live and verified" to the user. See
[[reference_cloudflare_account_mismatch]] for the separate, unrelated account-identity check
that must also pass before any deploy attempt.
