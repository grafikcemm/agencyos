-- Migration 030 — engagement view'larına security_invoker + REVOKE (RLS bypass kapatma).
-- NOT: 013/025 gibi Supabase SQL Editor üzerinden MANUEL uygulanır (App DB). Idempotent.
--
-- SORUN: 013 (sector_engagement_stats) ve 025 (sector_city_engagement_stats) view'ları
-- varsayılan SECURITY DEFINER davranışıyla oluşturulmuştu → view, kendisini oluşturan
-- (yüksek yetkili) rol ile çalışır ve `leads` üstündeki RLS'i (017 default-deny) BAYPAS
-- eder. anon/authenticated bu view'lara erişebilirse agregat lead sayıları, şehir×sektör
-- performansı ve dönüşüm sinyalleri sızar.
--
-- ÇÖZÜM: View'ları security_invoker=true ile yeniden oluştur (sorgulayan rolün izinleriyle
-- çalışır → leads RLS uygulanır) + anon/authenticated'tan tüm yetkileri REVOKE et.
-- Uygulama/cron service-role (supabaseAdmin) ile okur; service_role RLS'i baypas ettiği
-- için view'lar çalışmaya devam eder.

CREATE OR REPLACE VIEW sector_engagement_stats
WITH (security_invoker = true) AS
SELECT
  COALESCE(NULLIF(normalized_sector, ''), sector, 'bilinmeyen') AS sector_key,
  COUNT(*)::int AS total_leads,
  COUNT(*) FILTER (WHERE status IN ('contacted','responded','meeting','proposal','converted'))::int AS engaged_leads,
  COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_leads,
  COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_leads,
  MAX(created_at) AS last_lead_at
FROM leads
GROUP BY 1;

CREATE OR REPLACE VIEW sector_city_engagement_stats
WITH (security_invoker = true) AS
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

REVOKE ALL ON sector_engagement_stats FROM anon, authenticated;
REVOKE ALL ON sector_city_engagement_stats FROM anon, authenticated;
