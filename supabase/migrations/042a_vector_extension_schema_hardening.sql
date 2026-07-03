-- Migration 042a — keep pgvector out of the exposed public schema.
-- 042 may install vector into the current default schema on existing projects;
-- the extension is relocatable, so move it to Supabase's extensions schema.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

COMMIT;
