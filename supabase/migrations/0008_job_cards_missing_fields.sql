-- Adds job_number/date_received to public.job_cards -- a real gap found 2026-08-04 while
-- spot-checking a live dry-run of the migration script (per
-- docs/migration/PHASE2_CUTOVER_CHECKLIST.md section 2, step 6: "manually spot-check a
-- handful of real records field-by-field against their Firestore originals").
--
-- Confirmed via a read-only Firestore read (not assumed) that ALL 4 real job_cards docs in
-- the live project have both fields populated, and that job_number/date_received are
-- actively read/written by real UI code, not test-only artifacts:
-- frontend/src/pages/BookIn.jsx (creates/sorts by both), JobCardDetail.jsx (edits both),
-- InvoiceQueue.jsx, Jobs.jsx, MachineDetail.jsx (all display/sort by them). Without this
-- migration, every real job card would have silently lost its job number and received date
-- during migration -- 0001_initial_schema.sql's job_cards table never had these columns at
-- all, so migrate-firestore-to-postgres.mjs's job_cards mapper was dropping them on the
-- floor (there was no `?? null` fallback masking a real value -- the columns simply didn't
-- exist to write to).
--
-- (Separately checked and NOT an issue: job_card_lines.line_type/line_total already have
-- Postgres columns with sensible defaults from 0001 -- 'Labour'/0 -- and the handful of
-- existing Firestore job_card_lines docs missing those fields are old/synthetic
-- (CODEX-E2E-prefixed job numbers) records that predate frontend/src/pages/JobCardDetail.jsx's
-- handleAddLine() always writing both. No schema change needed there.)

alter table public.job_cards add column if not exists job_number text;
alter table public.job_cards add column if not exists date_received date;

create index if not exists job_cards_date_received_idx on public.job_cards (date_received);
create index if not exists job_cards_job_number_idx on public.job_cards (job_number);
