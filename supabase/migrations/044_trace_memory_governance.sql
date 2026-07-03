-- Migration 044 — Trace (OTel GenAI span) + memory governance + eval dataset (Faz 4,
-- plan §12/§16). run_spans: her adımın izi (redacted attributes — ham sır/prompt YOK).
-- agent_memory: core tier + governance (quarantine/provenance/confidence/retention) →
-- tek kötü tur uzun-süreli hafızayı zehirleyemez. eval_datasets: 039 eval_cases'i
-- versiyonlu suite'e bağlar. Politikasız-RLS + REVOKE. Additive + idempotent + atomik.

BEGIN;

-- ── run_spans (OTel GenAI trace) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_spans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID REFERENCES directives(id) ON DELETE CASCADE,
  step_id      UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'internal'
                 CHECK (kind IN ('llm','tool','retrieval','internal','approval')),
  status       TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error')),
  attributes   JSONB NOT NULL DEFAULT '{}',   -- REDACTED — ham prompt/secret yok (§12)
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  cost_usd     NUMERIC(12,8),
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  duration_ms  INTEGER,
  retention_until TIMESTAMPTZ,                 -- cleanup cron sonrası özetlenip düşürülür
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_run_spans_run  ON run_spans(run_id);
CREATE INDEX IF NOT EXISTS idx_run_spans_step ON run_spans(step_id);
ALTER TABLE run_spans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON run_spans FROM anon, authenticated;

-- ── agent_memory (core tier + governance §12) ────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_key     TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'quarantine'
                   CHECK (status IN ('quarantine','active','archived','rejected')),
  confidence     NUMERIC(4,3) NOT NULL DEFAULT 0.500,  -- retrieval güven-ağırlığı
  occurrences    INTEGER NOT NULL DEFAULT 1,
  source_run_id  UUID REFERENCES directives(id) ON DELETE SET NULL,   -- provenance
  source_step_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
  source_tool    TEXT,
  retention_until TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_key    ON agent_memory(memory_key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_status ON agent_memory(status);
CREATE INDEX IF NOT EXISTS idx_agent_memory_source_run  ON agent_memory(source_run_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_source_step ON agent_memory(source_step_id);
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_memory FROM anon, authenticated;

-- ── eval_datasets (039 eval_cases → versiyonlu suite) ────────────────────────
CREATE TABLE IF NOT EXISTS eval_datasets (
  slug        TEXT PRIMARY KEY,
  suite       TEXT NOT NULL,
  description TEXT,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE eval_datasets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eval_datasets FROM anon, authenticated;

COMMIT;
