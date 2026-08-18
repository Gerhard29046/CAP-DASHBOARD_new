-- 0029_knowledge_base_permanent_file_paths.sql
--
-- Fixes the live bug documented in docs/ai-memory/KNOWN_ISSUES.md ("KB photo/document uploads
-- permanently break 7 days after upload"): apiClient.integrations.Core.UploadFile() persisted a
-- 7-day signed URL into knowledge_media.file_url / knowledge_documents.file_url instead of a
-- permanent Storage object path. Once the URL expired the file became unrecoverable through the
-- UI even though it was still safely in Storage (no path was ever saved to re-sign from).
--
-- Production-data check (read-only, immediately before writing this migration, via
-- supabase/scripts/qa-inspect-kb-media-documents.mjs): knowledge_media and knowledge_documents
-- both have ZERO real rows in production as of 2026-08-17. No backfill/data-conversion is
-- needed or included here -- there is nothing existing to convert.
--
-- Column names are UNCHANGED (`file_url` stays `file_url` on both tables) -- only the *meaning*
-- of the stored string changes, from "ready-to-use URL" to "permanent Storage object path",
-- exactly the same non-breaking-schema discipline already used for service_records.photos /
-- job_cards.arrival_photos (see 0024_photos_bucket_record_scoped_rls.sql). The application layer
-- (frontend/src/services/supabase/storage.js's new uploadKnowledgeMedia()/uploadKnowledgeDocument()/
-- getKnowledgeFileSignedUrl(), frontend/src/pages/KnowledgeMachineDetail.jsx's upload()/openFile())
-- is what actually changes what gets written/read -- this migration only fixes the Storage bucket
-- RLS gap that made the old owner-scoped `documents` bucket policy actively incompatible with a
-- shared Knowledge Base in the first place (see below).
--
-- SEPARATE, EQUALLY REAL BUG THIS MIGRATION FIXES: the `documents` bucket's RLS
-- (0016_storage_generic_buckets_owner_or_admin.sql, `documents_owner_or_admin`) is owner-or-admin
-- only -- `auth.uid()::text = (storage.foldername(name))[1]`. Every knowledge_media/
-- knowledge_documents Storage object lives at `{uploader_uid}/{uuid}-{filename}`, so a
-- non-admin technician who did NOT personally upload a given KB photo/document could never
-- generate a signed URL for it at all (Storage itself would 403 the sign request) -- a second,
-- independent bug from the URL-expiry one, confirmed by reading the policy directly, not
-- assumed. This defeats the entire point of a shared Knowledge Base. Fixed the same way
-- 0024 fixed this exact problem shape for the `photos` bucket: replace owner-scoped RLS with
-- record-scoped RLS keyed off knowledge_base.view/.create/.edit/.delete (has_permission()'s
-- existing admin bypass still applies).
--
-- Scope discipline, matching 0024's own stated discipline:
--   - The `documents` bucket is used ONLY by this Knowledge Base upload route today (confirmed
--     via `grep -rn "documents" frontend/src` -- no other caller of BUCKETS.documents exists).
--     Safe to fully replace its RLS policy rather than layer a second one.
--   - Does NOT touch `photos`/`attachments`/`profile-images`/`invoices` bucket policies.
--   - Does NOT touch knowledge_media/knowledge_documents table RLS (0002_rls_policies.sql) --
--     read here, not modified.
--   - Does NOT rename or add any column.
--
-- New path convention (replaces the old {uploader_uid}/{uuid}-{filename} convention for this
-- bucket):
--   documents/knowledge-media/{knowledge_machine_id}/{uuid}-{filename}.webp
--   documents/knowledge-documents/{knowledge_machine_id}/{uuid}-{filename}.pdf
--
-- APPLIED -- confirmed live 2026-08-17 (evening, existence check via can_access_knowledge_media/
-- can_access_knowledge_document RPC callability) and again 2026-08-17/18 with a full live
-- write/cross-user-read/cleanup pass (supabase/scripts/qa-verify-kb-permanent-paths.mjs,
-- 12/12 pass). This comment previously said "NOT YET APPLIED"; corrected once independently
-- reverified, not left stale.

drop policy if exists documents_owner_or_admin on storage.objects;

create or replace function public.can_access_knowledge_media(object_name text, required_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  segments text[];
  record_id uuid;
begin
  if not public.has_permission(required_permission) then
    return false;
  end if;

  segments := storage.foldername(object_name);
  if segments is null or array_length(segments, 1) <> 2 or segments[1] <> 'knowledge-media' then
    return false;
  end if;

  begin
    record_id := segments[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (select 1 from public.knowledge_machines where id = record_id);
end;
$$;

create or replace function public.can_access_knowledge_document(object_name text, required_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  segments text[];
  record_id uuid;
begin
  if not public.has_permission(required_permission) then
    return false;
  end if;

  segments := storage.foldername(object_name);
  if segments is null or array_length(segments, 1) <> 2 or segments[1] <> 'knowledge-documents' then
    return false;
  end if;

  begin
    record_id := segments[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (select 1 from public.knowledge_machines where id = record_id);
end;
$$;

-- Permission matrix, matching knowledge_media/knowledge_documents' own table RLS exactly
-- (0002_rls_policies.sql) -- admin always passes via has_permission()'s built-in is_admin()
-- bypass.
create policy knowledge_media_files_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.can_access_knowledge_media(name, 'knowledge_base.view')
  );

create policy knowledge_media_files_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.can_access_knowledge_media(name, 'knowledge_base.create')
  );

create policy knowledge_media_files_update on storage.objects
  for update using (
    bucket_id = 'documents'
    and public.can_access_knowledge_media(name, 'knowledge_base.edit')
  )
  with check (
    bucket_id = 'documents'
    and public.can_access_knowledge_media(name, 'knowledge_base.edit')
  );

create policy knowledge_media_files_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.can_access_knowledge_media(name, 'knowledge_base.delete')
  );

create policy knowledge_document_files_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.can_access_knowledge_document(name, 'knowledge_base.view')
  );

create policy knowledge_document_files_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.can_access_knowledge_document(name, 'knowledge_base.create')
  );

create policy knowledge_document_files_update on storage.objects
  for update using (
    bucket_id = 'documents'
    and public.can_access_knowledge_document(name, 'knowledge_base.edit')
  )
  with check (
    bucket_id = 'documents'
    and public.can_access_knowledge_document(name, 'knowledge_base.edit')
  );

create policy knowledge_document_files_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.can_access_knowledge_document(name, 'knowledge_base.delete')
  );
