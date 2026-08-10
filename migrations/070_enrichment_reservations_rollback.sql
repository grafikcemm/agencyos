-- 070_enrichment_reservations_rollback — App DB
--
-- ⚠️ VERİ KAYBI + PARA KAYBI RİSKİ: rezervasyon tablosu silinince "bu sorgu
-- için zaten ödendi" bilgisi kaybolur. Rollback sonrası aynı şirket/kişi için
-- yapılan sorgular YENİDEN ÜCRETLENDİRİLİR.
--
-- Silmeden önce maliyet geçmişini dışa aktar:
--   select provider, count(*), sum(cost_usd), sum(credits_used), sum(cache_hits)
--     from enrichment_query_reservations group by provider;
--
-- `contacts.email_confidence` KORUNUR — silinirse tahmin edilmiş e-postalar
-- doğrulanmışlardan ayırt edilemez hale gelir ve gönderim kapısı körleşir.
-- Bilinçli olarak silmek istenirse en alttaki satır açılmalı.

BEGIN;

DROP INDEX IF EXISTS public.enrichment_reservations_subject_idx;
DROP INDEX IF EXISTS public.enrichment_reservations_stale_idx;
DROP INDEX IF EXISTS public.enrichment_reservations_cost_idx;

DROP TABLE IF EXISTS public.enrichment_query_reservations;

-- ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_email_confidence_chk;
-- ALTER TABLE public.contacts DROP COLUMN IF EXISTS email_confidence;

COMMIT;
