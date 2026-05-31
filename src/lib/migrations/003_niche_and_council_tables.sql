-- Leads tablosuna niş alanları ekleme
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vertical_id text DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sector_score int DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS firm_score int DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_reasons jsonb DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS wave int DEFAULT 0;

-- Playbooks tablosuna zengin hikaye, script, metrik ve fiyatlandırma alanları ekleme
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS problem_story text DEFAULT '';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS value_story text DEFAULT '';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS sales_script text DEFAULT '';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS sample_metrics jsonb DEFAULT '{}';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS app_notes text DEFAULT '';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS anti_patterns text DEFAULT '';
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS setup_fee_usd int DEFAULT 0;
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS monthly_fee_usd int DEFAULT 0;
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS offer_type text DEFAULT NULL;
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS revenue_model text DEFAULT NULL;
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS verticals jsonb DEFAULT '[]';

-- Konsey tartışmaları geçmişi tablosu
CREATE TABLE IF NOT EXISTS council_debates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  context text DEFAULT '',
  strategy_opinion text,
  risk_opinion text,
  operations_opinion text,
  growth_opinion text,
  president_synthesis text,
  status text DEFAULT 'open', -- 'approved', 'vetoed'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);
