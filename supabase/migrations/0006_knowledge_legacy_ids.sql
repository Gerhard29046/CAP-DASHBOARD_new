-- Adds legacy_firestore_id to the four knowledge_* tables that
-- 0003_legacy_migration_ids.sql missed (it only covered knowledge_machines). Needed
-- because supabase/scripts/migrate-firestore-to-postgres.mjs's Phase A now imports
-- knowledge_notes/knowledge_service_codes/knowledge_media/knowledge_documents (confirmed
-- live collections via frontend/src/api/apiClient.js's routeCollections and
-- entities.js's KnowledgeBaseService -- previously omitted from the migration script
-- entirely, a real gap found during Phase 2 prep review on 2026-08-03) and Phase C already
-- relinks knowledge_notes.created_by by this column.
--
-- Run this after 0001-0005 have succeeded, whenever convenient -- it does not need to be
-- run before continuing to verify 0001-0005; the data-migration script cannot run at all
-- yet regardless (still blocked on Firebase Admin credentials, see
-- docs/ai-memory/KNOWN_ISSUES.md), so there is no urgency, only a prerequisite for later.
--
-- IDEMPOTENT as of 2026-08-03: the user's first run hit `ERROR: 42701: column
-- "legacy_firestore_id" of relation "knowledge_notes" already exists`, meaning all four
-- ADD COLUMN statements below had already succeeded in an earlier, unreported run --
-- confirmed live via a read-only supabase-js check against all four tables (all four
-- columns present) before rewriting this file, rather than assumed from the error message
-- alone. Rewritten with `if not exists` on every ADD COLUMN/CREATE INDEX so re-running this
-- file is always safe regardless of which statements already committed. (Index existence
-- could not be directly confirmed via PostgREST -- there is no exposed introspection route
-- for pg_indexes -- so `if not exists` here also covers that uncertainty rather than
-- assuming the indexes exist just because the columns do.)
-- NOTE: if the pre-existing column somehow lacks the `unique` constraint (impossible to
-- fully rule out without direct SQL access), `add column if not exists ... unique` will
-- silently skip re-adding it, since IF NOT EXISTS treats the whole clause as a no-op when
-- the column is already there. Not expected to matter here -- the original (non-idempotent)
-- statement that succeeded already specified `unique` -- but noted for completeness.

alter table public.knowledge_notes add column if not exists legacy_firestore_id text unique;
alter table public.knowledge_service_codes add column if not exists legacy_firestore_id text unique;
alter table public.knowledge_media add column if not exists legacy_firestore_id text unique;
alter table public.knowledge_documents add column if not exists legacy_firestore_id text unique;

create index if not exists knowledge_notes_legacy_firestore_id_idx on public.knowledge_notes (legacy_firestore_id);
create index if not exists knowledge_service_codes_legacy_firestore_id_idx on public.knowledge_service_codes (legacy_firestore_id);
create index if not exists knowledge_media_legacy_firestore_id_idx on public.knowledge_media (legacy_firestore_id);
create index if not exists knowledge_documents_legacy_firestore_id_idx on public.knowledge_documents (legacy_firestore_id);
