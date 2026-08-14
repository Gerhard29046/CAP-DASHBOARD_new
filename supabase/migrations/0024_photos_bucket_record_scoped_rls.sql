-- Replaces the `photos` bucket's owner-scoped RLS (0016_storage_generic_buckets_owner_or_admin.sql)
-- with record-scoped RLS, as part of moving service_records.photos / job_cards.arrival_photos
-- from storing a temporary (7-day) signed URL to storing a permanent Storage object path, with a
-- fresh signed URL generated on demand at display time (see docs/ai-memory/DECISIONS.md's
-- matching entry for the full architecture writeup and the business reason: these photos are
-- part of a Wigam A/C machine's permanent service history / arrival-condition record, so a
-- 7-day-expiring reference is not acceptable).
--
-- New path convention (replaces the old {auth.uid()}/{uuid}-{filename} convention for this
-- bucket only):
--   photos/service-records/{service_record_id}/{uuid}-{filename}.webp
--   photos/job-cards/{job_card_id}/{uuid}-{filename}.webp
--
-- Why record-scoped instead of owner-scoped: these are shared business records -- any
-- technician authorized to view a service record / job card must be able to view its photos,
-- not just the technician who originally uploaded them (this is the whole point of a permanent
-- service-history record). The owner-scoped policy this replaces would make Storage's own
-- createSignedUrl() call itself 403 for a non-owner, non-admin technician trying to view a
-- colleague's upload -- authorization here needs to key off the same permission the parent
-- table already uses (services.view/.edit, job_cards.view/.edit via the existing
-- has_permission() function, which already includes the admin bypass internally), not off who
-- uploaded the file.
--
-- Scope discipline (explicit, per instruction):
--   - Touches ONLY the `photos` bucket's policies. `documents`/`attachments`/`profile-images`/
--     `invoices` bucket policies (0004, 0016) are completely untouched.
--   - Does NOT touch storage.buckets at all -- the `photos` bucket stays private, 10 MB limit,
--     image/png|jpeg|webp allowlist, exactly as created in 0004_storage_buckets.sql.
--   - Does NOT touch service_records.photos / job_cards.arrival_photos (still plain jsonb,
--     still a flat array of strings -- only the string's *meaning* changes from URL to path,
--     which is an application-layer change, not a schema change).
--   - Does NOT touch service_records/job_cards table RLS (0002_rls_policies.sql) -- those
--     policies are read here, not modified.
--   - Introduces no new permission key -- services.view/.edit and job_cards.view/.edit are the
--     real, existing, live keys already gating the parent tables (confirmed against
--     0002_rls_policies.sql and a live read of the production permissions table in an earlier
--     phase of this work).
--
-- Production-data note (verified live, read-only, immediately before this migration was
-- authored -- not assumed): as of authoring, service_records.photos and job_cards.arrival_photos
-- are empty in every row (5/5 and 5/5), and the `photos` bucket contains zero objects at any
-- path. This migration requires no data conversion/migration of any kind.
--
-- NOT YET APPLIED to the live project as of this file being written -- prepared for review only,
-- per explicit instruction. Must be run manually via the Supabase SQL Editor once authorized,
-- matching this project's existing no-automated-apply-pipeline convention.

drop policy if exists photos_owner_or_admin on storage.objects;

