-- 034: leads tablosuna Lead Intelligence v2 kolonları.
-- Bağımsız Tasarım/AI fırsat skorları + ana hizmet referansı + son değerlendirme.
-- Legacy alanlar (customer_category, recommended_offer_id vb.) DOKUNULMAZ — geçiş
-- süresince read model (enrichLead / adapter) her ikisini de sunar.
-- Kolonlar uygulanana dek kod PGRST204 strip-retry ile yazar (src/lib/leads/columnPersist.ts).
-- Idempotent — 033'ten sonra. SQL Editor'da elle uygulanır (app DB).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS design_score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS primary_service_slug TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_assessment_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_assessed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_design_score ON leads(design_score);
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(ai_score);
CREATE INDEX IF NOT EXISTS idx_leads_primary_service ON leads(primary_service_slug);

NOTIFY pgrst, 'reload schema';
