-- Controlled rollback for migration 073. This intentionally restores the
-- previous advisor-visible state and should be used only for incident recovery.

BEGIN;

ALTER FUNCTION public.update_updated_at() RESET search_path;

GRANT EXECUTE ON FUNCTION public.apply_lead_action(
  uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb
) TO PUBLIC, anon, authenticated;

COMMIT;
