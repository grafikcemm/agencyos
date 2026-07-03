-- Migration 043 — Approval bütünlüğü + HITL (Faz 3, plan §13/§19).
-- Write/external/spend adımları onaysız YÜRÜMEZ. Bütünlük: action_digest (ONAYLANAN
-- eylem) + approved_digest (karar anında sabitlenir) + idempotency_key (çift-yürütme
-- engeli) + expires_at (bayat onay reddi). Operatöre yalnız redacted_preview gösterilir.
-- agent_tasks.status alanına 'blocked_on_approval' eklenir (mig 009 CHECK'i genişletilir).
-- Politikasız-RLS + REVOKE (service-role only). Additive + idempotent + atomik.

BEGIN;

-- ── agent_tasks.status → 'blocked_on_approval' izin ver (mig 009 CHECK genişletme) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_tasks_status_check') THEN
    ALTER TABLE agent_tasks DROP CONSTRAINT agent_tasks_status_check;
  END IF;
  ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_status_check
    CHECK (status IN ('queued','working','done','error','blocked_on_approval'));
END $$;

-- ── approval_requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID REFERENCES directives(id) ON DELETE CASCADE,
  step_id           UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
  permission_scopes TEXT[] NOT NULL DEFAULT '{}',
  risk_level        TEXT NOT NULL DEFAULT 'medium'
                      CHECK (risk_level IN ('low','medium','high','critical')),
  data_sensitivity  TEXT NOT NULL DEFAULT 'internal'
                      CHECK (data_sensitivity IN ('public','internal','confidential','secret')),
  action            TEXT NOT NULL,                 -- handler_key / tool adı
  action_digest     TEXT NOT NULL,                 -- sha256(canonical(action+args)) : ONAYLANAN eylem
  redacted_preview  TEXT NOT NULL,                 -- sır-strip edilmiş; operatöre gösterilir
  idempotency_key   TEXT NOT NULL UNIQUE,          -- çift-yürütme engeli
  expires_at        TIMESTAMPTZ NOT NULL,          -- bayat onay otomatik reddedilir
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','expired','executed')),
  approved_digest   TEXT,                          -- karar anında sabitlenen digest (yürütme eşleşmesi)
  decided_at        TIMESTAMPTZ,
  decided_by        TEXT,
  executed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_run    ON approval_requests(run_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_step   ON approval_requests(step_id);
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON approval_requests FROM anon, authenticated;

COMMIT;
