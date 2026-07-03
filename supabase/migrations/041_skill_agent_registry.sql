-- Migration 041 — Skill/Agent registry (Faz 2, plan §6-§9). DB+kod hibrit: yapı KODDA
-- (src/lib/skills/catalog.ts), bu tablolar enable/override + versiyon + grant içindir.
-- agent_defs = mevcut `agents` tablosu GENİŞLETİLİR (ikinci ajan sistemi YOK).
-- Politikasız-RLS + REVOKE (service-role only). Additive + idempotent + atomik.

BEGIN;

-- ── skills (registry override/enable) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  slug              TEXT PRIMARY KEY,
  team              TEXT NOT NULL,
  name              TEXT NOT NULL,
  summary           TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('deterministic','llm','composite')),
  permission_scopes TEXT[] NOT NULL DEFAULT '{}',
  risk_level        TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  data_sensitivity  TEXT NOT NULL CHECK (data_sensitivity IN ('public','internal','confidential','secret')),
  input_schema      JSONB NOT NULL,
  output_schema     JSONB NOT NULL,
  default_model_tier TEXT NOT NULL CHECK (default_model_tier IN ('light','medium','heavy')),
  budget_usd_max    NUMERIC(10,6) NOT NULL DEFAULT 0,
  timeout_ms        INTEGER NOT NULL DEFAULT 15000,
  eval_slug         TEXT NOT NULL,
  handler_key       TEXT,                       -- compile-time allowlist anahtarı (§9.1)
  active            BOOLEAN NOT NULL DEFAULT false, -- eval geçmeden true olmaz
  latest_version    INTEGER NOT NULL DEFAULT 1,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON skills FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS skill_versions (
  skill_slug  TEXT NOT NULL REFERENCES skills(slug) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  manifest_md TEXT,
  changelog   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (skill_slug, version)
);
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON skill_versions FROM anon, authenticated;

-- ── tool_registry ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_registry (
  key               TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  permission_scopes TEXT[] NOT NULL DEFAULT '{}',
  risk_level        TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  data_sensitivity  TEXT NOT NULL DEFAULT 'internal' CHECK (data_sensitivity IN ('public','internal','confidential','secret')),
  input_schema      JSONB,
  handler_key       TEXT,
  mcp_server        TEXT,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tool_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tool_registry FROM anon, authenticated;

-- ── agent_defs = agents GENİŞLETME (§6) ─────────────────────────────────────
ALTER TABLE agents ADD COLUMN IF NOT EXISTS archetype        TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team             TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS model_tier       TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS input_contract   JSONB;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS output_contract  JSONB;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS permission_scopes TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS risk_level       TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS data_sensitivity TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_usd_max   NUMERIC(10,6);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS timeout_ms       INTEGER;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS eval_slug        TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='agents_archetype_chk') THEN
    ALTER TABLE agents ADD CONSTRAINT agents_archetype_chk
      CHECK (archetype IS NULL OR archetype IN ('orchestrator','router','executor','specialist','critic','judge','researcher'));
  END IF;
END $$;

-- ── agent_skill_grants (tools[] yerini alır, runner'da zorlanır §6) ──────────
CREATE TABLE IF NOT EXISTS agent_skill_grants (
  agent_key  TEXT NOT NULL REFERENCES agents(key) ON DELETE CASCADE,
  skill_slug TEXT NOT NULL REFERENCES skills(slug) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (agent_key, skill_slug)
);
CREATE INDEX IF NOT EXISTS idx_agent_skill_grants_skill ON agent_skill_grants(skill_slug);
ALTER TABLE agent_skill_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_skill_grants FROM anon, authenticated;

COMMIT;
