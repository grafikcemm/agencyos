-- Migration 038 — Kanonik run/step modeli (Faz 0, plan §8).
-- İKİNCİ görev sistemi YARATILMAZ: mevcut directives(=run) + agent_tasks(=step)
-- genişletilir; runs/run_steps yalnız VIEW'dir. Bağımlılıklar depends_on[] yerine
-- run_step_dependencies ilişki tablosuyla (plan §3-3). ADR-001 lease/retry sütunları
-- eklenir (worker Faz 3). Tümü additive + idempotent; tek atomik işlem.

BEGIN;

-- ── directives → kanonik RUN başlığı ────────────────────────────────────────
ALTER TABLE directives ADD COLUMN IF NOT EXISTS intent           TEXT;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS success_criteria JSONB;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS channel          TEXT;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS mode             TEXT NOT NULL DEFAULT 'active';
ALTER TABLE directives ADD COLUMN IF NOT EXISTS budget_usd_max   NUMERIC(10,6);
ALTER TABLE directives ADD COLUMN IF NOT EXISTS cost_usd         NUMERIC(12,6) DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'directives_mode_chk') THEN
    ALTER TABLE directives ADD CONSTRAINT directives_mode_chk CHECK (mode IN ('shadow','active'));
  END IF;
END $$;

UPDATE directives SET mode = 'active' WHERE mode IS NULL;

-- ── agent_tasks → kanonik STEP (+ lease/retry, ADR-001) ─────────────────────
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS parent_step_id    UUID REFERENCES agent_tasks(id);
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS skill_slug        TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS permission_scopes TEXT[];
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS risk_level        TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS data_sensitivity  TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lease_owner       TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lease_expires_at  TIMESTAMPTZ;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS attempts          INT DEFAULT 0;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS max_attempts      INT DEFAULT 3;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS next_run_at       TIMESTAMPTZ;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS last_error        TEXT;

UPDATE agent_tasks SET attempts = 0     WHERE attempts IS NULL;
UPDATE agent_tasks SET max_attempts = 3 WHERE max_attempts IS NULL;

-- Lease claim tarama indeksi (FOR UPDATE SKIP LOCKED, ADR-001).
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lease ON agent_tasks(status, next_run_at);

-- ── Bağımlılık ilişki tablosu (depends_on[] DEĞİL) ──────────────────────────
CREATE TABLE IF NOT EXISTS run_step_dependencies (
  step_id            UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  depends_on_step_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (step_id, depends_on_step_id),
  CONSTRAINT run_step_dep_no_self CHECK (step_id <> depends_on_step_id)
);
CREATE INDEX IF NOT EXISTS idx_run_step_deps_dependson ON run_step_dependencies(depends_on_step_id);

ALTER TABLE run_step_dependencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON run_step_dependencies FROM anon, authenticated;

-- ── Kanonik OKUMA view'ları (security_invoker → base RLS; anon/authenticated REVOKE) ──
CREATE OR REPLACE VIEW runs WITH (security_invoker = true) AS
  SELECT
    id, operator_input, intent, success_criteria, channel, mode,
    status, plan, debrief, error, budget_usd_max, cost_usd,
    created_at, finished_at
  FROM directives;
REVOKE ALL ON runs FROM anon, authenticated;

CREATE OR REPLACE VIEW run_steps WITH (security_invoker = true) AS
  SELECT
    id, directive_id AS run_id, parent_step_id, agent_key, skill_slug, title,
    input, status, result, permission_scopes, risk_level, data_sensitivity,
    tokens_in, tokens_out, attempts, max_attempts, lease_owner, lease_expires_at,
    next_run_at, error, last_error, created_at, started_at, finished_at
  FROM agent_tasks;
REVOKE ALL ON run_steps FROM anon, authenticated;

COMMIT;
