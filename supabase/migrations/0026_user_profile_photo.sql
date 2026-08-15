-- Cross-platform parity Phase 7 (Account/Profile + profile photo): neither web nor Android has
-- any profile photo feature today, and public.users has no photo column at all (confirmed by
-- reading 0001_initial_schema.sql's table definition directly, not assumed) -- this is a
-- genuinely new feature for the whole product, per the user's own instruction to build it on
-- both platforms when it exists on neither.
--
-- REUSES existing, purpose-built infrastructure rather than creating anything new -- found only
-- after first drafting (then discarding) a version of this migration that added a third
-- namespace to the unrelated `photos` bucket:
--   - `public.users` gets one new nullable column, `photo_path`.
--   - Storage: the `profile-images` bucket already exists (0004_storage_buckets.sql), already
--     correctly sized/typed for this exact purpose (5 MB, png/jpeg/webp), and already has the
--     right path convention (`profile-images/{auth.uid()}/...`) -- it was simply never wired to
--     a real feature, so its original RLS was never corrected for one either. This migration
--     fixes that RLS, it does not replace the bucket or its path convention.
--
-- photo_path stores a PERMANENT Storage object path, never a URL -- matching the E2 architecture
-- (service_records.photos / job_cards.arrival_photos, 0024) rather than the 7-day-signed-URL
-- design that was found live-broken in Knowledge Base uploads this same session (see
-- docs/ai-memory/KNOWN_ISSUES.md's matching entry) -- a fresh signed URL is generated at display
-- time and never persisted.
--
-- The real fix, and the reason this bucket was never wired up: its ORIGINAL policies
-- (profile_images_select_own et al., all four for="{operation} using/with check auth.uid() =
-- first path segment") made a photo visible to nobody but its own owner and an admin bypass
-- WASN'T even present on top of that -- so an admin viewing the Users list, or any colleague
-- seeing a teammate's name badge, could never see that teammate's photo. That is not what
-- "profile photo" means (same underlying mistake Knowledge Base's generic-bucket reuse would
-- have made for its own uploads, caught earlier this session). Corrected here:
--   SELECT              -> public.has_active_profile()  (any active authenticated user, global
--                          read -- same read model dashboard_notes (0023) and this session's
--                          Knowledge Base findings both converged on for "shared team-visible
--                          content", as opposed to 0016's owner-only default for truly private
--                          generic uploads)
--   INSERT/UPDATE/DELETE -> UNCHANGED from the original owner-only policies, PLUS an admin
--                          bypass added (an admin correcting a user's photo is a reasonable,
--                          existing pattern -- e.g. is_admin() already bypasses everywhere else
--                          in this schema's write policies)
--
-- Scope discipline (explicit, matching this project's existing migration convention):
--   - Touches ONLY public.users (one new nullable column) and the `profile-images` bucket's
--     storage.objects policies (replaces its 4 original policies with corrected versions --
--     0016/0024/0023 explicitly left this bucket untouched, confirmed by reading both files'
--     own scope-discipline comments, so there is no later migration's work to preserve here).
--   - Does NOT touch storage.buckets -- `profile-images` stays private, 5 MB limit, existing
--     mime-type allowlist, exactly as 0004_storage_buckets.sql created it.
--   - Does NOT touch public.users' existing RLS (0002_rls_policies.sql) -- a user's own row is
--     already self-updatable for photo_path with zero policy change needed: confirmed by reading
--     restrict_self_user_update_trigger directly, it only blocks
--     role/is_active/effective_permissions/email for non-admins (its own error message, "Only
--     preferences may be self-updated," is narrower than what the code actually allows).
--   - Introduces no new permission key -- has_active_profile()/is_admin() are the same existing
--     functions used throughout this schema.
--
-- NOT YET APPLIED to the live project as of this file being written -- prepared for review only,
-- per this project's explicit migration-approval process. Must be run manually via the Supabase
-- SQL Editor once authorized.

alter table public.users add column if not exists photo_path text;
comment on column public.users.photo_path is
  'Permanent Storage object path under the profile-images bucket, e.g. {user_id}/avatar.webp -- never a signed URL. A fresh signed URL is generated at display time and never persisted, matching service_records.photos / job_cards.arrival_photos (see 0024).';

drop policy if exists profile_images_select_own on storage.objects;
drop policy if exists profile_images_write_own on storage.objects;
drop policy if exists profile_images_update_own on storage.objects;
drop policy if exists profile_images_delete_own on storage.objects;

create policy profile_images_select on storage.objects
  for select using (
    bucket_id = 'profile-images'
    and public.has_active_profile()
  );

create policy profile_images_write_own_or_admin on storage.objects
  for insert with check (
    bucket_id = 'profile-images'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy profile_images_update_own_or_admin on storage.objects
  for update using (
    bucket_id = 'profile-images'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  )
  with check (
    bucket_id = 'profile-images'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy profile_images_delete_own_or_admin on storage.objects
  for delete using (
    bucket_id = 'profile-images'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );
