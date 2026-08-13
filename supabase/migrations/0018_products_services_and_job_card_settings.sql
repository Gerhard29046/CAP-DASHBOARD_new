-- Products & Services catalogue + Job Card configuration settings.
--
-- Context (2026-08-13 UX redesign resume, user-requested functionality):
-- No products/services catalogue table existed anywhere in the schema before this --
-- job_card_lines has always been entirely free-text (line_type/description/quantity/
-- unit_price), with no catalogue to select from. This migration adds the smallest
-- reasonable catalogue + a single settings row for Job Card configuration, per explicit
-- instruction not to build unnecessary ERP complexity and not to duplicate any existing
-- table (confirmed via `supabase/migrations/*.sql` review -- none existed).
--
-- Accounting-correctness note: job_card_lines.description/unit_price/line_total are
-- already captured directly on the line at creation time (see 0001_initial_schema.sql) --
-- NOT derived live from the catalogue. catalog_item_id below is purely an optional
-- traceability link ("this line was originally added from catalogue item X"); editing or
-- deactivating a catalogue item never changes any existing job_card_lines/invoice row,
-- because nothing reads price/description through that FK at display time.
--
-- Not yet applied -- needs the user via the SQL Editor, same as every prior migration.

create type public.catalog_item_type as enum ('product', 'service');

create table public.products_services (
  id uuid primary key default gen_random_uuid(),
  type public.catalog_item_type not null default 'product',
  name text not null,
  description text,
  sku text,
  category text,
  unit_price numeric(12, 2) not null default 0,
  vat_rate numeric(5, 4) not null default 0.15,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_services_type_idx on public.products_services (type);
create index products_services_is_active_idx on public.products_services (is_active);
comment on table public.products_services is 'Administrator-managed catalogue of products/services selectable when adding Job Card line items. Inactive items stay selectable-never-again but historical job_card_lines/invoices are unaffected (see migration header).';

-- Optional traceability link only -- see migration header. Nullable, ON DELETE SET NULL so
-- deleting a catalogue item never cascades into deleting real historical line items.
alter table public.job_card_lines
  add column catalog_item_id uuid references public.products_services (id) on delete set null;

-- Singleton settings row for Job Card configuration -- a single-row table (enforced via the
-- boolean primary key trick) rather than a key/value settings blob, so every column has a
-- real, typed, documented meaning and the "no fake toggles" instruction is easy to audit.
-- Every column here must be read by real application code -- see the frontend PR that
-- introduces this migration for the exact call sites (Settings.jsx / BookIn.jsx /
-- JobCardDetail.jsx).
create table public.job_card_settings (
  id boolean primary key default true,
  constraint job_card_settings_singleton check (id),
  numbering_prefix text not null default 'JOB-',
  default_status text not null default 'Open',
  default_line_quantity numeric(10, 2) not null default 1,
  allow_products boolean not null default true,
  allow_services boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);
insert into public.job_card_settings (id) values (true);
comment on table public.job_card_settings is 'Single-row Job Card configuration, administrator-editable via Settings > Job Cards. Every column is read by real frontend code -- not a placeholder table.';

-- ---------------------------------------------------------------------------
-- RLS

alter table public.products_services enable row level security;
alter table public.job_card_settings enable row level security;

-- New permission gating the whole Settings area (frontend RoleGuard on /settings, plus the
-- real write-authorization gate here). is_admin() already bypasses has_permission() checks
-- (see 0002_rls_policies.sql's has_permission()), so Administrator gets this automatically
-- without needing a role_permissions row; every other role is denied by default (safe,
-- conservative default) until explicitly granted via role_permissions, matching the
-- existing pattern for every other permission-gated table in this schema.
insert into public.permissions (key, name, description, "group")
values (
  'settings.access',
  'Access Settings',
  'View and manage application settings (Job Cards, Products & Services, Users & Roles, System, Data Management).',
  'System Administration'
)
on conflict (key) do nothing;

insert into public.permissions (key, name, description, "group")
values (
  'clients.import',
  'Import Customers',
  'Import customers from an external spreadsheet (e.g. Pastel export) via Settings > Data Management.',
  'System Administration'
)
on conflict (key) do nothing;

-- products_services: any active signed-in user may read (needed to add lines to a Job
-- Card from the catalogue, same trust level as reading job_cards/clients generally);
-- only settings.access may write.
create policy products_services_select on public.products_services
  for select using (public.has_active_profile());
create policy products_services_insert on public.products_services
  for insert with check (public.has_permission('settings.access'));
create policy products_services_update on public.products_services
  for update using (public.has_permission('settings.access'));
create policy products_services_delete on public.products_services
  for delete using (public.has_permission('settings.access'));

-- job_card_settings: any active signed-in user may read the single row (BookIn/
-- JobCardDetail need the live defaults); only settings.access may update it. No insert/
-- delete policy -- the single row is seeded by this migration and never re-created or
-- removed by the application.
create policy job_card_settings_select on public.job_card_settings
  for select using (public.has_active_profile());
create policy job_card_settings_update on public.job_card_settings
  for update using (public.has_permission('settings.access'));

grant select, insert, update, delete on public.products_services to authenticated;
grant select, update on public.job_card_settings to authenticated;
