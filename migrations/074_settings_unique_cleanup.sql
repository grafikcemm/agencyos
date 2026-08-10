-- 074_settings_unique_cleanup
-- Migration 001 already created UNIQUE(key) as settings_key_key. Migration 013
-- added the identical settings_key_unique constraint. Keep the original
-- constraint and remove only the duplicate.

BEGIN;

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_key_unique;

COMMIT;
