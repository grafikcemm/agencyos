-- 066_growth_experiments_rollback — App DB
--
-- ⚠️ VERI KAYBI: deney tanımları, parti maliyet kayıtları ve sağlayıcı olay
-- geçmişi SILINIR. Rollback yalnız şu iki koşul birlikte doğruyken uygulanmalı:
--   1. APIFY_ENABLED ve INSTANTLY_ENABLED kapalı (sağlayıcı kodu çalışmıyor),
--   2. `outreach_provider_events` içinde işlenmemiş satır YOK — aksi hâlde
--      "gönderildi mi bilinmiyor" durumundaki mesajlar bir daha uzlaştırılamaz.
--
-- Sütun düşürme sırası kasıtlı: önce outreach_messages'ın FK'leri, sonra
-- tablolar. Ters sırada FK bağımlılığı hatası alınır.

BEGIN;

DROP INDEX IF EXISTS public.idx_outreach_messages_experiment;

ALTER TABLE public.outreach_messages DROP COLUMN IF EXISTS provider_state;
ALTER TABLE public.outreach_messages DROP COLUMN IF EXISTS outreach_provider;
ALTER TABLE public.outreach_messages DROP COLUMN IF EXISTS source_batch_id;
ALTER TABLE public.outreach_messages DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.outreach_messages DROP COLUMN IF EXISTS experiment_id;

DROP INDEX IF EXISTS public.idx_provider_events_unprocessed;
DROP INDEX IF EXISTS public.idx_provider_mappings_state;
DROP INDEX IF EXISTS public.idx_prospect_batches_month;

DROP TABLE IF EXISTS public.outreach_provider_events;
DROP TABLE IF EXISTS public.outreach_provider_mappings;
DROP TABLE IF EXISTS public.prospect_import_batches;
DROP TABLE IF EXISTS public.growth_experiment_variants;
DROP TABLE IF EXISTS public.growth_experiments;

COMMIT;

NOTIFY pgrst, 'reload schema';
