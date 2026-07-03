-- Migration 039 — Gateway gerçek-maliyet gözlemi + settings tavan + min eval (Faz 0).
-- ai_cost_logs: gerçek OpenRouter maliyeti + generation_id gözlem sütunları
--   (cost_usd DEĞİŞMEZ → council parity korunur; gerçek yalnız actual_cost_usd'de).
-- settings: aylık tavan artık yapılandırılabilir (default '20' = mevcut davranış).
-- eval_*: minimum golden/eval altyapısı (harness kodda koşar; tablolar gelecek
--   online eval içindir). Tümü additive + idempotent; tek atomik işlem.

BEGIN;

-- ── ai_cost_logs gözlem sütunları ───────────────────────────────────────────
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS generation_id   TEXT;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS actual_cost_usd NUMERIC(12,8);
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS cost_source     TEXT DEFAULT 'estimated';
CREATE INDEX IF NOT EXISTS ai_cost_logs_generation_idx
  ON ai_cost_logs(generation_id) WHERE generation_id IS NOT NULL;

-- ── settings: yapılandırılabilir bütçe (value TEXT — migration 001) ──────────
INSERT INTO settings (key, value) VALUES ('ai_monthly_cap_usd', '20')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('ai_daily_caps', '{"lead_intel_":0.4}')
  ON CONFLICT (key) DO NOTHING;

-- ── Minimum golden/eval tabloları ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_cases (
  slug        TEXT PRIMARY KEY,
  suite       TEXT NOT NULL,
  description TEXT,
  input       JSONB NOT NULL,
  expected    JSONB NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite      TEXT NOT NULL,
  total      INT DEFAULT 0,
  passed     INT DEFAULT 0,
  failed     INT DEFAULT 0,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id UUID REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_slug   TEXT,
  passed      BOOLEAN,
  expected    JSONB,
  actual      JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eval_results_run_idx ON eval_results(eval_run_id);

ALTER TABLE eval_cases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eval_cases   FROM anon, authenticated;
REVOKE ALL ON eval_runs    FROM anon, authenticated;
REVOKE ALL ON eval_results FROM anon, authenticated;

COMMIT;
