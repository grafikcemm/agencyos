-- 070_enrichment_reservations — App DB
--
-- ⚠️ MANUEL UYGULANIR. 069'DAN SONRA.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SORUN
--
-- "Aynı sorgu için iki kez ücret ödenmesin" garantisi bugün `provenance` jsonb
-- içindeki bir `query_hash` alanına bakılarak kuruluyordu. Bu YETERSİZ:
--   • jsonb içindeki bir alan üzerinde benzersizlik dayatılamaz
--   • "önce oku, yoksa çağır, sonra yaz" arasında bir pencere var
--   • aynı anda gelen iki istek pencereyi birlikte geçer → İKİ KEZ ödeme
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÇÖZÜM: REZERVASYON
--
-- Ücretli dış çağrıdan ÖNCE, `query_hash` üzerinde UNIQUE olan bir satır
-- INSERT edilir (`ON CONFLICT DO NOTHING`). Satırı yazabilen TEK istek
-- sağlayıcıya gider; diğeri INSERT'ün etkilemediğini görür ve mevcut kaydı
-- okur (tamamlanmışsa sonucu, sürüyorsa "devam ediyor").
--
-- HTTP ÇAĞRISI KİLİT ALTINDA TUTULMAZ: rezervasyon INSERT'ü commit olur,
-- bağlantı bırakılır, çağrı yapılır, sonra ayrı bir UPDATE ile tamamlanır.
-- Uzun süren bir sağlayıcı, veritabanı bağlantısını rehin almaz.
--
-- ÇÖKME KURTARMA: `in_progress` bir satır `stale_after`'ı geçerse başka bir
-- istek onu koşullu UPDATE ile devralabilir. Süresiz kilitlenme olmaz.

BEGIN;

CREATE TABLE IF NOT EXISTS public.enrichment_query_reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sorgunun kanonik parmak izi. Sağlayıcı + normalize edilmiş parametreler.
  -- UNIQUE — yarışın çözüldüğü yer burasıdır.
  query_hash    text NOT NULL UNIQUE,

  provider      text NOT NULL CHECK (provider IN ('apollo', 'serpapi', 'tavily', 'exa', 'firecrawl', 'pagespeed')),
  subject_type  text NOT NULL CHECK (subject_type IN ('company', 'person')),
  -- Serbest: domain veya lead id. FK YOK — sorgu, lead silinse bile bir kez
  -- ödendi ve bunun kaydı kalmalı.
  subject_key   text NOT NULL,

  status        text NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress', 'completed', 'failed')),

  -- Sonuç gövdesi. PII taşıyabilir → RLS aşağıda tam kapalı.
  result        jsonb,
  error_class   text,

  -- Maliyet görünürlüğü: "sonuç başına maliyet" bu iki alandan hesaplanır.
  cost_usd      numeric(10, 6) NOT NULL DEFAULT 0,
  credits_used  integer NOT NULL DEFAULT 0,

  -- Cache isabetleri: aynı sorgunun kaç kez ÖDEME YAPMADAN karşılandığı.
  cache_hits    integer NOT NULL DEFAULT 0,

  reserved_at   timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  -- Bu andan sonra `in_progress` satır çökmüş sayılır ve devralınabilir.
  stale_after   timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  -- Sonucun tazeliği. Geçince yeni bir ücretli sorgu MEŞRUDUR.
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '90 days'
);

CREATE INDEX IF NOT EXISTS enrichment_reservations_subject_idx
  ON public.enrichment_query_reservations (subject_type, subject_key, provider);

CREATE INDEX IF NOT EXISTS enrichment_reservations_stale_idx
  ON public.enrichment_query_reservations (stale_after)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS enrichment_reservations_cost_idx
  ON public.enrichment_query_reservations (provider, reserved_at DESC);

-- RLS: bu tablo sağlayıcı yanıtlarını (kişi adı, e-posta) taşır.
-- Kendi kilidini kendisi kurar; başka migration'a güvenmez.
ALTER TABLE public.enrichment_query_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrichment_query_reservations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_query_reservations TO service_role;

DO $verify$
DECLARE rls_on boolean; pol int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class
   WHERE oid = 'public.enrichment_query_reservations'::regclass;
  SELECT count(*) INTO pol FROM pg_policies
   WHERE schemaname='public' AND tablename='enrichment_query_reservations';
  IF NOT rls_on THEN RAISE EXCEPTION 'enrichment_query_reservations RLS açılamadı'; END IF;
  IF pol > 0 THEN RAISE EXCEPTION 'enrichment_query_reservations üzerinde % policy var', pol; END IF;
END
$verify$;

COMMENT ON TABLE public.enrichment_query_reservations IS
  'Ücretli dış sorgu rezervasyonu. query_hash UNIQUE — eşzamanlı iki istekten '
  'yalnız biri sağlayıcıya gider. HTTP çağrısı DB kilidi altında yapılmaz.';

-- ═══════════════════════════════════════════════════════════════════════════
-- contacts.email_confidence — tahmin edilmiş e-posta doğrulanmış gibi görünmez
--
-- Tahmin edilmiş e-posta TASLAK HAZIRLAMAYI ENGELLEMEZ (taslak yazmak ücretsiz
-- ve geri alınabilir), ama onay ve gönderim kapılarında BLOKE EDİLİR: yanlış
-- adrese gönderilen bir mesaj geri alınamaz ve suppression kaydını kirletir.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_confidence text;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contacts_email_confidence_chk'
       AND conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_email_confidence_chk
      CHECK (email_confidence IS NULL
             OR email_confidence IN ('guessed', 'probable', 'verified'))
      NOT VALID;
    ALTER TABLE public.contacts VALIDATE CONSTRAINT contacts_email_confidence_chk;
  END IF;
END
$chk$;

COMMENT ON COLUMN public.contacts.email_confidence IS
  'guessed = sağlayıcı tahmini (gönderim YASAK) · probable = pattern eşleşmesi '
  '(gönderim YASAK) · verified = sağlayıcı doğruladı veya insan teyit etti.';

COMMIT;
