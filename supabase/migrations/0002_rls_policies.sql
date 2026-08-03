-- Row Level Security, translating firestore.rules 1:1 (same permission keys, same admin
-- bypass, same "active profile" gate) so authorization behavior does not silently change
-- during the migration. Source of truth compared against: firestore.rules (repo root).
--
-- Not yet applied to any project. Review permission-key parity against firestore.rules
-- before running, and re-check after any future firestore.rules change made during the
-- migration window (the two will drift if only one is edited).

create or replace function public.current_profile()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select * from public.users where id = auth.uid();
$$;

create or replace function public.has_active_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and is_active = true and role = 'admin'
  );
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.users
    where id = auth.uid()
      and is_active = true
      and permission_key = any (effective_permissions)
  );
$$;

-- Table-level GRANTs, explicit rather than relying on this Supabase project's default
-- template privileges (which may or may not already grant these -- not verified, since
-- this migration is being run by the user via the SQL Editor without Queen Bee having
-- direct DB access to check pg_catalog). RLS policies below are the real gate; these
-- GRANTs are the prerequisite Postgres requires before RLS is even evaluated. `anon`
-- (unauthenticated) gets nothing, matching firestore.rules' signedIn()/hasActiveProfile()
-- requirement on every collection.
grant usage on schema public to authenticated;
revoke all on schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

alter table public.users enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.clients enable row level security;
alter table public.sites enable row level security;
alter table public.machines enable row level security;
alter table public.service_records enable row level security;
alter table public.job_cards enable row level security;
alter table public.job_card_lines enable row level security;
alter table public.knowledge_machines enable row level security;
alter table public.knowledge_notes enable row level security;
alter table public.knowledge_service_codes enable row level security;
alter table public.knowledge_media enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- users: self read/update own row (preferences only, unless admin), admin full access.
-- Mirrors firestore.rules match /users/{userId}: get self-or-admin, list admin-only,
-- update self limited to `preferences`, delete admin-only.
create policy users_select on public.users
  for select using (auth.uid() = id or public.is_admin());

create policy users_update_admin on public.users
  for update using (public.is_admin());

create policy users_update_self_preferences on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);
-- NOTE: Postgres RLS cannot restrict *which columns* change the way firestore.rules'
-- diff().affectedKeys().hasOnly(['preferences']) does. Enforce the "self can only touch
-- preferences" rule via a BEFORE UPDATE trigger (below), not policy alone.

create or replace function public.restrict_self_user_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() then
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

create trigger restrict_self_user_update_trigger
  before update on public.users
  for each row execute function public.restrict_self_user_update();

create policy users_delete_admin on public.users
  for delete using (public.is_admin());

-- permissions / role_permissions: any active profile may read, admin-only write.
create policy permissions_select on public.permissions
  for select using (public.has_active_profile());
create policy permissions_write_admin on public.permissions
  for all using (public.is_admin()) with check (public.is_admin());

create policy role_permissions_select on public.role_permissions
  for select using (public.has_active_profile());
create policy role_permissions_write_admin on public.role_permissions
  for all using (public.is_admin()) with check (public.is_admin());

-- clients: clients.view / .create / .edit / .delete
create policy clients_select on public.clients for select using (public.has_permission('clients.view'));
create policy clients_insert on public.clients for insert with check (public.has_permission('clients.create'));
create policy clients_update on public.clients for update using (public.has_permission('clients.edit'));
create policy clients_delete on public.clients for delete using (public.has_permission('clients.delete'));

-- sites: not a distinct Firestore collection today (nested under clients in current
-- Firestore model per apiClient.js) -- gated on the same clients.* permissions until a
-- dedicated sites.* permission set is introduced.
create policy sites_select on public.sites for select using (public.has_permission('clients.view'));
create policy sites_insert on public.sites for insert with check (public.has_permission('clients.edit'));
create policy sites_update on public.sites for update using (public.has_permission('clients.edit'));
create policy sites_delete on public.sites for delete using (public.has_permission('clients.delete'));

-- machines: machines.view / .create / .edit / .delete
create policy machines_select on public.machines for select using (public.has_permission('machines.view'));
create policy machines_insert on public.machines for insert with check (public.has_permission('machines.create'));
create policy machines_update on public.machines for update using (public.has_permission('machines.edit'));
create policy machines_delete on public.machines for delete using (public.has_permission('machines.delete'));

