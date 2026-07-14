-- Restores the pre-065 explicit grants. This rollback is intentionally
-- security-reducing and should only be used for controlled incident recovery.

grant execute on function public.apply_lead_action(
  uuid, text, text, text, text, text, timestamptz, timestamptz
) to anon, authenticated;
grant execute on function public.create_contact_tx(
  uuid, text, text, text, text, text, text, text, boolean
) to anon, authenticated;
grant execute on function public.set_primary_contact(uuid, uuid)
  to anon, authenticated;
grant execute on function public.convert_lead_to_project(
  uuid, text, text, timestamptz
) to anon, authenticated;
grant execute on function public.create_proposal_version_tx(
  uuid, uuid, jsonb, text, text, text, text, uuid[], text, timestamptz
) to anon, authenticated;
grant execute on function public.request_proposal_approval_tx(
  uuid, text, timestamptz
) to anon, authenticated;
grant execute on function public.decide_proposal_approval_tx(
  uuid, integer, text, text, uuid, timestamptz
) to anon, authenticated;
