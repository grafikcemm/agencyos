-- 036: Canlı DB'ye MANUEL uygulanan güvenlik sertleştirmesinin repo kaydı (post-audit).
-- Bu objeler (leads_with_status view'ı, rls_auto_enable fonksiyonu) repo migration'larında
-- değil doğrudan Supabase'de oluşturulmuştu — bu dosya düzeltmeyi versiyonlar.
-- Idempotent + varlık-kontrollü: obje yoksa sessizce atlar (taze DB'de kırılmaz).
-- SQL Editor'da elle uygulanır (app DB). 032-035'e DOKUNMAZ.

-- 1) leads_with_status: SECURITY DEFINER davranışı leads RLS'ini baypas ediyordu
--    → security_invoker=true (sorgulayanın izinleriyle çalışır) + anon/authenticated REVOKE.
DO $$
BEGIN
  IF to_regclass('public.leads_with_status') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.leads_with_status SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON public.leads_with_status FROM anon, authenticated';
  END IF;
END $$;

-- 2) rls_auto_enable: yardımcı fonksiyon PUBLIC/anon/authenticated tarafından
--    çağrılabilir durumdaydı → EXECUTE yetkisi yalnız sahibinde/service-role'de kalır.
--    İmza bilinen tüm varyantlar için denenir; olmayan imza atlanır.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
