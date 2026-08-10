-- 068_niche_targeting — App DB
--
-- ⚠️ MANUEL UYGULANIR. Repo şemanın kanıt/versiyon kaydıdır; otomatik migration YOK.
--
-- NE GETIRIR
--   1. public.normalize_domain(text)  — kanonik alan adı normalizasyonu (SQL aynası)
--   2. leads üzerinde niş/kanıt/uyum/operasyon sütunları
--   3. leads.domain_normalized        — GENERATED column, istemci YAZAMAZ
--   4. duplicate KAPISI               — çakışma varsa migration DURUR
--   5. leads_domain_normalized_uniq   — yalnız kapı geçildikten sonra
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NEDEN GENERATED COLUMN, NEDEN TRIGGER DEĞİL
--
-- `domain_normalized` seed importer'ın EŞLEŞTİRME anahtarıdır. Eğer importer bu
-- alana yazabilseydi, "bu satır zaten var mı?" sorusunun cevabını sorunun kendisi
-- belirlerdi. GENERATED ALWAYS ... STORED, hiçbir istemcinin (service_role dahil)
-- bu alana yazamamasını VERİTABANI SEVİYESİNDE garanti eder.
--
-- BEDELİ: normalizasyon kuralı değişirse Postgres mevcut satırları kendiliğinden
-- yeniden hesaplamaz. Kural değişirse sütun DROP + yeniden ADD edilmeli (tablo
-- yeniden yazılır) — bu yüzden aşağıdaki parite bloğu var.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SQL ↔ TypeScript PARİTESİ
--
-- Bu fonksiyon `src/lib/leads/domain.ts` içindeki `normalizeDomain()` ile BİREBİR
-- aynı sonucu vermek zorunda. Ayrışırlarsa aynı şirket iki kez lead olur.
-- Aşağıdaki DO bloğu, TS tarafındaki DOMAIN_FIXTURES ile AYNI çiftleri SQL'de
-- koşar ve ayrışma varsa migration'ı durdurur. Fixture'ı bir tarafta değiştirip
-- diğerini unutmak imkânsız hale gelir.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÖNCE/SONRA SIRASI (bozulursa veri kaybolur)
--   website → domain backfill  ÖNCE
--   generated column           SONRA
--   duplicate kapısı           SONRA
--   UNIQUE constraint          EN SON
--
-- Idempotent: yeniden çalıştırmak güvenlidir. Constraint varlığı pg_constraint
-- üzerinden kontrol edilir (CREATE ... IF NOT EXISTS constraint için yoktur).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Kanonik normalizasyon fonksiyonu
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.normalize_domain(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT                      -- NULL girdi → NULL çıktı, gövde hiç çalışmaz
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE
           WHEN d ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
            AND d !~ '\.[0-9]+$'          -- sayısal son etiket = IP, şirket değil
           THEN d
           ELSE NULL
         END
  FROM (
    SELECT
      regexp_replace(                                        -- 7. sondaki nokta(lar)
        regexp_replace(                                      -- 6. www. öneklerinin TAMAMI
          regexp_replace(                                    -- 5. port
            regexp_replace(                                  -- 4. yol/query/fragment
              regexp_replace(                                -- 3. userinfo
                regexp_replace(                              -- 2. şema
                  lower(btrim(input)),                       -- 1. trim + lowercase
                  '^[a-z][a-z0-9+.-]*://', ''),
                '^[^/@]*@', ''),
              '[/?#].*$', ''),
            ':[0-9]+$', ''),
          '^(www\.)+', ''),
        '\.+$', '') AS d
  ) t;
$fn$;

COMMENT ON FUNCTION public.normalize_domain(text) IS
  'Kanonik alan adı normalizasyonu. src/lib/leads/domain.ts::normalizeDomain ile '
  'BİREBİR aynı olmak zorundadır — ayrışma sessiz duplicate lead üretir.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. SQL ↔ TS parite kapısı (TS tarafındaki DOMAIN_FIXTURES ile aynı çiftler)
-- ═══════════════════════════════════════════════════════════════════════════

DO $parity$
DECLARE
  fixtures CONSTANT text[][] := ARRAY[
    ['sinoz.com.tr',                              'sinoz.com.tr'],
    ['https://www.sinoz.com.tr',                  'sinoz.com.tr'],
    ['http://www.adoreoyuncak.com',               'adoreoyuncak.com'],
    ['https://www.bellamaison.com',               'bellamaison.com'],
    ['  HTTPS://WWW.Example.COM  ',               'example.com'],
    ['https://example.com/tr/urunler?utm_source=x#top', 'example.com'],
    ['example.com/',                              'example.com'],
    ['https://user:pass@example.com:8443/path',   'example.com'],
    ['example.com.',                              'example.com'],
    ['https://shop.example.co.uk',                'shop.example.co.uk'],
    ['www.www.example.com',                       'example.com'],
    ['',                                          NULL],
    ['   ',                                       NULL],
    ['localhost',                                 NULL],
    ['example',                                   NULL],
    ['https://192.168.1.10/admin',                NULL],
    ['not a domain',                              NULL],
    ['https://',                                  NULL]
  ];
  i        int;
  got      text;
  expected text;
BEGIN
  FOR i IN 1 .. array_length(fixtures, 1) LOOP
    expected := fixtures[i][2];
    got      := public.normalize_domain(fixtures[i][1]);
    IF got IS DISTINCT FROM expected THEN
      RAISE EXCEPTION
        'normalize_domain SQL/TS paritesi BOZUK: girdi=%  beklenen=%  bulunan=%. '
        'src/lib/leads/domain.ts ile bu fonksiyon ayrışmış — migration durduruldu.',
        fixtures[i][1], coalesce(expected, '<NULL>'), coalesce(got, '<NULL>');
    END IF;
  END LOOP;

  -- NULL girdi ayrıca kontrol (STRICT davranışı)
  IF public.normalize_domain(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'normalize_domain(NULL) NULL dönmeli';
  END IF;
END
$parity$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Sütunlar
--    Mevcut sütunlar TEKRAR EKLENMEZ. Özellikle DOKUNULMAYANLAR:
--      potential_score / base_score / score_reasons  → operasyonel skor motoru
--      confidence                                    → evidence engine (mig 004)
--      recommended_offer_id / recommended_offer_name → operasyonel teklif motoru
--      contacted_at / replied_at / meeting_at / …    → funnel damgaları (mig 012)
-- ═══════════════════════════════════════════════════════════════════════════

-- Kimlik / normalizasyon
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS domain              text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS country             text;
-- Domain benzersizliği yalnız aktif kayıtlara uygulanır. 071 bu işaretin epoch
-- semantiğini ve varsayılan görünümünü tamamlar; burada erken eklenmesi 068'in
-- tek başına da uygulanabilir kalmasını sağlar.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS retired_at          timestamptz;

-- Niş / ICP
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS niche_id            text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS employee_band       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ecommerce_status    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS advertising_activity text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS active_social_channels jsonb;

-- Sinyal / kanıt
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trigger_label       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trigger_date        date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS trigger_date_raw    text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS evidence_urls       jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS verified_at         timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS research_confidence text;

-- Araştırma skoru — OPERASYONEL SKORDAN AYRI TUTULUR.
-- `score_reasons` {reason,points}[] bekler; araştırma JSON'u anahtar→sayı nesnesi
-- taşır. İkisini aynı sütuna yazmak tip sözleşmesini kırar.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS research_score           integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS research_score_breakdown jsonb;

-- Teklif / vaka. `recommended_offer_id` ile ÇAKIŞMAZ: o operasyonel motorun
-- önerisi, bu araştırmanın eşleşmesi.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS case_match          text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS offer_match_label   text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS offer_match_id      text;

-- Uyum
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lawful_basis        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS suppression_status  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS consent_note        text;

-- Operasyon
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner               text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_action         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_check_date     date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contact_status      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS outreach_status     text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reply_status        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_status      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS paid_entry_status   text;

-- Provenance
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS provenance          jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source_batch        text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS seeded_at           timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Mevcut kayıtların backfill'i — GENERATED column'DAN ÖNCE
--    Sıra kritik: generated column coalesce(domain, website) kullanır, yani
--    sıra bozulsa bile doğru sonuç üretir; yine de `domain` alanının kendisi
--    okunabilir olsun diye backfill burada yapılır.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.leads
   SET domain = public.normalize_domain(website)
 WHERE domain IS NULL
   AND website IS NOT NULL
   AND public.normalize_domain(website) IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. domain_normalized — GENERATED, istemci yazamaz
-- ═══════════════════════════════════════════════════════════════════════════

DO $gen$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'leads'
       AND column_name = 'domain_normalized'
  ) THEN
    ALTER TABLE public.leads
      ADD COLUMN domain_normalized text
      GENERATED ALWAYS AS (public.normalize_domain(coalesce(domain, website))) STORED;
  END IF;
END
$gen$;

COMMENT ON COLUMN public.leads.domain_normalized IS
  'GENERATED — hiçbir istemci yazamaz. Seed importer''ın eşleştirme anahtarı. '
  'Normalizasyon kuralı değişirse bu sütun DROP + yeniden ADD edilmelidir.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. DUPLICATE KAPISI
--    Benzersizlik constraint'i EKLENMEDEN ÖNCE mevcut veri uzlaştırılmalı.
--    Çakışma varsa migration DURUR ve hangi satırların çakıştığını söyler.
--    Bu bir "sonra bakarız" uyarısı değil: constraint eklenmiş bir tabloda
--    duplicate keşfetmek, seed'i yarıda kesip yarım veri bırakır.
-- ═══════════════════════════════════════════════════════════════════════════

DO $dupe$
DECLARE
  dupe_count  int;
  sample      text;
BEGIN
  SELECT count(*) INTO dupe_count
    FROM (
      SELECT domain_normalized
        FROM public.leads
       WHERE domain_normalized IS NOT NULL
         AND retired_at IS NULL
       GROUP BY domain_normalized
      HAVING count(*) > 1
    ) d;

  IF dupe_count > 0 THEN
    SELECT string_agg(line, E'\n')
      INTO sample
      FROM (
        SELECT format('  %s → %s kayıt (id: %s)',
                      domain_normalized, count(*), string_agg(id::text, ', ')) AS line
          FROM public.leads
         WHERE domain_normalized IS NOT NULL
           AND retired_at IS NULL
         GROUP BY domain_normalized
        HAVING count(*) > 1
         ORDER BY count(*) DESC
         LIMIT 20
      ) s;

    RAISE EXCEPTION USING MESSAGE = format(
      E'DUPLICATE DOMAIN — migration durduruldu.\n%s farklı alan adı birden fazla aktif lead satırında geçiyor. UNIQUE index eklenmeden önce bunlar uzlaştırılmalı (birleştir veya birini emekliye ayır).\n\nİlk 20:\n%s\n\nUzlaştırma sonrası bu migration yeniden çalıştırılabilir.',
      dupe_count,
      sample
    );
  END IF;
END
$dupe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. UNIQUE index — kapı geçildiyse
--    NULL'lar ve emekli epoch kayıtları çakışmaz. Eski veri denetim için kalır;
--    benzersizlik yalnız operasyonel (retired_at IS NULL) yüzeyi korur.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS leads_domain_normalized_active_uniq
  ON public.leads (domain_normalized)
  WHERE domain_normalized IS NOT NULL AND retired_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Kapalı küme CHECK'leri
--    Serbest metin alanları (trigger_label, next_action, consent_note…) CHECK
--    ALMAZ — araştırma verisi serbest metindir, kısıtlamak veriyi kaybettirir.
--    Yalnız durum alanları kısıtlanır.
-- ═══════════════════════════════════════════════════════════════════════════

DO $checks$
DECLARE
  c record;
  wanted CONSTANT text[][] := ARRAY[
    ['leads_research_confidence_chk',
     $$research_confidence IS NULL OR research_confidence IN ('high','medium','low')$$],
    ['leads_contact_status_chk',
     $$contact_status IS NULL OR contact_status IN ('unenriched','manual_queue','enriched','verified')$$],
    ['leads_suppression_status_chk',
     $$suppression_status IS NULL OR suppression_status IN ('clear','suppressed','unknown')$$],
    ['leads_research_score_chk',
     $$research_score IS NULL OR (research_score >= 0 AND research_score <= 100)$$],
    ['leads_niche_id_chk',
     $$niche_id IS NULL OR niche_id IN ('beauty_fragrance_cosmetics','premium_home_kitchen_multibrand','toy_kids_family')$$]
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(wanted, 1) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = wanted[i][1] AND conrelid = 'public.leads'::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.leads ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                     wanted[i][1], wanted[i][2]);
      -- NOT VALID + VALIDATE: mevcut satırları uzun kilit altında taramaz.
      EXECUTE format('ALTER TABLE public.leads VALIDATE CONSTRAINT %I', wanted[i][1]);
    END IF;
  END LOOP;
END
$checks$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. İndeksler — niş hücresi içinde çalışan sorgular
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_leads_niche_score
  ON public.leads (niche_id, research_score DESC)
  WHERE niche_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_verification_due
  ON public.leads (next_check_date)
  WHERE next_check_date IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_source_batch
  ON public.leads (source_batch)
  WHERE source_batch IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. RLS
--     `leads` üzerinde RLS zaten mig 017 (rls_lockdown) + 036 (security_hardening)
--     ile kapalı: RLS açık, permissive policy yok, anon/authenticated REVOKE,
--     service_role baypas eder. YENİ SÜTUN POLİTİKA GEREKTİRMEZ — Postgres'te
--     RLS satır seviyesindedir, sütun eklemek erişimi genişletmez.
--     Bu blok yalnız o varsayımı DOĞRULAR; sessizce güvenmez.
-- ═══════════════════════════════════════════════════════════════════════════

DO $rls$
DECLARE
  rls_on boolean;
BEGIN
  SELECT relrowsecurity INTO rls_on
    FROM pg_class WHERE oid = 'public.leads'::regclass;

  IF NOT rls_on THEN
    RAISE EXCEPTION
      'leads tablosunda RLS KAPALI. 017_rls_lockdown / 036_security_hardening '
      'uygulanmamış olabilir. Yeni sütunlar eklenmeden önce RLS açılmalı.';
  END IF;
END
$rls$;

COMMIT;
