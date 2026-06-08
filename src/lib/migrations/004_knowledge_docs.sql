-- Agency OS — Migration 004: knowledge_docs
-- Run this in the Supabase SQL Editor (app project).
--
-- Why: the knowledge/ markdown files are git-ignored, so they never deploy to
-- Vercel and the API/agent context readers found nothing in production. Moving
-- the docs into the DB keeps the personal/business content out of git while
-- serving it on serverless (no persistent disk).

CREATE TABLE IF NOT EXISTS knowledge_docs (
  key        text PRIMARY KEY,        -- filename, e.g. '00_GRAFIKCEM_CONTEXT.md'
  label      text,                    -- human label, e.g. 'Grafikcem Bağlamı'
  content    text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- Service-role only. The app always reads these server-side via supabaseAdmin,
-- which bypasses RLS. Enabling RLS with no policy denies anon/auth clients,
-- keeping the personal context private.
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