-- Maps a `photos` bucket object path of the form `service-records/{service_record_id}/...` to
-- an authorization decision, reusing the existing has_permission() function (which already
-- includes the is_admin() bypass internally -- see has_permission()'s own definition in
-- 0002_rls_policies.sql) rather than inventing a second authorization system.
--
-- The has_permission() check runs FIRST and is the real security boundary -- this app's
-- permission model is blanket-role-based, not per-row (service_records_select/job_cards_select
-- in 0002_rls_policies.sql are themselves just `using (has_permission(...))`, with no per-row
-- scoping), so any technician holding services.view can already see every service record
-- through the table itself. The `exists (select 1 from service_records ...)` check below is a
-- data-integrity safeguard against a malformed/nonexistent record id in the path, not an
-- additional access-control layer.
create or replace function public.can_access_service_record_photo(object_name text, required_permission text)
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

  -- Exactly 2 folder segments required (service-records/{id}) -- NOT `< 2`. A `< 2` check
  -- would still pass a deeper-than-intended path like service-records/{real-id}/extra/x.webp
  -- (storage.foldername drops only the final filename segment, so that path yields 3 folder
  -- segments, and `< 2` lets 3 through). This doesn't create a cross-record or cross-permission
  -- bypass on its own (the object is still scoped to the same real, existence-checked,
  -- permission-gated record), but it's looser than the intended path shape -- found and closed
  -- during the pre-apply security review, before this migration was ever applied to production.
  segments := storage.foldername(object_name);
  if segments is null or array_length(segments, 1) <> 2 or segments[1] <> 'service-records' then
    return false;
  end if;

  begin
    record_id := segments[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (select 1 from public.service_records where id = record_id);
end;
$$;

-- Same shape as can_access_service_record_photo(), for `job-cards/{job_card_id}/...` paths.
-- Kept as a separate function (not a single parameterized/dynamic-SQL function covering both
-- tables) to avoid dynamic SQL running as security definer -- matches this project's existing
-- preference for small, explicit, single-purpose security-definer functions
-- (has_permission/is_admin/has_active_profile) over a more "clever" generic one.
create or replace function public.can_access_job_card_photo(object_name text, required_permission text)
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

  -- Exactly 2 folder segments required (job-cards/{id}) -- see the matching comment in
  -- can_access_service_record_photo() above for why `< 2` was tightened to `<> 2`.
  segments := storage.foldername(object_name);
  if segments is null or array_length(segments, 1) <> 2 or segments[1] <> 'job-cards' then
    return false;
  end if;

  begin
    record_id := segments[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (select 1 from public.job_cards where id = record_id);
end;
$$;

-- Permission matrix (matches the approved design exactly):
--   SELECT/sign  service photo      -> services.view
--   INSERT       service photo      -> services.edit
--   UPDATE       service photo      -> services.edit
--   DELETE       service photo      -> services.edit
--   SELECT/sign  job-card photo     -> job_cards.view
--   INSERT       job-card photo     -> job_cards.edit
--   UPDATE       job-card photo     -> job_cards.edit
--   DELETE       job-card photo     -> job_cards.edit
--   Admin always passes via has_permission()'s built-in is_admin() bypass.

create policy service_record_photos_select on storage.objects
  for select using (
    bucket_id = 'photos'
    and public.can_access_service_record_photo(name, 'services.view')
  );

create policy service_record_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and public.can_access_service_record_photo(name, 'services.edit')
  );

create policy service_record_photos_update on storage.objects
  for update using (
    bucket_id = 'photos'
    and public.can_access_service_record_photo(name, 'services.edit')
  )
  with check (
    bucket_id = 'photos'
    and public.can_access_service_record_photo(name, 'services.edit')
  );

create policy service_record_photos_delete on storage.objects
  for delete using (
    bucket_id = 'photos'
    and public.can_access_service_record_photo(name, 'services.edit')
  );

create policy job_card_photos_select on storage.objects
  for select using (
    bucket_id = 'photos'
    and public.can_access_job_card_photo(name, 'job_cards.view')
  );

create policy job_card_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and public.can_access_job_card_photo(name, 'job_cards.edit')
  );

create policy job_card_photos_update on storage.objects
  for update using (
    bucket_id = 'photos'
    and public.can_access_job_card_photo(name, 'job_cards.edit')
  )
  with check (
    bucket_id = 'photos'
    and public.can_access_job_card_photo(name, 'job_cards.edit')
  );

create policy job_card_photos_delete on storage.objects
  for delete using (
    bucket_id = 'photos'
    and public.can_access_job_card_photo(name, 'job_cards.edit')
  );
