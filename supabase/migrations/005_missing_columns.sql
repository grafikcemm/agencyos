-- ============================================
-- 005: Missing columns fix + schema cache reload
-- Run in Supabase SQL Editor AFTER 004
-- Idempotent — safe to run multiple times
-- ============================================

-- score_reasons was only in src/lib/migrations/003 (not in supabase/migrations).
-- Missing column causes: "Could not find the 'score_reasons' column of 'leads'"
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_reasons JSONB DEFAULT '[]'::JSONB;

-- Other columns from src/lib/migrations/003 that may not have been applied
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vertical_id TEXT DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sector_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS firm_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS wave INTEGER DEFAULT 0;

-- Reload PostgREST schema cache so new columns are immediately visible
NOTIFY pgrst, 'reload schema';
