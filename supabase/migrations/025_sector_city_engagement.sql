-- Migration 025: Şehir×sektör engagement view'ı (çok-şehirli öğrenme döngüsü)
-- NOT: 013 gibi Supabase SQL Editor üzerinden MANUEL uygulanır. Tamamen idempotent.
--
-- 013'ün şehir-boyutlu aynası. daily-scan cron'u buildDailyTargetPlan içinde bu view'dan
-- okur (loadCityEngagement): dönüşen ŞEHİR×SEKTÖR çiftlerinin tarama ağırlığı artar.
-- city_key = leads.city_slug (her iki tarama yolu doldurur), boşsa lower(city)'e düşer.
-- 013'teki sector_engagement_stats DOKUNULMAZ — sektör çarpanı hâlâ ondan beslenir.

CREATE OR REPLACE VIEW sector_city_engagement_stats AS
SELECT
  COALESCE(NULLIF(normalized_sector, ''), sector, 'bilinmeyen') AS sector_key,
  COALESCE(NULLIF(city_slug, ''), lower(city), 'bilinmeyen')    AS city_key,
  COUNT(*)::int AS total_leads,
  COUNT(*) FILTER (WHERE status IN ('contacted','responded','meeting','proposal','converted'))::int AS engaged_leads,
  COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_leads,
  COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_leads,
  MAX(created_at) AS last_lead_at
FROM leads
GROUP BY 1, 2;
