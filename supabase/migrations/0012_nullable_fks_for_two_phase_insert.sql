-- Fixes a real bug found live: migrate-firestore-to-postgres.mjs's two-phase design
-- (Phase A inserts entities with FK columns unset, Phase B UPDATEs them afterward via
-- legacy_firestore_id) only works if the FK column is nullable. job_cards.client_id/
-- machine_id already are (0001), which is why job_cards succeeded on the first real
-- --apply run (2026-08-04). machines.client_id, service_records.machine_id, and
-- job_card_lines.job_card_id were NOT NULL, so every insert into those three tables
-- failed outright with "null value in column ... violates not-null constraint" --
-- confirmed live, zero rows written to any of the four affected tables (verify phase
-- confirmed 0 rows post-attempt, matching Firestore counts of 6/7/3 respectively still
-- unmigrated).
--
-- Also fixes knowledge_machines.name: the original (now-vestigial, since 0011) column is
-- still NOT NULL, but the mapper rewritten in 0011 no longer supplies it at all (the real
-- field is model_name, not name) -- same failure mode, same fix.
--
-- This does NOT weaken any real data-integrity guarantee: FK correctness is still enforced
-- by the `references` constraint itself (an invalid client_id/machine_id/job_card_id value
-- is still rejected) -- only the NOT NULL requirement is relaxed, matching the existing
-- job_cards precedent, to allow the insert-then-relink two-phase pattern to work. Once the
-- migration script's relink phase runs, these columns will be populated for every real row
-- exactly as job_cards' already are.

alter table public.machines alter column client_id drop not null;
alter table public.service_records alter column machine_id drop not null;
alter table public.job_card_lines alter column job_card_id drop not null;
alter table public.knowledge_machines alter column name drop not null;
