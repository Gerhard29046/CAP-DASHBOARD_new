-- 0031_service_records_default_next_service_due.sql
--
-- Explicit user request (2026-08-18): "please update the services once 1 is done it needs to
-- be populated for 1 year later. so for instance if i did my service today - next year it must
-- come up on the calendar as upcoming services." Today `next_service_due` (the column that
-- drives both Dashboard's calendar -- frontend/src/api/supabaseApiClient.js's calendarEvents()
-- -- and UpcomingServices.jsx) is a plain optional free-text date field on both service-logging
-- forms (ServiceForm.jsx / LogServiceModal.jsx); nothing ever defaulted it, so a technician who
-- didn't manually type a follow-up date left that service permanently invisible to both.
--
-- Fixed at the DB layer (trigger), not just in the web client's JS, so the default applies no
-- matter which client creates the row -- web (ServiceForm.jsx/LogServiceModal.jsx) AND Android
-- (SupabaseData.kt, per CLAUDE.md 6.2 -- Android writes service_records through the exact same
-- Postgres table/RLS, no separate backend). A client-side-only default would silently miss
-- Android and any future integration.
--
-- Trigger logic, deliberately narrow to avoid ever overriding an explicit user choice:
--   - Only fills next_service_due when the caller left it NULL. A technician who types their
--     own follow-up date (any date, including intentionally < or > 1 year) always wins.
--   - Only fires the first time a row gets a service_date: TG_OP = INSERT with service_date
--     already set (ServiceForm.jsx's single-step create), OR an UPDATE where OLD.service_date
--     was NULL and NEW.service_date is not (LogServiceModal.jsx's two-phase create -- it
--     inserts a bare row with just machine_id first so photo uploads have an id to scope to,
--     then UPDATEs in service_date/next_service_due/etc. together once the technician finishes
--     the form). This intentionally does NOT re-fire on a later edit of an already-serviced
--     record (OLD.service_date already set) -- if a technician clears next_service_due on an
--     existing record afterward, that clears it; it does not get silently re-populated.
create or replace function public.set_default_next_service_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.next_service_due is null
     and new.service_date is not null
     and (tg_op = 'INSERT' or old.service_date is null) then
    new.next_service_due := (new.service_date + interval '1 year')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists set_default_next_service_due on public.service_records;
create trigger set_default_next_service_due
before insert or update on public.service_records
for each row execute function public.set_default_next_service_due();
