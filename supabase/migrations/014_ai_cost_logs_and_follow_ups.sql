-- Migration 014 — Eksik tablolar / eksik kolonlar (kodda referanslanıyor).
-- ai_cost_logs: openrouter.ts logAiCost() insert eder, dashboard + agents okur.
-- follow_ups:   dashboard "bekleyen takipler" okur (is_done, due_date). follow_up_sequences
--               (migration 010) AYRI bir tablodur (outreach dizisi) — bu onunla aynı değil.
--
-- ROBUST + idempotent: tablolar prod'da farklı/eski bir şemayla zaten var olabilir
-- (ör. follow_ups'ta due_date yoktu). Bu yüzden CREATE IF NOT EXISTS'in ardından
-- ADD COLUMN IF NOT EXISTS ile kodun beklediği kolonlar garanti altına alınır.

-- ── ai_cost_logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_cost_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS operation     text;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS model_used    text;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS model_tier    text;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS input_tokens  int DEFAULT 0;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS output_tokens int DEFAULT 0;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS cost_usd      numeric DEFAULT 0;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS cost_tl       numeric DEFAULT 0;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS agent_key     text;
ALTER TABLE ai_cost_logs ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS ai_cost_logs_created_at_idx ON ai_cost_logs (created_at);

-- ── follow_ups ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS lead_id    uuid;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS title      text;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS note       text;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS due_date   timestamptz;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS is_done    boolean DEFAULT false;
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS follow_ups_due_idx ON follow_ups (is_done, due_date);
