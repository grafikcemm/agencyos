-- Migration 013: Sektör rotasyon istatistik view'ı + soğuk e-posta imza ayarları
-- NOT: 012 gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.

-- 1) Öğrenen sektör rotasyonu için engagement istatistikleri.
--    daily-scan cron'u bu view'dan okur: dönüşen sektörlerin tarama ağırlığı artar.
CREATE OR REPLACE VIEW sector_engagement_stats AS
SELECT
  COALESCE(NULLIF(normalized_sector, ''), sector, 'bilinmeyen') AS sector_key,
  COUNT(*)::int AS total_leads,
  COUNT(*) FILTER (WHERE status IN ('contacted','responded','meeting','proposal','converted'))::int AS engaged_leads,
  COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_leads,
  COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_leads,
  MAX(created_at) AS last_lead_at
FROM leads
GROUP BY 1;

-- 2) settings.key unique guard — daily-scan upsert({ onConflict: 'key' }) bunu varsayıyor.
DO $$ BEGIN
  ALTER TABLE settings ADD CONSTRAINT settings_key_unique UNIQUE (key);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- 3) Soğuk e-posta imza linkleri — LLM asla link yazmaz, route deterministik ekler.
INSERT INTO settings (key, value) VALUES
  ('signature_website',         'https://grafikcem.com'),
  ('signature_instagram',       'https://instagram.com/grafikcem'),
  ('signature_behance',         'https://behance.net/grafikcem'),
  ('signature_linkedin',        'https://linkedin.com/in/grafikcem'),
  ('signature_google_business', 'https://maps.app.goo.gl/cmYbYzmojz6v4eiu7?g_st=ic'),
  ('signature_email',           'info@grafikcem.com')
ON CONFLICT (key) DO NOTHING;
