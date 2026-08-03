-- Fixes a real bug found by supabase/scripts/smoke-test.mjs (2026-08-03, live run against
-- the real CAPDATABASE project): restrict_self_user_update() (added in
-- 0002_rls_policies.sql) only bypasses its "only preferences may change" check when
-- public.is_admin() is true. is_admin() depends on auth.uid(), which is NULL when a query
-- runs under the service_role key (no JWT/session context) -- so ANY update to
-- role/is_active/effective_permissions/email made via service_role (e.g. an admin script,
-- or supabase/scripts/migrate-firestore-to-postgres.mjs's Phase C setting a migrated
-- user's role/effective_permissions) was being rejected with "Only preferences may be
-- self-updated," even though service_role already bypasses RLS by design and is trusted.
--
-- Confirmed live: granting a test user 'clients.view' via the service_role client failed
-- with exactly this error before this fix.
--
-- Fix: also bypass the restriction when auth.uid() is null, i.e. there is no authenticated
-- end-user session at all (service_role / definer-context calls). This does not change
-- behavior for any authenticated non-admin user -- self-updates outside `preferences` are
-- still blocked exactly as before; only trusted server-side/service_role writes are now
-- permitted to set role/is_active/effective_permissions/email, matching the intent already
-- documented in 0002's comments ("Enforce ... via a BEFORE UPDATE trigger").
--
-- This does not need to run before continuing other Phase 2 prep, but MUST run before any
-- real --apply of migrate-firestore-to-postgres.mjs's `users` phase, or every migrated
-- user with a non-default role/permission set will fail to import correctly.

create or replace function public.restrict_self_user_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.effective_permissions is distinct from old.effective_permissions
    or new.email is distinct from old.email then
    raise exception 'Only preferences may be self-updated.';
  end if;
  return new;
end;
$$;
