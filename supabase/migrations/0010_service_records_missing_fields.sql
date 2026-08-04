-- Adds service_records.service_date/work_performed/findings -- found missing during the
-- 2026-08-04 remaining-collections spot-check. Confirmed real via the two actual
-- record-creation forms, frontend/src/components/LogServiceModal.jsx and
-- frontend/src/components/ServiceForm.jsx (the latter also has `findings`, a third field
-- missing from 0001): service_date is REQUIRED in both forms (submit button disabled
-- without it), work_performed and findings are both real Textareas, not test artifacts.
-- Confirmed present on all 7 real service_records docs (service_date/work_performed on
-- all 7; findings appears as "" on some, absent on others -- consistent with an optional
-- field, not evidence it's fake).
--
-- 0001_initial_schema.sql's service_records table never had columns for any of these three
-- -- migrating as the schema stood would have silently dropped the actual service date and
-- both free-text fields for every real service record.
--
-- (Also checked and confirmed NOT a gap needing a fix: `status` IS already a column in
-- 0001, but neither creation form has a status field and no real doc has ever set one --
-- appears to be vestigial/unused, left in place since it's harmless (nullable) and
-- removing an existing applied column is a separate, more invasive decision than adding
-- missing ones.)

alter table public.service_records add column if not exists service_date date;
alter table public.service_records add column if not exists work_performed text;
alter table public.service_records add column if not exists findings text;

create index if not exists service_records_service_date_idx on public.service_records (service_date);
