-- Adds machines.warranty_expiry -- found missing during the 2026-08-04 spot-check of all
-- remaining collections (clients/machines/service_records/knowledge_machines) done after
-- the job_cards gap (0008) turned up. Confirmed real and universally present: every one of
-- the 6 real machines docs has this field (even if often empty string ""), and it's
-- actively used by frontend/src/components/MachineForm.jsx (date input,
-- `warranty_expiry: initial?.warranty_expiry || ""`) and
-- frontend/src/pages/MachineDetail.jsx (warranty-active/expiring-soon logic and display).
-- 0001_initial_schema.sql never gave machines a column for it.
--
-- (Also checked and confirmed NOT a gap: machine_type IS already a column in 0001 and IS
-- real/used code (BookIn.jsx, MachineDetail.jsx, ClientDetail.jsx, InvoiceQueue.jsx,
-- LogServiceModal.jsx) -- it's simply unpopulated on all 6 current Firestore docs, which
-- is a data-entry fact, not a schema gap.)

alter table public.machines add column if not exists warranty_expiry date;
