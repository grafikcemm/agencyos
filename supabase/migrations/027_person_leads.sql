-- Migration 027: person_leads — pozisyon/kişi bazlı lead motoru (Apollo People Search)
-- NOT: Supabase SQL Editor üzerinden MANUEL uygulanır. Idempotent.
--
-- leads tablosundan AYRI tablo. leads ~60 kolonlu Google-Places şekilli; kişi leadinin
-- anahtarları (apollo_person_id, title, seniority, linkedin_url, company_domain) ve
-- skorlaması farklı. Ayrı tablo daily-scan + dedup mantığını hiç bozmaz.
--
-- İki amaç (purpose): 'b2b_sell' = satılacak karar vericiler (Pazarlama Müdürü, Kurucu,
-- CMO); 'job_application' = işe alım yöneticisi/recruiter (Kariyer Radarı tamamlayıcısı).

CREATE TABLE IF NOT EXISTS person_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kaynak + amaç
  source TEXT NOT NULL DEFAULT 'apollo',            -- 'apollo' | 'firecrawl' (gelecek)
  purpose TEXT NOT NULL DEFAULT 'b2b_sell'
    CHECK (purpose IN ('b2b_sell', 'job_application')),
  preset_id TEXT,                                   -- presets.ts içindeki preset id
  b2b_filter_label TEXT,                            -- CSV "Apollo Filtreleri (B2B)" etiketi

  -- Apollo kişi kimliği (dedup anahtarı). Firecrawl kaynağında NULL olabilir.
  apollo_person_id TEXT UNIQUE,

  -- Kişi
  full_name TEXT NOT NULL,
  title TEXT,
  seniority TEXT,                                   -- owner|founder|c_suite|vp|director|manager|...
  linkedin_url TEXT,
  email TEXT,
  email_status TEXT,                                -- verified|guessed|unavailable|null
  phone TEXT,

  -- Şirket (firma bağlamı)
  company_name TEXT,
  company_domain TEXT,
  company_industry TEXT,
  company_size TEXT,                                -- çalışan bandı, örn. '11-50'
  city TEXT,
  country TEXT,

  -- Skorlama (kişi-özel; leads'ten bağımsız)
  difficulty_score INT,                             -- 0-100 erişim/ikna zorluğu (ters anlam: düşük=kolay)
  market_score INT,                                 -- 0-100 pazar/segment çekiciliği
  earning_score INT,                                -- 0-100 kazanç potansiyeli
  person_score INT,                                 -- 0-100 kompozit
  person_tier TEXT,                                 -- A|B|C|D
  expected_monthly_value_tl INT,                    -- tahmini aylık ₺
  why_now TEXT,
  next_action TEXT,

  -- Yaşam döngüsü
  status TEXT NOT NULL DEFAULT 'new',               -- new|contacted|responded|meeting|proposal|converted|lost|dismissed
  notes TEXT,
  raw JSONB,                                        -- ham Apollo person objesi (denetim/ROI)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_leads_purpose_tier ON person_leads(purpose, person_tier);
CREATE INDEX IF NOT EXISTS idx_person_leads_status ON person_leads(status);
CREATE INDEX IF NOT EXISTS idx_person_leads_company_domain ON person_leads(company_domain);
CREATE INDEX IF NOT EXISTS idx_person_leads_score ON person_leads(person_score DESC);
