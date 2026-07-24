# Known Issues

## Verification gaps
- No build, lint, typecheck, or test suite has been run this session for any layer
  (frontend, backend, functions, Android). All statements above are from static code
  inspection only.
- Google Calendar OAuth functions are deployed (2026-07-23, project `capdatabasefb2`,
  region `africa-south1`) with secrets bound, but a real connect→consent→callback round
  trip has not yet been exercised by a user. Verify via System Settings before treating the
  integration as fully live.
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
