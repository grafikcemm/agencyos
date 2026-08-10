-- 073_rpc_acl_and_function_search_path
-- Closes advisor findings after the lifecycle RPC signature changed in 069.
-- PostgreSQL's default EXECUTE grant and Supabase's explicit API-role grants
-- must both be removed from SECURITY DEFINER functions.

BEGIN;

REVOKE ALL ON FUNCTION public.apply_lead_action(
  uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_lead_action(
  uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb
) TO service_role;

-- The trigger body needs only pg_catalog.now(); an explicit path prevents
-- caller-controlled object resolution.
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog;

COMMIT;
