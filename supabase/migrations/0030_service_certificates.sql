-- 0030_service_certificates.sql
--
-- Service Certificate feature (Batch A of the certificate/email workflow, 2026-08-17 --
-- explicit user objective: "Generate Service Certificate" on a completed service record,
-- branded PDF, downloadable, later emailable). This migration covers the DB/Storage side
-- only -- no email infrastructure yet (Batch B, blocked on the user's Resend account/API key
-- + a Supabase Edge Function, neither of which exist yet).
--
-- Reuses existing architecture rather than inventing new patterns:
--   - Permission keys: services.view / services.edit (already gate service_records and the
--     photos bucket, see 0002_rls_policies.sql / 0024_photos_bucket_record_scoped_rls.sql).
--     No new permission key introduced for certificate generate/view/download.
--   - settings.access (already gates job_card_settings/products_services writes, see
--     0018_products_services_and_job_card_settings.sql) for the new company_settings table.
--   - Storage RLS pattern: a record-scoped can_access_*() security-definer function, exactly
--     mirroring can_access_service_record_photo() (0024) -- same shape, same has_permission()
--     boundary, same "existence check is a data-integrity safeguard, not the real access
--     control layer" reasoning.
--   - Singleton settings-row pattern for company_settings, exactly mirroring
--     job_card_settings (0018): id boolean primary key default true, single seeded row,
--     select any active profile / update settings.access only.
--
-- APPLIED 2026-08-17/18 -- confirmed live via supabase/scripts/qa-check-0030-applied.mjs
-- (public.service_certificates / public.company_settings / generate_service_certificate() all
-- present). This comment previously said "NOT YET APPLIED"; corrected once independently
-- reverified, not left stale.

