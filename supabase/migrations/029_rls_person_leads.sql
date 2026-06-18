-- Migration 029 — person_leads + person_scan_runs için RLS (savunma derinliği).
-- NOT: Supabase SQL Editor üzerinden MANUEL uygulanır. Idempotent.
--
-- 017'nin uzantısı: bu iki tablo 027/028'de (017'den SONRA) eklendiği için 017'nin
-- listesinde yoktu → anon anahtarıyla REST üzerinden açıktaydı. Politikasız RLS =
-- anon/authenticated için tam red; service-role (supabaseAdmin) bypass eder, uygulama kırılmaz.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['person_leads', 'person_scan_runs'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END $$;
