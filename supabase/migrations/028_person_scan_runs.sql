-- Migration 028: person_scan_runs — kişi taramaları için tempo/verim geçmişi
-- NOT: Supabase SQL Editor üzerinden MANUEL uygulanır. Idempotent.
-- scan_runs (012) muadili; kişi akışının trend analizini ayrı tutar.

CREATE TABLE IF NOT EXISTS person_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id TEXT,
  purpose TEXT,
  fetched_count INT DEFAULT 0,                       -- Apollo'dan dönen ham kişi
  inserted_count INT DEFAULT 0,                      -- yeni eklenen
  duplicate_count INT DEFAULT 0,                     -- apollo_person_id zaten var
  rejected_count INT DEFAULT 0,                      -- tier/kalite kapısı eledi
  source TEXT DEFAULT 'cron' CHECK (source IN ('cron', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_scan_runs_created ON person_scan_runs(created_at DESC);
