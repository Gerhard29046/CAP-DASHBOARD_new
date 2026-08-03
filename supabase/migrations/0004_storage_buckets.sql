-- Supabase Storage buckets + access policies, created entirely via SQL (storage.buckets/
-- storage.objects are ordinary Postgres tables in Supabase), so this can be run through
-- the SQL Editor exactly like 0001-0003 -- no dashboard bucket-creation UI needed.
--
-- All buckets are private (public = false): access always goes through the authenticated
-- Supabase client (RLS below) or a short-lived signed URL (see
-- frontend/src/services/supabase/storage.js getSignedUrl()), matching the current Firebase
-- Storage behavior (no public bucket today).
--
-- Path convention: every object's path is expected to start with a folder that scopes it
-- (e.g. `{auth.uid()}/...` for profile-images, `{client_id}/...` or `{machine_id}/...` for
-- the rest where practical). Policies below use `storage.foldername(name)` to read that
-- first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-images', 'profile-images', false, 5242880, array['image/png','image/jpeg','image/webp']),
  ('invoices', 'invoices', false, 20971520, array['application/pdf']),
  ('documents', 'documents', false, 20971520, array['application/pdf','image/png','image/jpeg','image/webp']),
  ('photos', 'photos', false, 10485760, array['image/png','image/jpeg','image/webp']),
  ('attachments', 'attachments', false, 20971520, null)
on conflict (id) do nothing;

-- profile-images: each user manages only their own avatar, stored at
-- `profile-images/{auth.uid()}/...`. Matches the common Supabase pattern for
-- self-managed profile pictures; no direct Firestore/firestore.rules precedent since
-- Firebase Storage rules were not inspected this session for this specific path -- treat
-- as a reasonable default, confirm against actual current avatar-upload behavior before
-- relying on it.
create policy profile_images_select_own on storage.objects
  for select using (
    bucket_id = 'profile-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy profile_images_write_own on storage.objects
  for insert with check (
    bucket_id = 'profile-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy profile_images_update_own on storage.objects
  for update using (
    bucket_id = 'profile-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy profile_images_delete_own on storage.objects
  for delete using (
    bucket_id = 'profile-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- invoices: gated on the invoices.* permission keys already present in the permission
-- catalogue (backend/database/seeders/PermissionsSeeder.php: invoices.queue.view,
-- invoices.create, invoices.edit, invoices.process) and referenced in firestore.rules'
-- invoice_queue rule, even though the invoice_queue collection itself is currently unused
-- by any client code (see KNOWN_ISSUES.md) -- the permission keys are real, the feature
-- using this bucket is not yet built.
create policy invoices_select on storage.objects
  for select using (bucket_id = 'invoices' and public.has_permission('invoices.queue.view'));
create policy invoices_write on storage.objects
  for insert with check (bucket_id = 'invoices' and public.has_permission('invoices.edit'));
create policy invoices_update on storage.objects
  for update using (bucket_id = 'invoices' and public.has_permission('invoices.edit'));
create policy invoices_delete on storage.objects
  for delete using (bucket_id = 'invoices' and public.has_permission('invoices.edit'));

-- documents / photos / attachments: no dedicated permission keys or current feature exist
-- for these three buckets (they come from the original migration brief's suggested list,
-- not a confirmed current feature) -- default to "any active signed-in profile" for both
-- read and write, same as knowledge_base.* gating philosophy but without tying to that
-- specific permission since these are more generic. Tighten once a real feature and
-- permission key exists; do not treat this as a final security decision.
create policy documents_all on storage.objects
  for all using (bucket_id = 'documents' and public.has_active_profile())
  with check (bucket_id = 'documents' and public.has_active_profile());

create policy photos_all on storage.objects
  for all using (bucket_id = 'photos' and public.has_active_profile())
  with check (bucket_id = 'photos' and public.has_active_profile());

create policy attachments_all on storage.objects
  for all using (bucket_id = 'attachments' and public.has_active_profile())
  with check (bucket_id = 'attachments' and public.has_active_profile());
