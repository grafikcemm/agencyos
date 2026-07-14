-- 065_rpc_acl_hardening — App DB
--
-- Supabase may carry explicit EXECUTE grants for anon/authenticated in addition
-- to PostgreSQL's PUBLIC grant. Revoking only PUBLIC is therefore insufficient
-- for SECURITY DEFINER RPCs. Keep these operational mutations service-role-only.

revoke all on function public.apply_lead_action(
  uuid, text, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_lead_action(
  uuid, text, text, text, text, text, timestamptz, timestamptz
) to service_role;

revoke all on function public.create_contact_tx(
  uuid, text, text, text, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.create_contact_tx(
  uuid, text, text, text, text, text, text, text, boolean
) to service_role;

revoke all on function public.set_primary_contact(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_primary_contact(uuid, uuid)
  to service_role;

revoke all on function public.convert_lead_to_project(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.convert_lead_to_project(
  uuid, text, text, timestamptz
) to service_role;

revoke all on function public.create_proposal_version_tx(
  uuid, uuid, jsonb, text, text, text, text, uuid[], text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_proposal_version_tx(
  uuid, uuid, jsonb, text, text, text, text, uuid[], text, timestamptz
) to service_role;

revoke all on function public.request_proposal_approval_tx(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.request_proposal_approval_tx(
  uuid, text, timestamptz
) to service_role;

revoke all on function public.decide_proposal_approval_tx(
  uuid, integer, text, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.decide_proposal_approval_tx(
  uuid, integer, text, text, uuid, timestamptz
) to service_role;
