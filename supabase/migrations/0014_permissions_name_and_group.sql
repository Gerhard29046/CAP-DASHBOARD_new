-- Fixes a real gap found during Phase 3 QA (2026-08-11): `permissions`/`role_permissions`
-- were never included in migrate-firestore-to-postgres.mjs's entity mappings at all (0 rows
-- in both, confirmed live), and even once populated, two column mismatches would have broken
-- the real UI: frontend/src/pages/UserAdmin.jsx reads `permission.name` and `permission.group`
-- directly (Object.groupBy(..., p => p.group), `${p.name} ${p.description}`), and
-- supabaseApiClient.js's GET /permissions handler groups by `permission.group` too -- but
-- 0001_initial_schema.sql only ever gave `permissions` a `label` column and no `group` column
-- at all. Real Firestore data confirmed live: 76 permissions docs with `name`/`group` fields
-- (e.g. group="Calendar", group="System Administration"), 4 role_permissions docs (one per
-- role, each a permissions array -- flattened into individual (role, permission_key) rows by
-- supabase/scripts/migrate-permissions.mjs, matching the already-normalized Postgres shape).
--
-- Both tables are still empty in the real project as of this migration (confirmed via a live
-- read immediately before writing this file), so a straight rename is safe -- no real data to
-- lose or reshape after the fact.

alter table public.permissions rename column label to name;
alter table public.permissions add column if not exists "group" text;

comment on column public.permissions."group" is 'UI grouping category (e.g. "Calendar", "System Administration"), mirrors Firestore permissions/{id}.group. Quoted because group is a reserved word.';
