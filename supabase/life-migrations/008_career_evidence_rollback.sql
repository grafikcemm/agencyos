-- 008_career_evidence_rollback — LIFE DB
--
-- ⚠️ VERİ KAYBI: tüm kariyer kanıtları ve bağları silinir. Kanıta dayalı
-- ilerleme hesabı çöker; Gelişim ekranı her ayı "kanıt bekliyor" gösterir.
--
-- `career_state` ve `career_skills` KORUNUR — kullanıcının işaretlediği
-- beceriler ve odak seçimi bu rollback'ten etkilenmez.
--
-- Silmeden önce dışa aktar:
--   select * from career_evidence order by occurred_at;

BEGIN;

DROP INDEX IF EXISTS public.career_evidence_links_target_idx;
DROP TABLE IF EXISTS public.career_evidence_links;

DROP INDEX IF EXISTS public.career_evidence_requirement_idx;
DROP INDEX IF EXISTS public.career_evidence_competency_idx;
DROP INDEX IF EXISTS public.career_evidence_retry_idx;
DROP TABLE IF EXISTS public.career_evidence;

COMMIT;
