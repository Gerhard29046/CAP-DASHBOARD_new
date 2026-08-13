-- Fixes a real, live-confirmed defect (found 2026-08-12 via two empirical tests: a real
-- insert into `clients` and a real update on `machines`, both with an actively SUBSCRIBED
-- postgres_changes channel listening -- zero events received either time). No prior
-- migration ever added any table to the `supabase_realtime` publication, which is what
-- actually turns on postgres_changes delivery in Supabase (a table isn't realtime-enabled
-- just by existing/having RLS).
--
-- Scope deliberately limited to exactly the two tables the frontend actually depends on for
-- realtime today: `ClientDetail.jsx`'s `apiClient.entities.Client.watch(id, ...)` +
-- `apiClient.entities.Machine.subscribe({}, ...)`, and `MachineDetail.jsx`'s
-- `apiClient.entities.Machine.watch(id, ...)` (see supabaseApiClient.js's makeEntity()).
-- No other page currently calls `.watch()`/`.subscribe()` on any other table (confirmed via
-- a full frontend grep 2026-08-12) -- not adding tables nobody currently subscribes to.
--
-- RLS still applies to realtime delivery (Supabase's Realtime server enforces the same RLS
-- policies already defined in 0002_rls_policies.sql for postgres_changes payloads), so this
-- does not create any new read-access exposure -- it only makes already-permitted reads
-- arrive as live pushes instead of requiring a manual re-query.

alter publication supabase_realtime add table public.clients, public.machines;