-- ---------------------------------------------------------------------------
-- company_settings: singleton row of CAP's own details for the certificate header/footer.
-- Deliberately does NOT hardcode fake address/phone/VAT -- only company_name is seeded with
-- a real, already-used-in-the-app value (frontend/src/pages/Login.jsx's own branding text);
-- everything else stays null until an admin fills it in via Settings > General, per the
-- explicit "do not invent fields or populate unavailable information with fake data"
-- instruction. The certificate PDF omits any null field's line entirely rather than
-- printing a placeholder.
-- ---------------------------------------------------------------------------
create table public.company_settings (
  id boolean primary key default true,
  constraint company_settings_singleton check (id),
  company_name text not null default 'Connoisseur Automotive Products (Cape) C.C.',
  address text,
  phone text,
  email text,
  vat_number text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);
insert into public.company_settings (id) values (true);
comment on table public.company_settings is 'Single-row CAP company profile (name/address/phone/email/VAT), administrator-editable via Settings > General. Used by the Service Certificate PDF header/footer -- see frontend/src/lib/serviceCertificatePdf.js. Not a general-purpose settings dumping ground; only add columns here that a real feature actually reads.';

create trigger set_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();

alter table public.company_settings enable row level security;

create policy company_settings_select on public.company_settings
  for select using (public.has_active_profile());
create policy company_settings_update on public.company_settings
  for update using (public.has_permission('settings.access'));

grant select, update on public.company_settings to authenticated;

-- ---------------------------------------------------------------------------
-- service_certificates: one row per service_record that has ever had a certificate
-- generated. certificate_number is assigned ONCE (via generate_service_certificate() below)
-- and never changes on regeneration -- "Do not change the certificate number every time the
-- PDF is regenerated" per the explicit spec. pdf_path is a PERMANENT Storage object path
-- (never a signed URL), matching the existing service_records.photos /
-- job_cards.arrival_photos convention (0024) -- a fresh signed URL is generated on demand at
-- display/download time by the frontend, never stored.
-- ---------------------------------------------------------------------------
create table public.service_certificates (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null unique references public.service_records (id) on delete cascade,
  certificate_number text not null unique,
  pdf_path text,
  include_photos boolean not null default true,
  generated_by uuid references public.users (id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_certificates_service_record_id_idx on public.service_certificates (service_record_id);
comment on table public.service_certificates is 'One row per service_records that has had a certificate generated (unique on service_record_id -- regenerating updates the same row, never creates a second number). certificate_number is assigned server-side by generate_service_certificate() using a real sequence, never client-side. pdf_path is a permanent service-certificates Storage bucket object path, not a signed URL.';

create trigger set_updated_at before update on public.service_certificates
  for each row execute function public.set_updated_at();

alter table public.service_certificates enable row level security;

-- No INSERT policy/grant, deliberately: the only way a row can be created is through
-- generate_service_certificate() below, a security-definer function that runs as its owner
-- (bypassing RLS/grants entirely) and does its own explicit has_permission('services.edit')
-- check first -- exactly the "has_permission() check runs FIRST and is the real security
-- boundary" pattern 0024's header comment already established for this codebase. This closes
-- off any path for a client to insert a row with a spoofed/arbitrary certificate_number.
create policy service_certificates_select on public.service_certificates
  for select using (public.has_permission('services.view'));
-- UPDATE is real and needed: after generate_service_certificate() returns a row,
-- frontend/src/lib/serviceCertificatePdf.js builds the actual PDF client-side and uploads it
-- to Storage, then updates THIS row's pdf_path to point at the uploaded object. No column
-- other than pdf_path is expected to be updated this way in practice, but RLS can't restrict
-- to a single column (same limitation noted in 0002_rls_policies.sql for
-- restrict_self_user_update_trigger) -- acceptable here since services.edit already gates
-- every other write to this table's parent record anyway.
create policy service_certificates_update on public.service_certificates
  for update using (public.has_permission('services.edit'));

grant select, update on public.service_certificates to authenticated;

-- ---------------------------------------------------------------------------
-- Certificate numbering: CAP-SVC-{year}-{6-digit sequence}, e.g. CAP-SVC-2026-000123.
--
-- DELIBERATE SIMPLIFICATION, disclosed: the sequence is GLOBAL, not reset to 1 on January 1st
-- each year -- the {year} in the number reflects the year the certificate was FIRST
-- generated, but the numeric part keeps counting up across year boundaries (e.g. the last
-- certificate of 2026 might be CAP-SVC-2026-000180 and the first of 2027
-- CAP-SVC-2027-000181, not reset to 000001). This is still unique/persistent/server-side-
-- generated as required; a strict per-year reset would need a year-keyed counter table with
-- its own locking and was judged unnecessary complexity unless the user specifically wants
-- annual reset -- flag if that's actually required.
-- ---------------------------------------------------------------------------
create sequence public.service_certificate_number_seq start with 1;

create or replace function public.generate_service_certificate(
  p_service_record_id uuid,
  p_include_photos boolean default true
)
returns public.service_certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.service_certificates;
  new_number text;
  result public.service_certificates;
begin
  if not public.has_permission('services.edit') then
    raise exception 'Not permitted to generate a service certificate.';
  end if;

  if not exists (select 1 from public.service_records where id = p_service_record_id) then
    raise exception 'Service record not found.';
  end if;

  select * into existing from public.service_certificates where service_record_id = p_service_record_id;
  if found then
    update public.service_certificates
      set include_photos = p_include_photos,
          generated_by = auth.uid(),
          generated_at = now()
      where id = existing.id
      returning * into result;
    return result;
  end if;

  new_number := 'CAP-SVC-' || extract(year from now())::text || '-'
    || lpad(nextval('public.service_certificate_number_seq')::text, 6, '0');

  insert into public.service_certificates
    (service_record_id, certificate_number, include_photos, generated_by, generated_at)
  values
    (p_service_record_id, new_number, p_include_photos, auth.uid(), now())
  returning * into result;

  return result;
end;
$$;

grant execute on function public.generate_service_certificate(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: new private `service-certificates` bucket, PDF only. Path convention:
--   service-certificates/{service_record_id}/{certificate_number}.pdf
-- (bucket_id already scopes to "service-certificates", so the object name itself only needs
-- the {service_record_id} folder segment -- unlike the shared `photos` bucket, which needs an
-- extra service-records/job-cards discriminator segment because it serves two record types.)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-certificates', 'service-certificates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create or replace function public.can_access_service_certificate(object_name text, required_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  segments text[];
  record_id uuid;
begin
  if not public.has_permission(required_permission) then
    return false;
  end if;

  segments := storage.foldername(object_name);
  if segments is null or array_length(segments, 1) <> 1 then
    return false;
  end if;

  begin
    record_id := segments[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (select 1 from public.service_records where id = record_id);
end;
$$;

create policy service_certificates_files_select on storage.objects
  for select using (
    bucket_id = 'service-certificates'
    and public.can_access_service_certificate(name, 'services.view')
  );

create policy service_certificates_files_insert on storage.objects
  for insert with check (
    bucket_id = 'service-certificates'
    and public.can_access_service_certificate(name, 'services.edit')
  );

create policy service_certificates_files_update on storage.objects
  for update using (
    bucket_id = 'service-certificates'
    and public.can_access_service_certificate(name, 'services.edit')
  )
  with check (
    bucket_id = 'service-certificates'
    and public.can_access_service_certificate(name, 'services.edit')
  );

create policy service_certificates_files_delete on storage.objects
  for delete using (
    bucket_id = 'service-certificates'
    and public.can_access_service_certificate(name, 'services.edit')
  );
