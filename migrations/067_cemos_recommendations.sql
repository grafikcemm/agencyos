-- 067_cemos_recommendations — App DB
--
-- ⚠️ MANUEL UYGULANIR. Repo şemanın kanıt/versiyon kaydıdır; otomatik migration YOK.
-- Bu dosya uygulanmadan growth köprüsünün YAZMA yolu çalışmaz (öneri satırı
-- yazılamaz) ve okuma yolu `warnings` ile eksik kaynağı bildirir. Bu doğru
-- davranıştır: uygulanmamış bir şema, sessizce boş liste dönmemeli.
--
-- NE GETIRIR:
--   · cemos_recommendations — GrafikcemOS'un ürettiği deney önerileri
--   · cemos_growth_audit    — growth köprüsünün denetim + idempotency kaydı
--
-- NEDEN İKİSİ BİRLİKTE: idempotency anahtarının UNIQUE olduğu tablo, yazmanın
-- yapıldığı veritabanıyla AYNI olmalı. Ayrı DB'de olsaydı iki eşzamanlı istek
-- arasında "denetim yazıldı ama öneri yazılamadı" (ya da tersi) durumu
-- oluşabilirdi. LIFE köprüsünde de aynı karar verilmişti (life-007).
--
-- TASARIM KARARLARI:
--   · `status` DEFAULT 'proposed' ve kapalı küme. İstemci bu alanı GÖNDEREMEZ
--     (zod şemasında yok); bir öneri kendini onaylayamaz.
--   · Serbest metin alanları CHECK ile kısa tutulur. Uzun metin okunmaz,
--     dolayısıyla karara girmez — ama depolanır ve içine PII sızabilir.
--   · Denetim tablosu gövde SAKLAMAZ: yalnız yol adı, durum ve gövdenin hash'i.
--   · Her iki tabloda RLS açık + SIFIR policy + anon/authenticated REVOKE.
--     service_role RLS'i baypas eder; tarayıcıdan erişim tam kapalı.
--
-- Idempotent: yeniden çalıştırmak güvenlidir.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cemos_recommendations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text NOT NULL,
  kind              text NOT NULL
                    CHECK (kind IN ('experiment', 'source', 'copy', 'targeting')),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 120),
  rationale         text NOT NULL CHECK (char_length(rationale) BETWEEN 20 AND 1000),
  proposed_change   text NOT NULL CHECK (char_length(proposed_change) BETWEEN 8 AND 500),
  evidence_ref      text CHECK (evidence_ref IS NULL OR char_length(evidence_ref) <= 200),
  experiment_key    text CHECK (experiment_key IS NULL OR char_length(experiment_key) <= 80),
  confidence        text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  -- Üreten taraf örneklemin yeterli olmadığını SÖYLEMEK zorunda. Bu alan
  -- olmasaydı, 3 gönderime dayanan bir öneri 300 gönderime dayananla aynı
  -- görünürdü.
  sample_sufficient boolean NOT NULL DEFAULT false,
  -- Karar AgencyOS'ta verilir. Öneri kendiliğinden uygulanmaz.
  status            text NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'accepted', 'rejected', 'applied')),
  decided_at        timestamptz,
  decision_note     text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cemos_recommendations_open
  ON public.cemos_recommendations (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cemos_growth_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route            text NOT NULL,
  method           text NOT NULL,
  scope            text NOT NULL CHECK (scope IN ('read', 'write')),
  -- Idempotensi ANAHTARI burada. Aynı anahtarla ikinci bir BAŞARILI yazma
  -- olamaz; kod bunu sorgular, veritabanı garanti eder.
  idempotency_key  text UNIQUE,
  -- Gövdenin parmak izi — gövdenin KENDİSİ değil.
  request_hash     text,
  status           integer NOT NULL,
  response_summary jsonb,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cemos_growth_audit_route
  ON public.cemos_growth_audit (route, created_at DESC);

ALTER TABLE public.cemos_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cemos_growth_audit    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cemos_recommendations FROM anon, authenticated;
REVOKE ALL ON public.cemos_growth_audit    FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
