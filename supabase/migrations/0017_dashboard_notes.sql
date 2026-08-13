-- Dashboard sticky notes. Global (every signed-in user sees every note), only the creator
-- or an admin may edit/delete a note, optionally linked to a client (shown as a colored
-- label in the UI).
--
-- `created_by`/`client_id` are real foreign keys (post-cutover, 2026-08-13 -- both
-- `public.users` and `public.clients` are now the live source of truth in Supabase; an
-- earlier draft of this migration had them as plain text columns referencing
-- Firebase/Firestore IDs, back when Firebase was still the active backend).
--
-- All real access goes through the `dashboardNotes` Cloud Function
-- (functions/lib/dashboardNotes.js), which uses the service-role client and enforces
-- "global read, creator-or-admin write/delete" in code, verifying the caller's identity
-- from their Supabase session token via the existing requireUser()/verifySupabaseUser()
-- auth chain. RLS is enabled with zero policies as defense-in-depth (deny-all for anon/
-- authenticated) -- the service role bypasses RLS entirely by design, so this does not
-- block the Cloud Function; a direct browser-to-Supabase call for this table is not
-- expected to ever be a supported path, by design (server-side authorization only).

create table public.dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users (id) on delete cascade,
  created_by_name text,
  content text not null,
  color text not null default 'yellow',
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dashboard_notes_created_at_idx on public.dashboard_notes (created_at desc);
create index dashboard_notes_client_id_idx on public.dashboard_notes (client_id);

alter table public.dashboard_notes enable row level security;
-- No policies defined -- RLS with zero policies denies all access to anon/authenticated by
-- default; only the service-role client (used exclusively by the Cloud Function) bypasses
-- RLS and can reach this table.
