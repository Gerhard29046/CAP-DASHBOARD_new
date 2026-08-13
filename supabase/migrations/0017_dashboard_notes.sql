-- Personal dashboard sticky notes (2026-08-13, explicit user request -- "something like
-- Windows sticky notes" on the Dashboard). Mirrors the new Firestore `dashboard_notes`
-- collection/rules added the same day (firestore.rules) so both backends stay in parity
-- even though Firebase remains the only live-serving backend right now.
--
-- Own-notes-only, no admin bypass -- these are personal scratch notes, not business
-- records other roles need to review or audit (unlike every other table in this schema,
-- which uses permission-key-gated RLS via has_permission()).

create table public.dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users (id) on delete cascade,
  content text not null,
  color text not null default 'yellow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dashboard_notes_created_by_idx on public.dashboard_notes (created_by);

alter table public.dashboard_notes enable row level security;

create policy dashboard_notes_select_own on public.dashboard_notes
  for select using (auth.uid() = created_by);
create policy dashboard_notes_insert_own on public.dashboard_notes
  for insert with check (auth.uid() = created_by);
create policy dashboard_notes_update_own on public.dashboard_notes
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy dashboard_notes_delete_own on public.dashboard_notes
  for delete using (auth.uid() = created_by);
