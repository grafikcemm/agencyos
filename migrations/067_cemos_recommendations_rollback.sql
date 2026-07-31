-- 067_cemos_recommendations_rollback — App DB
--
-- ⚠️ VERI KAYBI: GrafikcemOS'un ürettiği tüm öneriler ve growth köprüsünün
-- denetim geçmişi SILINIR. Denetim geçmişinin silinmesi, geçmiş yazmaların
-- idempotency kayıtlarını da götürür: rollback sonrası aynı anahtarla gelen bir
-- istek "yeni" sayılır ve İKİNCİ bir öneri satırı yaratabilir.
--
-- Rollback yalnız şu iki koşul birlikte doğruyken uygulanmalı:
--   1. CEMOS_AGENCYOS_READ_TOKEN ve CEMOS_AGENCYOS_WRITE_TOKEN tanımsız
--      (köprü hiçbir çağrıyı kabul etmiyor),
--   2. `cemos_recommendations` içinde `status='proposed'` satır YOK — aksi
--      hâlde karara bağlanmamış öneriler kaybolur.
--
-- Bağımlılık yok: iki tablo da başka tabloya FK ile bağlanmıyor, bu yüzden sıra
-- serbest. Yine de öneri tablosu önce düşürülüyor ki yarım kalan bir rollback'te
-- denetim kaydı elde kalsın.

BEGIN;

DROP INDEX IF EXISTS public.idx_cemos_recommendations_open;
DROP INDEX IF EXISTS public.idx_cemos_growth_audit_route;

DROP TABLE IF EXISTS public.cemos_recommendations;
DROP TABLE IF EXISTS public.cemos_growth_audit;

COMMIT;

NOTIFY pgrst, 'reload schema';
