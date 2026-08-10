-- 008_career_evidence — LIFE DB (xcqrk… projesi)
--
-- ⚠️ MANUEL UYGULANIR (Supabase SQL Editor, LIFE projesi).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NEDEN LIFE DB
--
-- `career_state` ve `career_skills` zaten LIFE DB'de. Kanıtı App DB'ye koymak,
-- "bu beceri tamamlandı mı?" sorusunun cevabını İKİ veritabanına bölerdi.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ RLS BURADA AÇILIR — 002'YE GÜVENİLMEZ
--
-- `002_life_rls.sql` tek seferlik bir `DO $$` bloğudur: çalıştığı ANDA var olan
-- tabloları gezer. Bu tablo ondan SONRA yaratıldığı için o bloğun kapsamına
-- GİRMEZ. 002'nin "her tabloyu kilitler" davranışına güvenmek, bu tabloyu
-- anon key ile tarayıcıdan okunabilir bırakırdı.
--
-- Bu yüzden RLS + REVOKE burada AÇIKÇA yapılır ve sonucu DOĞRULANIR.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NEDEN KANIT lead_evidence İÇİNE KONMUYOR
--
-- `lead_evidence` (App DB, mig 033) bir LEAD'in satın alma sinyalini kanıtlar:
-- öznesi bir şirket, ömrü bir satış döngüsü, sahibi CRM. Kariyer kanıtının
-- öznesi Cem'in bir YETKİNLİĞİ, ömrü yıllar, sahibi kariyer rotası.
--
-- İkisini aynı tabloya sıkıştırmak, iki farklı şeyi aynı adla anmak olurdu:
-- "kanıt tazeliği" sorgusu satış kanıtıyla portföy kanıtını karıştırır ve
-- 14 günlük yeniden doğrulama kuralı yanlışlıkla portföye de uygulanırdı.
--
-- İlişki AYRI bir bağ tablosuyla kurulur (`career_evidence_links`): bir kanıt
-- hem bir yetkinliği hem bir iş ilanını hem bir teklifin proof point'ini
-- besleyebilir. Bu semantik olarak doğru: aynı yayındaki sayfa, hem "responsive
-- UI biliyorum" kanıtı hem de bir teklifin referansıdır.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Kanıt kayıtları
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.career_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- `careerRoute.ts` içindeki EvidenceRequirement.id (ör. 'm1-landing').
  -- FK YOK: gereksinim listesi kodda yaşar, veritabanında değil.
  requirement_id text,
  -- `careerRoadmap.ts` içindeki CareerSkill.id.
  competency_id text,
  month_id      text CHECK (month_id IS NULL OR month_id IN ('month-1','month-2','month-3','month-4')),

  kind          text NOT NULL CHECK (kind IN (
                  'published_page','git_commit','pr','design_system','user_test_notes',
                  'demo_recording','measurement','lead_flow','eval_result',
                  'client_approval','case_study','publication')),

  url           text,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  owner         text NOT NULL DEFAULT 'cem',
  notes         text CHECK (notes IS NULL OR char_length(notes) <= 2000),

  occurred_at   timestamptz NOT NULL DEFAULT now(),

  -- ── Doğrulama durumu ────────────────────────────────────────────────────
  -- `grace`: geçici ağ hatası. İlerleme ANINDA düşürülmez — bir DNS hatası
  -- aylık kilometre taşını geri almamalı. 3 başarısız denemeden veya kalıcı
  -- 4xx/410'dan sonra `unreachable` olur ve o zaman ilerleme düşer.
  verification_status text NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','grace','unreachable')),
  verified_at   timestamptz,
  retry_count   integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error    text CHECK (last_error IS NULL OR char_length(last_error) <= 240),
  next_retry_at timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS career_evidence_requirement_idx
  ON public.career_evidence (requirement_id, verification_status);

CREATE INDEX IF NOT EXISTS career_evidence_competency_idx
  ON public.career_evidence (competency_id, verification_status);

CREATE INDEX IF NOT EXISTS career_evidence_retry_idx
  ON public.career_evidence (next_retry_at)
  WHERE verification_status IN ('pending','grace');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Bağ tablosu — bir kanıt birden fazla şeye bağlanabilir
--    Kariyer kanıtı, iş ilanı ve teklif proof point'i AYRI kavramlardır;
--    aralarındaki ilişki bir bağ tablosuyla kurulur, tek tabloya sıkıştırılmaz.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.career_evidence_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id  uuid NOT NULL REFERENCES public.career_evidence(id) ON DELETE CASCADE,

  target_type  text NOT NULL CHECK (target_type IN ('job_listing','offer','competency','case_study')),
  -- Hedef BAŞKA bir veritabanında olabilir (job_listing App DB'de).
  -- Bu yüzden FK yok, yalnız tipli anahtar. Çapraz-DB FK zaten mümkün değil ve
  -- olsaydı iki veritabanını birbirine kilitlerdi.
  target_key   text NOT NULL,
  note         text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (evidence_id, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS career_evidence_links_target_idx
  ON public.career_evidence_links (target_type, target_key);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — AÇIKÇA, bu migration içinde
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.career_evidence       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_evidence_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.career_evidence       FROM anon, authenticated;
REVOKE ALL ON public.career_evidence_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_evidence       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_evidence_links TO service_role;

-- Policy YOK + RLS açık = anon/authenticated tam red. service_role hem
-- RLS'i baypas eder hem de Data API için gerekli açık tablo yetkisine sahiptir.

DO $verify$
DECLARE
  t text;
  rls_on boolean;
  pol int;
  anon_privs int;
BEGIN
  FOREACH t IN ARRAY ARRAY['career_evidence', 'career_evidence_links'] LOOP
    SELECT relrowsecurity INTO rls_on
      FROM pg_class WHERE oid = format('public.%I', t)::regclass;
    IF NOT rls_on THEN
      RAISE EXCEPTION '% üzerinde RLS açılamadı', t;
    END IF;

    SELECT count(*) INTO pol
      FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF pol > 0 THEN
      RAISE EXCEPTION '% üzerinde % policy var — permissive policy anon erişimi açar', t, pol;
    END IF;

    SELECT count(*) INTO anon_privs
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = t
       AND grantee IN ('anon', 'authenticated');
    IF anon_privs > 0 THEN
      RAISE EXCEPTION '% üzerinde anon/authenticated hâlâ % yetki taşıyor', t, anon_privs;
    END IF;
  END LOOP;
END
$verify$;

COMMENT ON TABLE public.career_evidence IS
  'Kariyer kanıt artefaktları. lead_evidence''DEN AYRI: öznesi bir yetkinlik, '
  'ömrü yıllar. RLS bu migration içinde açılır — 002''nin tek seferlik bloğu '
  'sonradan yaratılan tabloyu kapsamaz.';

COMMENT ON COLUMN public.career_evidence.verification_status IS
  'pending → henüz denenmedi · verified → erişildi · grace → geçici hata, '
  'ilerleme DÜŞMEZ · unreachable → kalıcı hata, ilerleme düşer.';

COMMIT;
