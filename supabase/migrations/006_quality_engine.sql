-- ============================================
-- 006: Quality Engine columns
-- Run in Supabase SQL Editor AFTER 005
-- Idempotent — ADD COLUMN IF NOT EXISTS
-- ============================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_probability INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS money_potential_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_intensity_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS agency_fit_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_tier TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quality_label TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification_reasons JSONB DEFAULT '[]'::JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_angle TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS why_this_will_convert TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_offer_value_tl INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_monthly_value_tl INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS best_channel TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_30_seconds_pitch TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS objection_risks JSONB DEFAULT '[]'::JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_priority TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalized_sector TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS district_slug TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_quality_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_quality_score ON leads(quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_conversion_prob ON leads(conversion_probability DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_lead_tier ON leads(lead_tier);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_priority);

NOTIFY pgrst, 'reload schema';
