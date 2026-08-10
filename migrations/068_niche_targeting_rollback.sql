-- 068_niche_targeting_rollback — App DB
--
-- ⚠️ VERİ KAYBI: araştırma seed'iyle gelen niş, sinyal, kanıt, uyum ve provenance
-- alanlarının TAMAMI silinir. Bu, "hangi lead nereden geldi" sorusunun cevabını
-- da götürür — seed script'in `--rollback` modu bu dosyadan ÖNCE çalıştırılmalı,
-- yoksa seed'le eklenen SATIRLAR tabloda kalır ama provenance'ları kaybolur ve
-- bir daha ayırt edilemezler.
--
-- DOĞRU SIRA:
--   1. node scripts/seed-research-leads.ts --rollback reports/seed-<tarih>.json
--      (yalnız o koşuda EKLENEN satırları siler)
--   2. bu dosya                                  (sütunları düşürür)
--
-- Ters sırada çalıştırmak geri dönüşü olmayan karışıklık üretir.
--
-- NE DOKUNULMAZ: potential_score, base_score, score_reasons, confidence,
-- recommended_offer_id/name, contacted_at ve diğer funnel damgaları — bunlar
-- 068'in eklemediği, operasyonel motorun alanlarıdır.

BEGIN;

DROP INDEX IF EXISTS public.idx_leads_niche_score;
DROP INDEX IF EXISTS public.idx_leads_verification_due;
DROP INDEX IF EXISTS public.idx_leads_source_batch;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_domain_normalized_uniq;
DROP INDEX IF EXISTS public.leads_domain_normalized_active_uniq;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_research_confidence_chk;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_contact_status_chk;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_suppression_status_chk;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_research_score_chk;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_niche_id_chk;

-- GENERATED sütun önce düşer: normalize_domain fonksiyonuna bağımlı.
ALTER TABLE public.leads DROP COLUMN IF EXISTS domain_normalized;

ALTER TABLE public.leads DROP COLUMN IF EXISTS provenance;
ALTER TABLE public.leads DROP COLUMN IF EXISTS source_batch;
ALTER TABLE public.leads DROP COLUMN IF EXISTS seeded_at;

ALTER TABLE public.leads DROP COLUMN IF EXISTS paid_entry_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS meeting_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS reply_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS outreach_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS contact_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS next_check_date;
ALTER TABLE public.leads DROP COLUMN IF EXISTS next_action;
ALTER TABLE public.leads DROP COLUMN IF EXISTS owner;

ALTER TABLE public.leads DROP COLUMN IF EXISTS consent_note;
ALTER TABLE public.leads DROP COLUMN IF EXISTS suppression_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS lawful_basis;

ALTER TABLE public.leads DROP COLUMN IF EXISTS offer_match_id;
ALTER TABLE public.leads DROP COLUMN IF EXISTS offer_match_label;
ALTER TABLE public.leads DROP COLUMN IF EXISTS case_match;

ALTER TABLE public.leads DROP COLUMN IF EXISTS research_score_breakdown;
ALTER TABLE public.leads DROP COLUMN IF EXISTS research_score;

ALTER TABLE public.leads DROP COLUMN IF EXISTS research_confidence;
ALTER TABLE public.leads DROP COLUMN IF EXISTS verified_at;
ALTER TABLE public.leads DROP COLUMN IF EXISTS evidence_urls;
ALTER TABLE public.leads DROP COLUMN IF EXISTS trigger_date_raw;
ALTER TABLE public.leads DROP COLUMN IF EXISTS trigger_date;
ALTER TABLE public.leads DROP COLUMN IF EXISTS trigger_label;

ALTER TABLE public.leads DROP COLUMN IF EXISTS active_social_channels;
ALTER TABLE public.leads DROP COLUMN IF EXISTS advertising_activity;
ALTER TABLE public.leads DROP COLUMN IF EXISTS ecommerce_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS employee_band;
ALTER TABLE public.leads DROP COLUMN IF EXISTS niche_id;

ALTER TABLE public.leads DROP COLUMN IF EXISTS country;
-- `domain` KORUNUR: website'ten türetilmiş temiz veri, başka bir şeyi kırmaz.
-- Silmek istenirse bilinçli olarak aşağıdaki satır açılmalı.
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS domain;

-- Fonksiyon EN SON: generated sütun düştükten sonra bağımlılık kalmaz.
DROP FUNCTION IF EXISTS public.normalize_domain(text);

COMMIT;
