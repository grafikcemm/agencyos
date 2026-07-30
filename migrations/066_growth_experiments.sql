-- 066_growth_experiments — App DB (dfedeh…)
--
-- ⚠️ MANUEL UYGULANIR. Repo şemanın kanıt/versiyon kaydıdır; otomatik migration YOK.
-- Bu dosya UYGULANMADAN Apify/Instantly adapterleri feature flag arkasında
-- (default KAPALI) çalışamaz — ve zaten çalışmamalıdır.
--
-- NE GETIRIR: kaynak sağlayıcıdan (Apify) gelen lead partileri ve gönderim
-- sağlayıcısıyla (Instantly) kurulan eşleşme/olay kaydı. İkisi de mevcut CRM'in
-- YERINE geçmez: leads, contacts, outreach_messages ve proposals AgencyOS'ta
-- kalır. Sağlayıcılar yalnız birer ADAPTER'dır.
--
-- TASARIM KARARLARI (hepsi geri alınabilirlik ve doğruluk için):
--
--   · outreach_messages'a eklenen beş sütun NULLABLE. Var olan her satır
--     dokunulmadan geçerli kalır; deney kaydı OLMAYAN eski gönderimler
--     "deneyi olmayan gönderim" olarak okunur, sıfırıncı deney olarak değil.
--   · outreach_provider_events RAW PAYLOAD SAKLAMAZ. Sağlayıcı gövdeleri
--     e-posta adresi ve mesaj metni taşır; onları burada tutmak CRM dışında
--     ikinci bir PII deposu yaratırdı. Yalnız normalize alanlar + payload_hash.
--   · UNIQUE(provider, remote_event_id): polling tekrar çalıştığında aynı olay
--     ikinci kez işlenmez. Idempotensi burada, kodda değil.
--   · provider_state kapalı küme ve 'provider_unknown' ONUN BIR PARCASI:
--     zaman aşımı/5xx sonrası "gönderildi mi bilmiyoruz" durumu ADIYLA
--     saklanmalı. Bilinmeyeni 'sent' ya da 'failed' saymak, ya çift gönderime
--     ya da kayıp gönderime yol açar.
--   · Her tabloda RLS açık + SIFIR policy + anon/authenticated REVOKE.
--     service_role RLS'i baypas eder; tarayıcıdan erişim tam kapalı.
--
-- Idempotent: yeniden çalıştırmak güvenlidir.

BEGIN;

-- ───────────────────────────── deneyler ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.growth_experiments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,          -- insan-okunur kısa ad
  niche         text,                          -- hedeflenen niş
  offer         text,                          -- test edilen teklif
  source        text,                          -- places | apollo | apify | manual
  hypothesis    text,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'running', 'paused', 'concluded')),
  started_at    timestamptz,
  concluded_at  timestamptz,
  -- Sonuç METNI değil, KARAR: hangi varyant, hangi kanıtla. Boş bırakılabilir;
  -- yeterli örneklem yoksa karar YAZILMAMALI.
  conclusion    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id  uuid NOT NULL REFERENCES public.growth_experiments (id) ON DELETE CASCADE,
  key            text NOT NULL,                -- 'a' | 'b' | serbest kısa ad
  sequence_key   text,                         -- ör. 'email_pilot_v1'
  description    text,
  -- Tek değişken kuralı: bir varyant öncekinden TEK bir şeyle ayrılmalı.
  -- Alan serbest metin çünkü değişken tipi sabit değil (konu, açılış, CTA…).
  changed_variable text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, key)
);

-- ─────────────────────── kaynak (Apify) partileri ───────────────────────────

CREATE TABLE IF NOT EXISTS public.prospect_import_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text NOT NULL,           -- apify | places | apollo | fake
  provider_run_id     text,                    -- sağlayıcı tarafındaki koşu kimliği
  experiment_id       uuid REFERENCES public.growth_experiments (id) ON DELETE SET NULL,
  params              jsonb,                   -- sorgu parametreleri (PII yok)
  status              text NOT NULL DEFAULT 'estimated'
                      CHECK (status IN ('estimated', 'running', 'fetched', 'failed', 'cancelled')),
  -- BUTCE: tahmin ve GERCEK ayrı tutulur. Tek alan olsaydı, tahminin tuttuğu
  -- varsayılır ve aylık tavan sessizce aşılırdı.
  requested_count     integer,
  received_count      integer,
  accepted_count      integer,
  invalid_count       integer,
  duplicate_count     integer,
  missing_company_count integer,
  missing_decision_maker_count integer,
  estimated_cost_usd  numeric(10, 4),
  actual_cost_usd     numeric(10, 4),
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  UNIQUE (provider, provider_run_id)
);

CREATE INDEX IF NOT EXISTS idx_prospect_batches_month
  ON public.prospect_import_batches (provider, created_at DESC);

-- ──────────────────── gönderim sağlayıcısı eşleşme/olay ─────────────────────

CREATE TABLE IF NOT EXISTS public.outreach_provider_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,                 -- gmail | instantly | fake
  kind          text NOT NULL CHECK (kind IN ('lead', 'campaign', 'message')),
  local_id      text NOT NULL,                 -- AgencyOS tarafındaki kimlik
  remote_id     text,                          -- sağlayıcıdaki kimlik
  state         text NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending', 'synced', 'sent', 'bounced', 'replied',
                                 'opted_out', 'failed', 'provider_unknown')),
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, kind, local_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_mappings_state
  ON public.outreach_provider_mappings (provider, state);

CREATE TABLE IF NOT EXISTS public.outreach_provider_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL,
  remote_event_id text NOT NULL,
  event_type      text NOT NULL,               -- sent | delivered | reply | bounce | complaint | opt_out
  local_id        text,                        -- eşleşebildiyse AgencyOS kimliği
  occurred_at     timestamptz,
  -- HAM PAYLOAD YOK. Yalnız parmak izi: aynı olayın iki farklı gövdeyle
  -- geldiğini görebilmek için yeterli, PII saklamak için değil.
  payload_hash    text,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, remote_event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_events_unprocessed
  ON public.outreach_provider_events (provider, processed_at)
  WHERE processed_at IS NULL;

-- ──────────────── mevcut outreach_messages'a NULLABLE bağlar ────────────────

ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS experiment_id uuid
  REFERENCES public.growth_experiments (id) ON DELETE SET NULL;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS variant_id uuid
  REFERENCES public.growth_experiment_variants (id) ON DELETE SET NULL;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS source_batch_id uuid
  REFERENCES public.prospect_import_batches (id) ON DELETE SET NULL;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS outreach_provider text;
ALTER TABLE public.outreach_messages ADD COLUMN IF NOT EXISTS provider_state text;

CREATE INDEX IF NOT EXISTS idx_outreach_messages_experiment
  ON public.outreach_messages (experiment_id, variant_id);

-- ───────────────────────────────── RLS ──────────────────────────────────────
-- Açık RLS + SIFIR policy = anon/authenticated için tam red. service_role
-- baypas eder, yani sunucu tarafı kod çalışmaya devam eder.

ALTER TABLE public.growth_experiments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_experiment_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_import_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_provider_mappings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_provider_events    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.growth_experiments         FROM anon, authenticated;
REVOKE ALL ON public.growth_experiment_variants FROM anon, authenticated;
REVOKE ALL ON public.prospect_import_batches    FROM anon, authenticated;
REVOKE ALL ON public.outreach_provider_mappings FROM anon, authenticated;
REVOKE ALL ON public.outreach_provider_events   FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
