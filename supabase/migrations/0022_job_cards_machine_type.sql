-- Closes a third real, confirmed instance of the same bug class found this session
-- (display/input code exists, but the field was never actually persisted): BookIn.jsx has
-- always had a "Machine Type" input (distinct from machines.machine_type -- this captures
-- what's reported/observed at booking-in time, e.g. "Wigam, Ecotechnics, Texa…" brand/
-- rig-type examples shown in its placeholder) and InvoiceQueue.jsx has always displayed
-- `item.machine_type` as a Sage-ready field, but job_cards never had this column at all,
-- and BookIn.jsx's create() payload never included form.machine_type even though the
-- input captured it -- so every job card's "Machine Type" was silently discarded on save.
--
-- Only adds this one column. Does not touch machines.machine_type (already a real,
-- separate, working column as of this session's MachineForm.jsx fix).

alter table public.job_cards add column machine_type text;
comment on column public.job_cards.machine_type is 'Machine type as reported/observed at Book In time (may differ from or supplement machines.machine_type). Written by BookIn.jsx, read by InvoiceQueue.jsx.';
