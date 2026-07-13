-- Rollback for 060_convert_lead_to_project.
drop function if exists public.convert_lead_to_project(uuid,text,text,timestamptz);
alter table public.lead_action_audit
  drop constraint if exists lead_action_audit_action_check;
alter table public.lead_action_audit
  add constraint lead_action_audit_action_check
  check (action in ('called','no_answer','meeting','later','note'));
drop index if exists public.projects_lead_unique;
