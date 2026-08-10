-- Controlled rollback for migration 074.

BEGIN;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_key_unique UNIQUE (key);

COMMIT;
