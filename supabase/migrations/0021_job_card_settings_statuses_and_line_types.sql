-- Extends the existing job_card_settings singleton (0018) with two more real,
-- administrator-editable lists, per explicit user request ("job statuses", "service
-- types" in the Settings > Job Cards area). Both default to exactly the values already
-- hardcoded in the frontend today, so applying this migration changes NOTHING visually
-- until an administrator actually edits them in Settings.
--
-- Deliberately bounded: this does NOT change job_cards.status or job_card_lines.line_type
-- themselves (still plain text, unconstrained, matching the existing "no enum, avoid a
-- migration every time the UI adds a value" design already documented in
-- 0001_initial_schema.sql). It only makes the *lists offered in the UI* configurable.
-- JobCardDetail.jsx's status-badge/variant maps already have a safe fallback for any
-- unmapped status string (`STATUS_VARIANT[status] || "neutral"`), so an administrator
-- adding a custom status here cannot crash the UI, it just renders with a neutral badge.

alter table public.job_card_settings
  add column available_statuses jsonb not null default '["Open","Booked In","In Progress","Waiting for Parts","Ready for Collection","Completed","Collected"]'::jsonb;
comment on column public.job_card_settings.available_statuses is 'Status options offered in JobCardDetail.jsx''s "Update Status" control. Editable in Settings > Job Cards. Defaults to the exact list previously hardcoded there.';

alter table public.job_card_settings
  add column line_types jsonb not null default '["Labour","Part / Product","Diagnosis","Other"]'::jsonb;
comment on column public.job_card_settings.line_types is 'Line-item "Type" options offered in JobCardDetail.jsx''s Add/Edit Line form. Editable in Settings > Job Cards. Defaults to the exact list previously hardcoded there.';
