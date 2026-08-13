-- Tightens documents/photos/attachments storage RLS from "any active profile" (zero
-- ownership/scoping) to "owner or admin", closing a real gap found during 2026-08-12
-- pre-cutover review: any active signed-in user could read/write/update/delete ANY other
-- active user's files in these 3 buckets, with no path or ownership check at all.
--
-- Evidence this is safe (see docs/migration/PHASE2_CUTOVER_CHECKLIST.md section 1 /
-- docs/ai-memory/KNOWN_ISSUES.md for full detail):
--   - 0 real files exist in any of these 3 buckets today (confirmed live) -- no existing
--     data can be broken by this change.
--   - The one real generic upload path (frontend/src/api/supabaseApiClient.js's
--     `integrations.Core.UploadFile`, used by BookIn.jsx/LogServiceModal.jsx/
--     KnowledgeMachineDetail.jsx) already writes to `{auth.uid()}/{uuid}-{filename}` in the
--     `documents` bucket -- this policy's path check matches that existing convention
--     exactly, so every future upload through the existing code path continues to work
--     identically for its own uploader.
--   - No currently-working feature requires one non-admin user to read another non-admin
--     user's file in these buckets (job_cards.arrival_photos/service_records.photos have no
--     real Postgres columns or working writer today -- a separate, pre-existing, unrelated
--     frontend gap, not fixed here). KnowledgeMachineDetail.jsx's document upload is already
--     admin-only in the UI.
--   - Admin keeps full access via the same `public.is_admin()` bypass already used
--     throughout 0002_rls_policies.sql (e.g. has_permission(), users table policies) --
--     matches this project's existing RLS convention, not a new pattern.
--
-- Security boundary enforced: a non-admin active user may only select/insert/update/delete
-- objects whose path's first folder segment equals their own auth.uid(). Admins (is_admin())
-- retain unrestricted access to all objects in these 3 buckets, same as their role-wide
-- access to the underlying business data tables. `invoices` (permission-gated) and
-- `profile-images` (owner-only, no admin bypass) are unchanged -- not touched by this file.

drop policy if exists documents_all on storage.objects;
drop policy if exists photos_all on storage.objects;
drop policy if exists attachments_all on storage.objects;

create policy documents_owner_or_admin on storage.objects
  for all using (
    bucket_id = 'documents'
    and public.has_active_profile()
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'documents'
    and public.has_active_profile()
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );

create policy photos_owner_or_admin on storage.objects
  for all using (
    bucket_id = 'photos'
    and public.has_active_profile()
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'photos'
    and public.has_active_profile()
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );

create policy attachments_owner_or_admin on storage.objects
  for all using (
    bucket_id = 'attachments'
    and public.has_active_profile()
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'attachments'
    and public.has_active_profile()
    and (public.is_admin() or auth.uid()::text = (storage.foldername(name))[1])
  );
