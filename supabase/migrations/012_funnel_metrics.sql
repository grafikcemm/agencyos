-- Migration 012: Kapalı döngü ROI metrikleri.
-- 1) scan_runs — her taramanın gerçek insert/update/skip sayıları (trend analizi için).
-- 2) leads outcome timestamp'leri — contacted/replied/meeting/proposal/converted/lost
--    geçiş zamanları; sektör bazlı dönüşüm kalibrasyonunun veri temeli.

CREATE TABLE IF NOT EXISTS scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sector TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'jarvis', 'cron')),
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_created_at ON scan_runs (created_at DESC);

-- Outcome timestamps — status geçişlerinde set edilir (update_lead_stage / UI).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proposal_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;
