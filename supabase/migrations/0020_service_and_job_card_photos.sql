-- Closes a real, pre-existing (not migration-caused) gap documented in
-- docs/ai-memory/PROJECT_STATE.md's 2026-08-06 entry: `service_records.photos` and
-- `job_cards.arrival_photos` are both read by real frontend display code
-- (MachineDetail.jsx / ServiceRecords.jsx / JobCardDetail.jsx expect an array of URLs) but
-- neither column has ever existed in Postgres, and neither write path
-- (LogServiceModal.jsx / BookIn.jsx) actually wrote to them -- BookIn.jsx instead stuffed
-- uploaded photo URLs into technician_notes as plain text. No data was ever lost by this
-- (confirmed zero real rows had either field populated as of the 2026-08-06 investigation)
-- -- this migration + its matching frontend fix (2026-08-13 redesign resume, Phase 9) make
-- the feature actually work going forward.

alter table public.service_records add column photos jsonb not null default '[]'::jsonb;
comment on column public.service_records.photos is 'Array of Supabase Storage signed URLs, written by LogServiceModal.jsx, read by MachineDetail.jsx/ServiceRecords.jsx.';

alter table public.job_cards add column arrival_photos jsonb not null default '[]'::jsonb;
comment on column public.job_cards.arrival_photos is 'Array of Supabase Storage signed URLs, written by BookIn.jsx, read by JobCardDetail.jsx.';
