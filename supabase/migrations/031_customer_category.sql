-- 031: Müşteri (ihtiyaç) kategorisi + web sitesi kalite bandı.
-- Tasarım-odaklı sınıflandırma: "bu işletme NEDEN hedefimiz, hangi tasarım
-- hizmetini satmalıyız". lead_tier (A/B/C/D) kalite boyutuna DİKTİR.
-- Idempotent — 030'dan sonra. SQL Editor'da elle uygulanır (app DB).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_category TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_quality_band TEXT;   -- none | poor | ok
ALTER TABLE leads ADD COLUMN IF NOT EXISTS category_reasons JSONB DEFAULT '[]'::JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_social_link BOOLEAN DEFAULT FALSE;

-- Pipeline/dashboard filtreleri için indeksler.
CREATE INDEX IF NOT EXISTS idx_leads_customer_category ON leads(customer_category);
CREATE INDEX IF NOT EXISTS idx_leads_website_quality ON leads(website_quality_band);

-- PostgREST şema önbelleğini yenile (yeni kolonlar API'de hemen görünsün).
NOTIFY pgrst, 'reload schema';
