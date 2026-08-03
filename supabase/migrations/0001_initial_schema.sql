-- CAP Dashboard: initial Supabase/Postgres schema
--
-- Modeled on the ACTUAL Firestore collections in frontend/src/api/apiClient.js
-- (clients, machines, service_records, job_cards, job_card_lines, sites, users,
-- knowledge_machines/notes/service_codes/media/documents, permissions, role_permissions),
-- not the generic vehicle/invoice suggestions in the original migration brief -- this is a
-- machine-servicing business (client -> site -> machine -> service record/job card), not
-- an automotive shop with customers/vehicles/quotations.
--
-- Phase 0 deliverable: schema + RLS only. Not yet applied to any project, not yet wired to
-- application code. Run manually via Supabase SQL editor or `supabase db push` after review.
--
-- NOTE ON RLS MODEL: mirrors firestore.rules today: every authenticated, active profile can
-- read most operational tables; writes require isAdmin() or an entry in effective_permissions.
-- This is a single-tenant deployment (one company), so there is no organization/company_id
-- scoping in this first pass -- add it only if multi-tenant use is actually planned.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users; auth.users itself is managed by Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'staff',
  is_active boolean not null default true,
  effective_permissions text[] not null default '{}',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is 'One row per authenticated user. Populated by a trigger on auth.users insert; role/effective_permissions maintained by admins, mirrors former Firestore users/{uid}.';

-- ---------------------------------------------------------------------------
-- Permissions catalogue + role -> permission mapping
-- ---------------------------------------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  permission_key text not null references public.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, permission_key)
);

-- ---------------------------------------------------------------------------
-- Clients / Sites / Machines
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.clients is 'Field names match frontend/src/pages/AddClient.jsx form fields verbatim (company_name/contact_person/email/phone/address), not the placeholder names used in this file before the 2026-08-03 Phase 1 correction.';

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sites_client_id_idx on public.sites (client_id);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  site_id uuid references public.sites (id) on delete set null,
  brand text,
  model text,
  serial_number text,
  machine_type text,
  refrigerant_type text,
  installation_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.machines is 'Field names match frontend/src/pages/MachineDetail.jsx display fields (brand/model/machine_type/serial_number/refrigerant_type/installation_date) confirmed 2026-08-03. No plain status/name column exists on the real Firestore machine doc as read by the client.';
create index machines_client_id_idx on public.machines (client_id);
create index machines_site_id_idx on public.machines (site_id);

-- ---------------------------------------------------------------------------
-- Service records / Job cards
-- ---------------------------------------------------------------------------
create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines (id) on delete cascade,
  technician_name text,
  status text,
  next_service_due date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_records_machine_id_idx on public.service_records (machine_id);
create index service_records_next_service_due_idx on public.service_records (next_service_due);
comment on table public.service_records is 'Field names match frontend/src/api/apiClient.js calendarEvents() usage (next_service_due drives the Calendar page derived events; technician_name is a free-text field, not a users FK) confirmed 2026-08-03.';

-- Status values observed in frontend/src/pages/JobCardDetail.jsx STATUSES constant:
-- "Open", "Booked In", "In Progress", "Waiting for Parts", "Ready for Collection",
-- "Completed", "Collected". Stored as free text (not an enum type) to avoid a schema
-- change every time the UI adds a status, matching Firestore's schemaless behavior.
create table public.job_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  machine_id uuid references public.machines (id) on delete set null,
  status text not null default 'Open',
  fault_description text,
  technician_name text,
  technician_notes text,
  arrival_condition text,
  date_completed date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_cards_client_id_idx on public.job_cards (client_id);
create index job_cards_machine_id_idx on public.job_cards (machine_id);
create index job_cards_status_idx on public.job_cards (status);
comment on table public.job_cards is 'Field names match frontend/src/pages/JobCardDetail.jsx editForm fields (status/fault_description/technician_name/technician_notes/date_completed) confirmed 2026-08-03. client_id/machine_id are nullable because JobCardDetail.jsx allows clearing them via the edit form.';

-- Line types observed in frontend/src/pages/JobCardDetail.jsx LINE_TYPES constant:
-- "Labour", "Part / Product", "Diagnosis", "Other". Stored as free text, same reasoning
-- as job_cards.status above.
create table public.job_card_lines (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards (id) on delete cascade,
  line_type text not null default 'Labour',
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_card_lines_job_card_id_idx on public.job_card_lines (job_card_id);
comment on table public.job_card_lines is 'Field names match frontend/src/pages/JobCardDetail.jsx AddLineForm/line rendering (line_type/description/quantity/unit_price/line_total) confirmed 2026-08-03.';

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------
create table public.knowledge_machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_notes (
  id uuid primary key default gen_random_uuid(),
  knowledge_machine_id uuid not null references public.knowledge_machines (id) on delete cascade,
  title text,
  body text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_notes_machine_id_idx on public.knowledge_notes (knowledge_machine_id);

create table public.knowledge_service_codes (
  id uuid primary key default gen_random_uuid(),
  knowledge_machine_id uuid not null references public.knowledge_machines (id) on delete cascade,
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_service_codes_machine_id_idx on public.knowledge_service_codes (knowledge_machine_id);

create table public.knowledge_media (
  id uuid primary key default gen_random_uuid(),
  knowledge_machine_id uuid not null references public.knowledge_machines (id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_media_machine_id_idx on public.knowledge_media (knowledge_machine_id);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  knowledge_machine_id uuid not null references public.knowledge_machines (id) on delete cascade,
  storage_path text not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_documents_machine_id_idx on public.knowledge_documents (knowledge_machine_id);

-- ---------------------------------------------------------------------------
-- Notifications / audit log (new, not in current Firestore model, but requested)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_id_idx on public.notifications (user_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'users', 'permissions', 'role_permissions', 'clients', 'sites', 'machines',
    'service_records', 'job_cards', 'job_card_lines', 'knowledge_machines',
    'knowledge_notes', 'knowledge_service_codes', 'knowledge_media',
    'knowledge_documents', 'notifications'
  ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auto-create a public.users row when a new auth.users row is created
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