-- service_records: services.view / .create / .edit / .delete
create policy service_records_select on public.service_records for select using (public.has_permission('services.view'));
create policy service_records_insert on public.service_records for insert with check (public.has_permission('services.create'));
create policy service_records_update on public.service_records for update using (public.has_permission('services.edit'));
create policy service_records_delete on public.service_records for delete using (public.has_permission('services.delete'));

-- job_cards: job_cards.view / .create / .edit / .delete
create policy job_cards_select on public.job_cards for select using (public.has_permission('job_cards.view'));
create policy job_cards_insert on public.job_cards for insert with check (public.has_permission('job_cards.create'));
create policy job_cards_update on public.job_cards for update using (public.has_permission('job_cards.edit'));
create policy job_cards_delete on public.job_cards for delete using (public.has_permission('job_cards.delete'));

-- job_card_lines: single combined permission job_cards.lines.manage for all operations.
create policy job_card_lines_all on public.job_card_lines
  for all using (public.has_permission('job_cards.lines.manage'))
  with check (public.has_permission('job_cards.lines.manage'));

-- knowledge_*: knowledge_base.view / .create / .edit / .delete, shared across all 5 tables.
create policy knowledge_machines_select on public.knowledge_machines for select using (public.has_permission('knowledge_base.view'));
create policy knowledge_machines_insert on public.knowledge_machines for insert with check (public.has_permission('knowledge_base.create'));
create policy knowledge_machines_update on public.knowledge_machines for update using (public.has_permission('knowledge_base.edit'));
create policy knowledge_machines_delete on public.knowledge_machines for delete using (public.has_permission('knowledge_base.delete'));

create policy knowledge_notes_select on public.knowledge_notes for select using (public.has_permission('knowledge_base.view'));
create policy knowledge_notes_insert on public.knowledge_notes for insert with check (public.has_permission('knowledge_base.create'));
create policy knowledge_notes_update on public.knowledge_notes for update using (public.has_permission('knowledge_base.edit'));
create policy knowledge_notes_delete on public.knowledge_notes for delete using (public.has_permission('knowledge_base.delete'));

create policy knowledge_service_codes_select on public.knowledge_service_codes for select using (public.has_permission('knowledge_base.view'));
create policy knowledge_service_codes_insert on public.knowledge_service_codes for insert with check (public.has_permission('knowledge_base.create'));
create policy knowledge_service_codes_update on public.knowledge_service_codes for update using (public.has_permission('knowledge_base.edit'));
create policy knowledge_service_codes_delete on public.knowledge_service_codes for delete using (public.has_permission('knowledge_base.delete'));

create policy knowledge_media_select on public.knowledge_media for select using (public.has_permission('knowledge_base.view'));
create policy knowledge_media_insert on public.knowledge_media for insert with check (public.has_permission('knowledge_base.create'));
create policy knowledge_media_update on public.knowledge_media for update using (public.has_permission('knowledge_base.edit'));
create policy knowledge_media_delete on public.knowledge_media for delete using (public.has_permission('knowledge_base.delete'));

create policy knowledge_documents_select on public.knowledge_documents for select using (public.has_permission('knowledge_base.view'));
create policy knowledge_documents_insert on public.knowledge_documents for insert with check (public.has_permission('knowledge_base.create'));
create policy knowledge_documents_update on public.knowledge_documents for update using (public.has_permission('knowledge_base.edit'));
create policy knowledge_documents_delete on public.knowledge_documents for delete using (public.has_permission('knowledge_base.delete'));

-- notifications: a user only ever sees/updates (marks read) their own notifications.
-- New table, not present in current Firestore model -- no firestore.rules precedent, so
-- this policy is a reasonable default, not a translation. Confirm before relying on it.
create policy notifications_select_own on public.notifications for select using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications for update using (auth.uid() = user_id);
create policy notifications_insert_admin on public.notifications for insert with check (public.is_admin());
create policy notifications_delete_own on public.notifications for delete using (auth.uid() = user_id);

-- audit_logs: admin-read-only, system-insert-only (via service_role in server-side code,
-- which bypasses RLS entirely -- no insert policy needed for that path).
create policy audit_logs_select_admin on public.audit_logs for select using (public.is_admin());

-- calendar_records / invoice_queue collections exist in firestore.rules but were not
-- inspected this session (unknown field shapes) -- deliberately NOT created here. See
-- docs/ai-memory/KNOWN_ISSUES.md. Do not treat their absence as accidental.
