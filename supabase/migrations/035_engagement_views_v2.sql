-- 035: Sektör/şehir öğrenme view'larının v2'si — 'contacted' başarı SAYILMAZ.
-- Gerçek satış sinyalleri: responded(1) < meeting(2) < proposal(3) < converted(4).
-- Eski view'lar (013/025/030) SİLİNMEZ: diğer tüketiciler etkilenmez; kod önce _v2'yi
-- dener, yoksa eskiye düşer (soft-skip deyimi). security_invoker + REVOKE 030 deseni.
--
-- SIRA-TOLERANSLI: feedback_accept_rate / design_yield / ai_yield kolonları 033'ün
-- tablolarına (lead_match_feedback, lead_assessments) bağlıdır. Tablolar henüz yoksa
-- view TEMEL kolonlarla kurulur (loader'lar yalnız temel kolonları okur); 033
-- uygulandıktan sonra bu dosya TEKRAR çalıştırılınca tam sürüme yükselir
-- (opsiyonel kolonlar sonda → CREATE OR REPLACE uyumlu). Idempotent.

DO $$
DECLARE
  has_intel boolean := to_regclass('public.lead_match_feedback') IS NOT NULL
                   AND to_regclass('public.lead_assessments') IS NOT NULL;
BEGIN
  IF has_intel THEN
    -- NOT: korelasyonlu subquery GROUP BY'lı dış sorgudan ham kolon okuyamaz (42803)
    -- → sektör bazlı agregalar CTE'lerde hesaplanıp sector_key üstünden JOIN'lenir.
    EXECUTE $view$
      CREATE OR REPLACE VIEW sector_engagement_stats_v2
      WITH (security_invoker = true) AS
      WITH base AS (
        SELECT
          COALESCE(NULLIF(normalized_sector, ''), sector, 'bilinmeyen') AS sector_key,
          COUNT(*)::int AS total_leads,
          COUNT(*) FILTER (WHERE status IN ('responded','meeting','proposal','converted'))::int AS engaged_leads,
          (
            COUNT(*) FILTER (WHERE status = 'responded') * 1 +
            COUNT(*) FILTER (WHERE status = 'meeting')   * 2 +
            COUNT(*) FILTER (WHERE status = 'proposal')  * 3 +
            COUNT(*) FILTER (WHERE status = 'converted') * 4
          )::int AS weighted_engagement,
          COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_leads,
          COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_leads,
          MAX(created_at) AS last_lead_at
        FROM leads
        GROUP BY 1
      ),
      -- Operatör geri bildirimi: uygun / (uygun + uygun_degil); veri yoksa NULL (LEFT JOIN).
      fb AS (
        SELECT
          COALESCE(NULLIF(fl.normalized_sector, ''), fl.sector, 'bilinmeyen') AS sector_key,
          ROUND(COUNT(*) FILTER (WHERE f.verdict = 'uygun')::numeric / COUNT(*), 3) AS feedback_accept_rate
        FROM lead_match_feedback f
        JOIN leads fl ON fl.id = f.lead_id
        GROUP BY 1
      ),
      -- Tasarım/AI verimi: bu sektörde seçilen fırsatların domain dağılımı.
      yields AS (
        SELECT
          COALESCE(NULLIF(al.normalized_sector, ''), al.sector, 'bilinmeyen') AS sector_key,
          COUNT(*) FILTER (WHERE COALESCE(a.design_score, 0) >= COALESCE(a.ai_score, 0))::int AS design_yield,
          COUNT(*) FILTER (WHERE COALESCE(a.ai_score, 0) > COALESCE(a.design_score, 0))::int AS ai_yield
        FROM lead_assessments a
        JOIN leads al ON al.id = a.lead_id
        WHERE a.selected
        GROUP BY 1
      )
      SELECT
        base.sector_key,
        base.total_leads,
        base.engaged_leads,
        base.weighted_engagement,
        base.converted_leads,
        base.lost_leads,
        base.last_lead_at,
        fb.feedback_accept_rate,
        COALESCE(yields.design_yield, 0) AS design_yield,
        COALESCE(yields.ai_yield, 0) AS ai_yield
      FROM base
      LEFT JOIN fb USING (sector_key)
      LEFT JOIN yields USING (sector_key)
    $view$;
  ELSE
    -- 033 henüz yok → temel sürüm (loader'ların okuduğu kolonlar). 033 sonrası
    -- bu dosyayı tekrar çalıştır: kolonlar SONA eklendiği için REPLACE sorunsuz.
    EXECUTE $view$
      CREATE OR REPLACE VIEW sector_engagement_stats_v2
      WITH (security_invoker = true) AS
      SELECT
        COALESCE(NULLIF(l.normalized_sector, ''), l.sector, 'bilinmeyen') AS sector_key,
        COUNT(*)::int AS total_leads,
        COUNT(*) FILTER (WHERE l.status IN ('responded','meeting','proposal','converted'))::int AS engaged_leads,
        (
          COUNT(*) FILTER (WHERE l.status = 'responded') * 1 +
          COUNT(*) FILTER (WHERE l.status = 'meeting')   * 2 +
          COUNT(*) FILTER (WHERE l.status = 'proposal')  * 3 +
          COUNT(*) FILTER (WHERE l.status = 'converted') * 4
        )::int AS weighted_engagement,
        COUNT(*) FILTER (WHERE l.status = 'converted')::int AS converted_leads,
        COUNT(*) FILTER (WHERE l.status = 'lost')::int AS lost_leads,
        MAX(l.created_at) AS last_lead_at
      FROM leads l
      GROUP BY 1
    $view$;
  END IF;
END $$;

CREATE OR REPLACE VIEW sector_city_engagement_stats_v2
WITH (security_invoker = true) AS
SELECT
  COALESCE(NULLIF(normalized_sector, ''), sector, 'bilinmeyen') AS sector_key,
  COALESCE(NULLIF(city_slug, ''), lower(city), 'bilinmeyen')    AS city_key,
  COUNT(*)::int AS total_leads,
  COUNT(*) FILTER (WHERE status IN ('responded','meeting','proposal','converted'))::int AS engaged_leads,
  (
    COUNT(*) FILTER (WHERE status = 'responded') * 1 +
    COUNT(*) FILTER (WHERE status = 'meeting')   * 2 +
    COUNT(*) FILTER (WHERE status = 'proposal')  * 3 +
    COUNT(*) FILTER (WHERE status = 'converted') * 4
  )::int AS weighted_engagement,
  COUNT(*) FILTER (WHERE status = 'converted')::int AS converted_leads,
  COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_leads,
  MAX(created_at) AS last_lead_at
FROM leads
GROUP BY 1, 2;

REVOKE ALL ON sector_engagement_stats_v2 FROM anon, authenticated;
REVOKE ALL ON sector_city_engagement_stats_v2 FROM anon, authenticated;
