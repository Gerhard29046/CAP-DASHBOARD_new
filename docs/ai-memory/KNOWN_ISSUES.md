# Known Issues

## Deploy gap (2026-07-28)
- Commit `aa72fa8` (Ruflo/Claude Flow MCP tooling) exists on local `main` but is **not
  pushed** to `origin/main` — `git push` was denied by the Claude Code auto-mode
  classifier and requires the user to run/approve it directly.
- `functions/index.js`'s CORS fix (adds `PATCH` to `Access-Control-Allow-Methods`, from
  commit `25f4819`) is **not deployed** — `firebase deploy --only functions` was denied
  by the same classifier. The frontend (already deployed, version
  `5f00ef33-e00d-4f47-a84b-115df2954f3d`) now expects PATCH to work for the System
  Settings "show Google Calendar" toggle; until functions are redeployed this call will
  still fail cross-origin in production.
- Upstream `@claude-flow/cli@latest` npm package is broken (`npm error Invalid Version:`
  on install), which is why the `plugin:ruflo-core:ruflo` MCP server fails to connect
  (`claude mcp list`). The `.mcp.json`-defined `claude-flow` server (a different
  package, `ruflo@latest`) connects fine. Not fixable from this repo; either wait for
  upstream or disable `ruflo-core`/`ruflo-swarm`/`ruflo-rag-memory`/`ruflo-neural-trader`
  in `.claude/settings.json` → `enabledPlugins` if the failures are noisy.

## Verification gaps
- No build, lint, typecheck, or test suite has been run this session for any layer
  (frontend, backend, functions, Android). All statements above are from static code
  inspection only.
- Google Calendar: fully live-tested 2026-07-24, including a real connect flow and event
  sync with account `gerhard.ark.of.war@gmail.com`. No longer an open verification gap.
- Firebase reported "No cleanup policy detected for repositories in africa-south1" during
  this deploy — old container images may accumulate a small storage cost over time. Fix
  (not yet applied, low priority): `firebase functions:artifacts:setpolicy --project
  capdatabasefb2`.

## Documentation drift risk
- `AGENTS.md` still states the frontend only talks to Laravel and must never connect
  directly to Firebase/Google. This is intentionally superseded by CLAUDE.md (section 1)
  but left unedited in `AGENTS.md` itself — a future reader of `AGENTS.md` alone would be
  misled. See [[DECISIONS]] entry on this.

## Repo hygiene (not verified as intentional, not touched)
- `rename_api_client.py` and `rename_api_client_TEMP.txt` at repo root are both empty
  (0 bytes) and untracked-looking scratch files. Left in place per "do not change
  application code" scope of this setup task.

## Duplicated permission model
- Permission data is maintained by hand in two systems (Laravel tables vs. Firestore
  collections/`effective_permissions`) with no automated sync verified in this session.
  Any permission change must be checked against both per CLAUDE.md section 9.
