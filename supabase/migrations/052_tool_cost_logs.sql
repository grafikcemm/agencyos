-- Migration 052 — Tool maliyet logu + AI cost preset gözlem kolonları (Sprint 0, WS G/H).
-- Kaynak: 19 §1.2, 16 §4.7, 22-cost-model. Google Places maliyeti İLK KEZ ölçülür
-- (scan.ts textsearch/details çağrıları loglanır). ai_cost_logs'a Faz 1 router
-- alanları eklenir (kod strip-retry ile migration'sız da çalışır; bu migration
-- gözlemi kalıcılaştırır). settings.ai_route_presets anahtarı ayrıca INSERT
-- GEREKTİRMEZ — satır yokken kod default'u kullanır.
-- Desen: additive + idempotent · BEGIN/COMMIT · RLS + REVOKE · NOTIFY pgrst.
-- App DB'ye SQL Editor'dan ELLE uygulanır. LIFE DB'ye DOKUNMAZ.

BEGIN;

-- ── tool_cost_logs — LLM-dışı araç maliyetleri (Places, PageSpeed, ...) ──────
CREATE TABLE IF NOT EXISTS tool_cost_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool             TEXT NOT NULL,                 -- ör. 'google_places'
  operation        TEXT NOT NULL,                 -- ör. 'textsearch', 'details'
  units            INTEGER NOT NULL DEFAULT 1,    -- çağrı/sayfa sayısı
  cost_usd         NUMERIC(12,6) NOT NULL DEFAULT 0,  -- tahmini birim maliyet × units
  run_id           UUID,                          -- opsiyonel trace bağı
  related_lead_id  UUID,                          -- opsiyonel lead bağı
  meta             JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_cost_logs_tool_time ON tool_cost_logs(tool, created_at DESC);

-- ── ai_cost_logs additive router gözlem kolonları (16 §4.7) ──────────────────
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS preset_key    TEXT;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS retry_count   INTEGER NOT NULL DEFAULT 0;

-- ── RLS + REVOKE ─────────────────────────────────────────────────────────────
ALTER TABLE tool_cost_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tool_cost_logs FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Doğrulama sorgusu:
--   SELECT table_name FROM information_schema.tables WHERE table_name='tool_cost_logs';
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='ai_cost_logs'
--     AND column_name IN ('preset_key','fallback_used','retry_count');
