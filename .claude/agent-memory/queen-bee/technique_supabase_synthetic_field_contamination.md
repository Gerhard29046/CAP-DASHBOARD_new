---
name: technique-supabase-synthetic-field-contamination
description: Recurring bug class in this repo's Supabase PUT/PATCH handlers — client-only synthetic fields spread into save payloads cause a full PostgREST 400 (unknown column), not a partial failure
metadata:
  type: project
---

`frontend/src/api/supabaseApiClient.js`'s `withPermissionCount()` (and similar helpers) stamp
client-only, non-column fields onto records fetched for list/detail display (e.g.
`effective_permission_count`, added for a UI badge). Pages that populate an edit `form` via
`{...blank, ...fetchedRecord}` and then save via `{...form, ...extra}` will silently forward that
synthetic field into the PUT/PATCH body. PostgREST rejects the **entire** update if *any* key
doesn't match a real column — so this doesn't degrade gracefully, it breaks the whole save. This
already happened twice in `UserAdmin.jsx`'s `save()`: first with `name`/`permission_overrides`
(fixed 2026-08-16, `ed1048c`), then again with `effective_permission_count` (fixed 2026-08-17,
same file, same handler, the first fix just missed one field).

**Why the existing QA script didn't catch the second one**: `supabase/scripts/qa-verify-
useradmin-save-and-delete.mjs` claims to send "the exact payload shape UserAdmin.jsx's save()
sends" but actually hand-crafts a clean, minimal payload (`{role, is_active,
effective_permissions}`). A QA script that reconstructs an idealized payload instead of tracing
the real `form`-spread code path will pass while the real UI is still broken — don't trust a
"live-verified" QA claim for a save/update flow without confirming the script's payload
literally matches what the page's actual save handler sends (including anything spread in from a
previously-fetched record), not just the fields the feature is nominally about.

**How to apply**: when investigating "the save button doesn't work" for any Supabase-backed
admin form in this repo, check whether the edit form was populated by spreading a full fetched
record (which may carry `withPermissionCount()` or similar list-only synthetic fields) rather
than picking only the real, intentionally-editable columns. The general fix pattern is a
defensive per-table strip-list in `supabaseApiClient.js`'s PUT/PATCH branch (not just relying on
the page to send a clean payload), since the page's own `form` state is the actual contamination
source and is easy to miss piecemeal.

**Also confirmed this session**: despite Supabase MCP server instructions appearing in context,
no `mcp__supabase__*` tools were actually present in the tool list — neither for Queen Bee nor
for a `testing-bee` subagent asked to use them. Root-caused this specific bug via repository code
trace only (schema columns from migration files, not a live query) — confirmed twice
independently, same conclusion, but not live-verified against production. Check whether MCP tool
access is actually wired up before assuming it's available for the next Supabase investigation.
