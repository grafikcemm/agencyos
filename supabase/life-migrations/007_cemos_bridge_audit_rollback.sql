-- Rollback 007 (LIFE DB) — GrafikcemOS köprüsü denetim kaydı.
--
-- ⚠️ DENETIM KAYDI SILINIR. Köprü yazma yolunun tekrar-oynatma koruması bu tabloya
-- dayanır: tablo düşerse `findReplay` her zaman NULL döner ve aynı Idempotency-Key
-- ile gelen ikinci bir istek mutasyonu TEKRARLAR. Bu yüzden rollback yalnız köprü
-- kodu devre dışıyken (CEMOS_LIFE_WRITE_TOKEN tanımsız) uygulanmalıdır.

BEGIN;

DROP INDEX IF EXISTS public.uq_cemos_bridge_idem;
DROP INDEX IF EXISTS public.idx_cemos_bridge_ts;
DROP TABLE IF EXISTS public.cemos_bridge_audit;

COMMIT;

NOTIFY pgrst, 'reload schema';
