-- Dashboard sticky notes (2026-08-13, explicit user request, revised after user
-- correction: "THE DATABASE MUST BE ON SUPABASE", notes must be GLOBAL (visible to
-- everyone) not per-user, only the creator or an admin may edit/delete, and a note may
-- optionally be linked to a client).
--
-- `created_by` is the Firebase UID (text), not a foreign key to `public.users(id)` --
-- the live app authenticates via Firebase today, and not every Firebase-authenticated
-- user is guaranteed to have a migrated `public.users` row yet. `created_by_name` is a
-- denormalized display-name snapshot (resolved server-side at creation time via
-- functions/lib/dashboardNotes.js) so the UI never needs a second lookup to show who
-- wrote a note.
--
-- `client_id` is a plain text reference to a *Firestore* client document ID, deliberately
-- NOT a foreign key to `public.clients(id)` (a different uuid scheme) -- clients are still
-- live data in Firestore (Firebase is the active backend); Supabase's `clients` table is
-- the dormant migrated copy. The frontend resolves the linked client's real name/details
-- client-side via the normal apiClient.entities.Client.get(client_id) call against live
-- Firestore data, not from this table.
--
-- All real access goes through the `dashboardNotes` Cloud Function (functions/index.js),
-- which uses the service-role client and enforces "global read, creator-or-admin write/
-- delete" in code -- Postgres RLS cannot see the caller's identity here since there is no
-- Supabase Auth session for a Firebase-authenticated user. RLS is still enabled and
-- explicitly deny-all for the anon/authenticated roles as defense-in-depth (no direct
-- browser-to-Supabase path for this table is expected to ever exist while Firebase remains
-- the active auth backend); the service role bypasses RLS entirely by design, so this does
-- not block the Cloud Function.

create table public.dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  created_by_name text,
  content text not null,
  color text not null default 'yellow',
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dashboard_notes_created_at_idx on public.dashboard_notes (created_at desc);
create index dashboard_notes_client_id_idx on public.dashboard_notes (client_id);

alter table public.dashboard_notes enable row level security;
-- No policies defined -- RLS with zero policies denies all access to anon/authenticated by
-- default; only the service-role client (used exclusively by the Cloud Function) bypasses
-- RLS and can reach this table.
