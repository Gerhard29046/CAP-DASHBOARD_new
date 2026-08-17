-- 0028_anon_grant_hardening.sql
--
-- Restores the `anon` (unauthenticated) defense-in-depth layer that 0002_rls_policies.sql
-- established for the original 18 tables, for every table created since. RLS itself was never
-- the gap here -- confirmed live via a full unauthenticated REST sweep of all 20 public tables
-- (supabase/scripts/qa-anon-grants-sweep.mjs): every table's real data is correctly withheld
-- from an anon-key request (16 return a hard 401/403, the 4 below return `200 []` -- RLS is
-- filtering rows out, not leaking them). The gap is that `client_imports`, `dashboard_notes`,
-- `job_card_settings`, and `products_services` (added in migrations 0017-0019, all AFTER
-- 0002's revoke) never received `anon`'s table-level grant.
--
-- Root cause: this Supabase project's platform-level bootstrap set a default privilege
-- (`alter default privileges ... grant ... to anon, authenticated`) before this repo's own
-- migrations began, independent of and not touched by 0002's per-table revoke (which only
-- affected tables that already existed at the time it ran) or its own default-privilege grant
-- (which only ever added privileges for `authenticated`, never touched `anon`'s pre-existing
-- default-privilege entry). Every table created since 0002 has therefore silently regained the
-- platform default `anon` grant, defeating the "no anon grant at all" intent 0002 documents.
--
-- This migration does two things:
--   1. Revokes the 4 currently-affected tables' anon grants directly (immediate remediation).
--   2. Re-runs 0002's own default-privilege statement, but as a REVOKE targeting `anon` instead
--      of a GRANT targeting `authenticated` -- so every table created by ANY future migration
--      (run through the same SQL Editor / `postgres` role) inherits no `anon` grant at all,
--      closing the gap permanently rather than needing to remember this for migration 0029+.
--
-- Does not touch `authenticated` privileges, RLS policies, or any function -- authenticated
-- (legitimate, signed-in) access is completely unaffected. Purely additive/tightening; safe to
-- apply to a live production table (no schema/data change, only privilege metadata).

revoke all on public.client_imports from anon;
revoke all on public.dashboard_notes from anon;
revoke all on public.job_card_settings from anon;
revoke all on public.products_services from anon;

-- Belt-and-braces: re-assert the schema-wide revoke and full-table-set revoke 0002 already did,
-- in case any other not-yet-audited table also silently regained an anon grant the same way.
-- Safe/no-op for tables that already correctly have no anon grant.
revoke all on all tables in schema public from anon;

-- The actual permanent fix: stop future migrations from needing this same corrective step.
alter default privileges in schema public revoke all on tables from anon;
