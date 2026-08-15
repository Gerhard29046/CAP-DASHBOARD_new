-- Cross-platform parity Phase 7 (Account/Profile + profile photo): neither web nor Android has
-- any profile photo feature today, and public.users has no photo column at all (confirmed by
-- reading 0001_initial_schema.sql's table definition directly, not assumed) -- this is a
-- genuinely new feature for the whole product, per the user's own instruction to build it on
-- both platforms when it exists on neither.
--
-- Design: adds public.users.photo_path (a permanent Storage object PATH, never a URL --
-- matching the E2/photos architecture that service_records.photos / job_cards.arrival_photos
-- already use, see 0024_photos_bucket_record_scoped_rls.sql -- a fresh signed URL is generated
-- at display time and never persisted, so this never regresses into the 7-day-signed-URL bug
-- found live in Knowledge Base uploads this same session, see docs/ai-memory/KNOWN_ISSUES.md's
-- matching entry).
--
-- Storage: reuses the EXISTING `photos` bucket (does not create a new bucket) with a third
-- object-path namespace alongside the two 0024 already established:
--   photos/service-records/{service_record_id}/...   (0024)
--   photos/job-cards/{job_card_id}/...                (0024)
--   photos/avatars/{user_id}/...                      (this migration)
-- One bucket, three well-defined namespaces -- avoids standing up a second Storage bucket for
-- what is architecturally the same kind of object (a permanent-path, RLS-gated image).
--
-- Authorization, deliberately DIFFERENT from 0024's record-scoped model, and this is the load-
-- bearing decision of this migration: a profile photo must be readable by every active user (it
-- shows up in the Users list, the Dashboard greeting, and anywhere else a colleague's identity is
-- shown -- an owner-only read policy, like 0016's generic-bucket default, would make the photo
-- invisible to everyone except its own uploader and an admin, which is not what "profile photo"
-- means). So:
--   SELECT              -> public.has_active_profile()  (any active authenticated user, global
--                          read -- same read model dashboard_notes already uses via
--                          0023_dashboard_notes_direct_rls.sql, for the same underlying reason:
--                          this is shared-team-visible content, not private-to-owner content)
--   INSERT/UPDATE/DELETE -> the path's {user_id} segment matches auth.uid(), OR public.is_admin()
--                          (owner-or-admin, same shape as 0016's generic buckets)
--
-- Scope discipline (explicit, matching 0024's own convention):
--   - Touches ONLY public.users (one new nullable column) and the `photos` bucket's storage.objects
--     policies (one new namespace, additive -- 0024's service-records/job-cards policies and
--     0016's documents/attachments/invoices policies are completely untouched).
--   - Does NOT touch storage.buckets -- `photos` stays private, 10 MB limit, existing image
--     mime-type allowlist, exactly as 0004_storage_buckets.sql created it.
--   - Does NOT touch public.users' existing RLS (0002_rls_policies.sql) -- a user's own row is
--     already self-updatable for non-role/permission fields via
--     restrict_self_user_update_trigger, which already allows updating any column that isn't
--     role/is_active/effective_permissions/email -- photo_path already falls under that existing
--     "self can update" umbrella with zero policy change needed, confirmed by reading the
--     trigger function directly rather than assumed.
--   - Introduces no new permission key.
--
-- NOT YET APPLIED to the live project as of this file being written -- prepared for review only,
-- per this project's explicit migration-approval process. Must be run manually via the Supabase
-- SQL Editor once authorized.

alter table public.users add column if not exists photo_path text;
comment on column public.users.photo_path is
  'Permanent Storage object path under the photos bucket, e.g. avatars/{user_id}/{uuid}-{filename}.webp -- never a signed URL. A fresh signed URL is generated at display time and never persisted, matching service_records.photos / job_cards.arrival_photos (see 0024).';

create or replace function public.can_access_profile_photo(object_name text, write_operation boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  segments text[];
  owner_id uuid;
begin
  -- Exactly 2 folder segments required (avatars/{user_id}) -- matches 0024's own `<> 2` (not
  -- `< 2`) tightening, closing the same "deeper-than-intended path" gap found during that
  -- migration's own pre-apply review.
  segments := storage.foldername(object_name);
  if segments is null or array_length(segments, 1) <> 2 or segments[1] <> 'avatars' then
    return false;
  end if;

  if not write_operation then
    -- Read: any active user may view any profile photo (see the design note above).
    return public.has_active_profile();
  end if;

  -- Write (insert/update/delete): the uploader must be the same user the path names, or an
  -- admin. Unlike 0024's record-scoped functions, this has no has_permission() check -- there is
  -- no dedicated "profile photo" permission key, and requiring one would be inventing a second
  -- authorization concept for what is simply "edit your own profile," already how public.users'
  -- own self-update trigger treats every other self-editable column.
  begin
    owner_id := segments[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return owner_id = auth.uid() or public.is_admin();
end;
$$;

create policy profile_photos_select on storage.objects
  for select using (
    bucket_id = 'photos'
    and public.can_access_profile_photo(name, false)
  );

create policy profile_photos_insert on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and public.can_access_profile_photo(name, true)
  );

create policy profile_photos_update on storage.objects
  for update using (
    bucket_id = 'photos'
    and public.can_access_profile_photo(name, true)
  )
  with check (
    bucket_id = 'photos'
    and public.can_access_profile_photo(name, true)
  );

create policy profile_photos_delete on storage.objects
  for delete using (
    bucket_id = 'photos'
    and public.can_access_profile_photo(name, true)
  );
