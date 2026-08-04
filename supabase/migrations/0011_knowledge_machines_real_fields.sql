-- Adds the REAL knowledge_machines fields -- this is the most severe gap found during the
-- 2026-08-04 remaining-collections spot-check. 0001_initial_schema.sql's knowledge_machines
-- table (name/model/description) does not match the real data AT ALL: the union of field
-- names across all 3 real Firestore docs is manufacturer/model_name/variant/product_code/
-- category/summary/supported_refrigerants/technical_specifications/main_functions -- there
-- is no `name`, `model`, or `description` field on any real document. Confirmed against the
-- actual create/edit form, frontend/src/pages/KnowledgeMachineForm.jsx, and the detail page,
-- frontend/src/pages/KnowledgeMachineDetail.jsx, which both use exactly this field set.
-- manufacturer/model_name are marked `required` in the real form.
--
-- Migrating against the old schema would have written every real knowledge_machines row as
-- effectively blank (name/model/description all null-or-empty, since none of those Firestore
-- field names exist) and silently dropped every actual field.
--
-- Old columns (name/model/description) are left in place, NOT dropped -- they appear to be
-- entirely vestigial (never populated by any real document or any code path found), but
-- dropping an already-applied column is a separate, more invasive decision than adding the
-- missing ones, and out of scope for fixing the immediate data-loss risk. Revisit once
-- fully confirmed dead if a schema cleanup pass happens later.
--
-- Types: supported_refrigerants/main_functions are both arrays in Firestore (joined/split
-- on comma or newline by the form) -> text[]. technical_specifications is a Firestore map
-- (free-form key: value pairs, parsed from "Name: Value" lines by the form) -> jsonb.

alter table public.knowledge_machines add column if not exists manufacturer text;
alter table public.knowledge_machines add column if not exists model_name text;
alter table public.knowledge_machines add column if not exists variant text;
alter table public.knowledge_machines add column if not exists product_code text;
alter table public.knowledge_machines add column if not exists category text;
alter table public.knowledge_machines add column if not exists summary text;
alter table public.knowledge_machines add column if not exists supported_refrigerants text[];
alter table public.knowledge_machines add column if not exists technical_specifications jsonb default '{}'::jsonb;
alter table public.knowledge_machines add column if not exists main_functions text[];

create index if not exists knowledge_machines_manufacturer_idx on public.knowledge_machines (manufacturer);
create index if not exists knowledge_machines_model_name_idx on public.knowledge_machines (model_name);
