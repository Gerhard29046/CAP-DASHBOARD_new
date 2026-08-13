-- Customer Import history (Settings > Data Management > Import Customers, section P of the
-- 2026-08-13 UX redesign resume). One row per completed import run -- built as a permanent,
-- reusable feature (per explicit instruction), not a one-off migration script, so future
-- Pastel exports can be safely re-imported and compared.
--
-- Deliberately minimal: no separate "pastel customers" table (would duplicate
-- public.clients, explicitly disallowed) and no per-row audit table (would be real
-- complexity for a feature that mainly needs "did we do this before, roughly how did it
-- go" -- a summary row is enough; the actual imported clients are just normal
-- public.clients rows, indistinguishable from any other client except for this history
-- record and (where relevant) legacy_pastel_customer_code below).
--
-- Not yet applied -- needs the user via the SQL Editor, same as every prior migration.

create table public.client_imports (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  imported_by uuid references public.users (id) on delete set null,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  column_mapping jsonb,
  created_at timestamptz not null default now()
);
create index client_imports_created_at_idx on public.client_imports (created_at desc);
comment on table public.client_imports is 'Summary record of one Settings > Data Management > Import Customers run. The imported rows themselves just become normal public.clients rows (see legacy_pastel_customer_code below for de-duplication on repeat imports).';

-- Lets a repeat import recognize "this Pastel customer was already imported" even if the
-- company name was edited in CAP Dashboard afterwards -- the single most reliable duplicate
-- signal Pastel exports are expected to provide (per the user's own example mapping).
-- Nullable/unique-when-present so it never conflicts with the 6 pre-existing (non-Pastel)
-- migrated clients, which will have this null.
alter table public.clients
  add column legacy_pastel_customer_code text;
create unique index clients_legacy_pastel_customer_code_idx
  on public.clients (legacy_pastel_customer_code)
  where legacy_pastel_customer_code is not null;

alter table public.client_imports enable row level security;

-- Reuses the same settings.access / clients.import permissions introduced in
-- 0018_products_services_and_job_card_settings.sql -- importing customer data is an
-- administrative operation, not a general clients.create action (per explicit instruction:
-- "ordinary technicians cannot import/overwrite customer data").
create policy client_imports_select on public.client_imports
  for select using (public.has_permission('clients.import'));
create policy client_imports_insert on public.client_imports
  for insert with check (public.has_permission('clients.import'));

grant select, insert on public.client_imports to authenticated;
