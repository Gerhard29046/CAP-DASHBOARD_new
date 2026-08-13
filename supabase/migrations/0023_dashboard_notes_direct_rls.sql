-- Dashboard sticky notes: switch from server-side-only access (first a Firebase Cloud
-- Function, then briefly a Cloudflare Worker -- both retired same-day, see
-- docs/ai-memory/DECISIONS.md's 2026-08-13 entries for the full history) to direct
-- Supabase Auth + RLS, matching every other table in this schema. The original design
-- (0017_dashboard_notes.sql) reasoned RLS "can't express creator-or-admin" -- that was
-- incorrect for this codebase specifically: public.is_admin() (0002_rls_policies.sql)
-- already exists and is already the exact pattern used for this everywhere else (see
-- public.users' own policies in that file). Explicit user approval for this exact change,
-- 2026-08-13.
--
-- Validation that used to live in application code (Cloud Function, then Worker) moves
-- into the database here, since there's no longer a trusted server-side layer in front of
-- writes.

-- --- Validation constraints, table currently empty (0 rows) in production, safe to add
--     directly without a NOT VALID / VALIDATE CONSTRAINT split --------------------------
alter table public.dashboard_notes
  add constraint dashboard_notes_content_length check (char_length(content) <= 2000);

-- BEHAVIOR CHANGE, documented per explicit instruction: the retired Worker silently
-- coerced an unrecognized color to 'yellow' rather than rejecting it. A CHECK constraint
-- cannot silently coerce -- it can only accept or reject. Rejecting is the more correct
-- behavior (silent coercion hid bad client input rather than surfacing it) and matches
-- this schema's existing convention of CHECK constraints for bounded value sets elsewhere.
-- The frontend client (frontend/src/api/dashboardNotesClient.js) still defaults `color` to
-- 'yellow' itself before ever sending a request, so this is only reachable via a
-- malformed/direct API call, not normal UI usage.
alter table public.dashboard_notes
  add constraint dashboard_notes_color_valid check (color in ('yellow', 'blue', 'green', 'pink'));

-- --- created_by_name: server-resolved on create, immutable after -----------------------
-- Guarantees a client can never claim another user's display name, on INSERT (where it's
-- resolved from the actual authenticated user, ignoring whatever the client sends) or via
-- a raw UPDATE call that isn't going through the normal "only content/updated_at change"
-- frontend path (where it's pinned to its existing value, exactly matching the retired
-- Worker's updateNote(), which never touched this column). SECURITY DEFINER + fixed
-- search_path matches the existing public.restrict_self_user_update_trigger pattern
-- (0002_rls_policies.sql) for the same class of problem on public.users.
create or replace function public.set_dashboard_note_created_by_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(full_name, email, 'Someone') into new.created_by_name
    from public.users where id = auth.uid();
    if new.created_by_name is null then
      new.created_by_name := 'Someone';
    end if;
  elsif tg_op = 'UPDATE' then
    new.created_by_name := old.created_by_name;
  end if;
  return new;
end;
$$;

create trigger set_dashboard_note_created_by_name_trigger
  before insert or update on public.dashboard_notes
  for each row execute function public.set_dashboard_note_created_by_name();

-- --- RLS policies ------------------------------------------------------------------------
-- RLS was enabled with zero policies in 0017 (deny-all for anon/authenticated -- only the
-- service-role client, used exclusively by the now-retired Cloud Function/Worker, could
-- reach this table). Adding real policies now for direct client access.

create policy dashboard_notes_select on public.dashboard_notes
  for select using (auth.uid() is not null);

-- The trigger above does not overwrite created_by itself (only created_by_name) -- this
-- `with check` is the real, sole gate preventing a client from creating a note attributed
-- to someone else.
create policy dashboard_notes_insert on public.dashboard_notes
  for insert with check (created_by = auth.uid());

create policy dashboard_notes_update on public.dashboard_notes
  for update using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy dashboard_notes_delete on public.dashboard_notes
  for delete using (created_by = auth.uid() or public.is_admin());
