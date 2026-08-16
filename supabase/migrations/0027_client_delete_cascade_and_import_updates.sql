-- Fixes real "Delete Client" breakage + adds support for the CSV/Excel importer's new
-- "update existing customer" action (2026-08-16, on explicit user request: "make sure i
-- can delete clients... delete clients and jobs that is booked in, knowledge base... import
-- a csv customer data from pastel sage one online accounting... to update the customers").
--
-- ---------------------------------------------------------------------------------------
-- 1. Client delete was silently broken for any client with machines on record
-- ---------------------------------------------------------------------------------------
-- frontend/src/pages/ClientDetail.jsx's delete confirmation dialog has always said "This
-- will permanently delete <client> and all its machines" -- but 0001_initial_schema.sql
-- defined machines.client_id as `references public.clients (id) on delete restrict`, the
-- OPPOSITE of what the UI promises. Any client with at least one machine (i.e. almost every
-- real client) could never actually be deleted -- apiClient.entities.Client.delete(id)
-- would fail with a foreign-key-violation Postgres error. sites.client_id and
-- job_cards.client_id were already correct (cascade / set null respectively); machines was
-- the one broken link in an otherwise-consistent chain. Fixed by dropping and recreating
-- the constraint as ON DELETE CASCADE, matching the UI's own long-standing promise and the
-- same cascade pattern already used for sites and for machines -> service_records.
--
-- Full deletion chain once this is applied: clients -> sites (cascade, unchanged) and
-- clients -> machines (cascade, THIS FIX) -> service_records (cascade, unchanged). job_cards
-- referencing the deleted client/machines are NOT deleted (client_id/machine_id already
-- ON DELETE SET NULL) -- job/billing history for work already done is deliberately
-- preserved, only the equipment records themselves are removed with the client.
--
-- Looked up the real constraint name dynamically rather than assuming Postgres's default
-- naming convention, since this is a real ALTER against a live table -- guessing wrong and
-- silently leaving TWO foreign keys on the same column (the old restrictive one still in
-- place under a different name) would be worse than doing nothing.
do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.machines'::regclass
    and contype = 'f'
    and conkey = (
      select array_agg(attnum) from pg_attribute
      where attrelid = 'public.machines'::regclass and attname = 'client_id'
    );

  if fk_name is not null then
    execute format('alter table public.machines drop constraint %I', fk_name);
  end if;
end $$;

alter table public.machines
  add constraint machines_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete cascade;

-- ---------------------------------------------------------------------------------------
-- 2. Delete permission catalog rows -- RLS already enforces these keys (0002_rls_policies.sql:
--    clients_delete/job_cards_delete/knowledge_machines_delete etc.), and admins already
--    bypass via is_admin() regardless, but the keys themselves were never inserted into
--    public.permissions, so UserAdmin's permission matrix (web and Android) could never
--    show/grant them to a non-admin role. Purely additive, same insert shape as 0018's.
-- ---------------------------------------------------------------------------------------
insert into public.permissions (key, name, description, "group")
values (
  'clients.delete',
  'Delete Clients',
  'Permanently delete a client and all of its machines and service history.',
  'Clients'
)
on conflict (key) do nothing;

insert into public.permissions (key, name, description, "group")
values (
  'job_cards.delete',
  'Delete Job Cards',
  'Permanently delete a booked-in job card and its line items.',
  'Job Cards'
)
on conflict (key) do nothing;

insert into public.permissions (key, name, description, "group")
values (
  'knowledge_base.delete',
  'Delete Knowledge Base Entries',
  'Permanently delete a machine knowledge base entry and its notes, service codes, and media.',
  'Knowledge Base'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------
-- 3. client_imports.updated_count -- the CSV/Excel importer (Settings > Data Management)
--    can now update an existing client instead of only ever creating a new one; the
--    existing summary-row columns (imported_count/duplicate_count/skipped_count) had no
--    slot for that. Purely additive, nullable-safe default 0 so existing history rows read
--    fine (frontend reads `h.updated_count || 0`).
-- ---------------------------------------------------------------------------------------
alter table public.client_imports add column if not exists updated_count integer not null default 0;
