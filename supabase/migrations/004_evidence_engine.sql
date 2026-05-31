-- ============================================
-- 004: Evidence Engine + Geo Normalization
-- Run in Supabase SQL Editor
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- ============================================

-- Geo normalization
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city_slug TEXT;
-- district already exists in 001 schema; ensure it's there
ALTER TABLE leads ADD COLUMN IF NOT EXISTS district TEXT;

-- Evidence scoring sub-scores
ALTER TABLE leads ADD COLUMN IF NOT EXISTS evidence_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS urgency_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS money_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contactability_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,2) DEFAULT 0;

-- Sales intelligence
ALTER TABLE leads ADD COLUMN IF NOT EXISTS why_now TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_signals JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proof_points JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disqualification_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_offer_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_offer_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sales_angle TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_message TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_best_action TEXT;

-- Digital presence signals (filled by evidenceEngine)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_real_website BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_whatsapp BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_form BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_online_booking BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_ads_signal BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_as_site BOOLEAN DEFAULT FALSE;

-- Enrichment lifecycle
ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;

-- Pipeline timestamps (read by nextActionEngine)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_city_slug ON leads(city_slug);
CREATE INDEX IF NOT EXISTS idx_leads_evidence_score ON leads(evidence_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON leads(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_leads_disqualified ON leads(disqualification_reason) WHERE disqualification_reason IS NOT NULL;
