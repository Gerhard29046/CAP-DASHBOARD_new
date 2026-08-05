-- Fixes a real schema gap in the 4 knowledge-base sub-collections, deferred since
-- 2026-08-04 (see docs/ai-memory/KNOWN_ISSUES.md) because all four had zero real Firestore
-- documents at the time -- no data-loss risk, but the columns did not match the real
-- fields the live frontend actually reads/writes (confirmed via
-- frontend/src/pages/KnowledgeMachineDetail.jsx, the only real reader/writer of these four
-- tables). Fixing now, before any real content is ever added through them or before a real
-- --apply of the users/storage phases, per KNOWN_ISSUES.md's own note to re-check before
-- assuming safe-to-defer.
--
-- Real fields confirmed via KnowledgeMachineDetail.jsx:
--   - notes:          addNote() posts {title, note_type, content} -- schema had `body`, not
--                      `content`, and had no `note_type` column at all.
--   - service_codes:  reveal() reads `record.service_code` (apiClient.js's Firestore-era
--                      reveal handler returns the raw Firestore field `service_code`, not a
--                      column named `code`); the card renders `code.function_name` -- schema
--                      had `code`, not `service_code`, and had no `function_name` column.
--   - media:           upload() posts {file_url, original_filename, title} and the page
--                      renders `item.file_url` / `item.caption || item.original_filename` --
--                      schema had `storage_path`, not `file_url`, and had no
--                      `original_filename`/`title` columns.
--   - documents:       same upload() shape; page renders `item.file_url` / `item.title` --
--                      schema had `storage_path`, not `file_url`, and had no
--                      `original_filename` column (title already existed).
--
-- Safe to run with `rename column` (not drop+add) since every affected table has 0 real
-- rows today (confirmed via every migration dry-run so far) -- no data to lose either way,
-- but `rename` is used for clarity of intent (this is a correction, not a new field).

alter table public.knowledge_notes
  rename column body to content;
alter table public.knowledge_notes
  add column if not exists note_type text;

alter table public.knowledge_service_codes
  rename column code to service_code;
alter table public.knowledge_service_codes
  add column if not exists function_name text;

alter table public.knowledge_media
  rename column storage_path to file_url;
alter table public.knowledge_media
  add column if not exists original_filename text;
alter table public.knowledge_media
  add column if not exists title text;

alter table public.knowledge_documents
  rename column storage_path to file_url;
alter table public.knowledge_documents
  add column if not exists original_filename text;
