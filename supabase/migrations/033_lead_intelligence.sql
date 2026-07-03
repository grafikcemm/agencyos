-- 033: Lead Intelligence v2 çekirdek tabloları.
-- lead_intel_runs   : günlük pipeline checkpoint + koşu telemetrisi (agent_tasks şemasına
--                     uymaz: task_type yok, FK'lar directive/agent zorunlu kılar — bu yüzden ayrı tablo).
-- lead_evidence     : URL + zaman + güven + doğrulanma durumlu kanıt kayıtları.
-- lead_assessments  : konsey koşusu başına 1 satır; shadow modda lead_id NULL olabilir
--                     (aday snapshot'ı candidate jsonb'de saklanır).
-- lead_service_matches / lead_match_feedback : kanıta bağlı hizmet eşleşmeleri + operatör geri bildirimi.
-- Idempotent — 032'den sonra. SQL Editor'da elle uygulanır (app DB).

CREATE TABLE IF NOT EXISTS lead_intel_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('off', 'shadow', 'active')),
  stage TEXT NOT NULL DEFAULT 'discovered'
    CHECK (stage IN ('discovered', 'audited', 'assessed', 'done', 'error')),
  candidates JSONB NOT NULL DEFAULT '[]'::JSONB,
  selected_count INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lead_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'pagespeed', 'screenshot', 'html_signal', 'cta_analysis',
    'form_analysis', 'tech_stack', 'review_signal', 'places_data'
  )),
  source TEXT NOT NULL,               -- 'psi_v5' | 'html_fetch' | 'google_places'
  url TEXT,                           -- denetlenen URL
  storage_path TEXT,                  -- yalnız screenshot (private bucket yolu)
  summary TEXT,                       -- TR tek cümlelik insan-okur özet
  payload JSONB,                      -- ham metrikler (LCP, CLS, form sayısı, CTA listesi…)
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_evidence_lead ON lead_evidence(lead_id);

CREATE TABLE IF NOT EXISTS lead_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,  -- shadow adaylarında NULL olabilir
  candidate JSONB,                    -- lead_id NULL ise aday snapshot'ı
  run_date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('council', 'deterministic')),
  shadow BOOLEAN NOT NULL DEFAULT FALSE,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  design_score INTEGER,
  ai_score INTEGER,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  verified_evidence_count INTEGER NOT NULL DEFAULT 0,
  council JSONB,                      -- yalnız şema-doğrulanmış ajan çıktıları
  chair_verdict JSONB,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  pipeline_version TEXT NOT NULL DEFAULT 'v2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_assessments_date ON lead_assessments(run_date);
CREATE INDEX IF NOT EXISTS idx_lead_assessments_lead ON lead_assessments(lead_id);

CREATE TABLE IF NOT EXISTS lead_service_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES lead_assessments(id) ON DELETE CASCADE,
  lead_id UUID,
  service_slug TEXT NOT NULL,         -- FK değil: kod validate eder (migration sırası kırılganlığı önlenir)
  rank INTEGER NOT NULL DEFAULT 1,    -- 1 = ana hizmet
  score INTEGER NOT NULL,
  evidence_refs UUID[] NOT NULL DEFAULT '{}',
  reasons TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_service_matches_assessment ON lead_service_matches(assessment_id);

CREATE TABLE IF NOT EXISTS lead_match_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  assessment_id UUID,
  match_id UUID,
  verdict TEXT NOT NULL CHECK (verdict IN ('uygun', 'uygun_degil')),
  reason_code TEXT CHECK (reason_code IN (
    'yanlis_sektor', 'zayif_kanit', 'hizmet_uyumsuz', 'fiyat_uyumsuz',
    'zaten_cozulmus', 'dusuk_potansiyel', 'diger'
  )),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_match_feedback_lead ON lead_match_feedback(lead_id);

-- RLS: politikasız RLS = anon/authenticated tam red; service-role bypass (029 deseni).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'lead_intel_runs', 'lead_evidence', 'lead_assessments',
    'lead_service_matches', 'lead_match_feedback'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
