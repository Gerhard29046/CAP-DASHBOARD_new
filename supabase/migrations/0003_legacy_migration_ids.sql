-- Adds legacy_firestore_id columns needed by
-- supabase/scripts/migrate-firestore-to-postgres.mjs to preserve the original Firestore
-- document ID during import, so a later pass can re-link foreign keys (client_id,
-- machine_id, job_card_id, knowledge_machine_id) from Firestore-doc-id references to the
-- newly generated Postgres uuids. Not yet used for that re-linking -- see the script's
-- TODO section. Kept as a separate migration (rather than folded into 0001) because, at
-- the time this was written, it was not yet known whether 0001 had already been applied
-- to the live project.

alter table public.clients add column legacy_firestore_id text unique;
alter table public.machines add column legacy_firestore_id text unique;
alter table public.service_records add column legacy_firestore_id text unique;
alter table public.job_cards add column legacy_firestore_id text unique;
alter table public.job_card_lines add column legacy_firestore_id text unique;
alter table public.knowledge_machines add column legacy_firestore_id text unique;

create index clients_legacy_firestore_id_idx on public.clients (legacy_firestore_id);
create index machines_legacy_firestore_id_idx on public.machines (legacy_firestore_id);
create index service_records_legacy_firestore_id_idx on public.service_records (legacy_firestore_id);
create index job_cards_legacy_firestore_id_idx on public.job_cards (legacy_firestore_id);
create index job_card_lines_legacy_firestore_id_idx on public.job_card_lines (legacy_firestore_id);
create index knowledge_machines_legacy_firestore_id_idx on public.knowledge_machines (legacy_firestore_id);
