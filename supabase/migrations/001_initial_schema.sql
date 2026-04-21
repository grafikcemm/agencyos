-- ============================================
-- AGENCY OS — Initial Schema
-- Supabase SQL Editor'da çalıştırın
-- ============================================

-- Leads tablosu
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL,
  sector TEXT,
  city TEXT,
  district TEXT,
  phone TEXT,
  website TEXT,
  email TEXT,
  google_place_id TEXT UNIQUE,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  rating DECIMAL(2,1),
  review_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new',
  -- new / contacted / responded / meeting / proposal / converted / lost
  potential_score INTEGER DEFAULT 0,
  ai_analysis TEXT,
  pitch TEXT,
  notes TEXT,
  has_website BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projeler tablosu
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  business_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  -- active / paused / completed / cancelled
  services TEXT[],
  setup_fee DECIMAL(10,2) DEFAULT 0,
  monthly_fee DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'TRY',
  start_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Oyun Kitapları tablosu
CREATE TABLE IF NOT EXISTS playbooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  monthly_fee DECIMAL(10,2) DEFAULT 0,
  pitch_template TEXT,
  steps TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ayarlar tablosu
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Başlangıç Verileri
-- ============================================

-- Playbook seed data
INSERT INTO playbooks (name, category, description, setup_fee, monthly_fee, pitch_template) VALUES
('Sosyal Medya Yönetimi', 'İçerik', 'Aylık içerik takvimi, 20 post, story yönetimi', 3000, 8000, 'Sosyal medyanızı profesyonelce yönetiyoruz.'),
('Logo & Marka Kimliği', 'Tasarım', 'Logo, renk paleti, tipografi, brand guideline', 8000, 0, 'Markanıza güçlü bir kimlik kazandırıyoruz.'),
('Web Sitesi Tasarımı', 'Web', 'Modern, mobil uyumlu kurumsal web sitesi', 15000, 2000, 'Dijital varlığınızı güçlendiriyoruz.'),
('AI Görsel Üretimi', 'AI', 'Aylık 50 AI destekli görsel üretimi', 2000, 5000, 'AI gücüyle içerik maliyetinizi düşürüyoruz.'),
('Marka + Sosyal Paket', 'Paket', 'Logo + 3 aylık sosyal medya yönetimi', 18000, 7000, 'Eksiksiz marka başlangıcı paketi.')
ON CONFLICT DO NOTHING;

-- Settings seed data
INSERT INTO settings (key, value) VALUES
('agency_name', 'GrafikCem Studio'),
('agency_email', 'info@grafikcem.com'),
('google_maps_key', ''),
('gemini_key', '')
ON CONFLICT DO NOTHING;

-- ============================================
-- İndeksler
-- ============================================
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_sector ON leads(sector);
CREATE INDEX IF NOT EXISTS idx_leads_google_place_id ON leads(google_place_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_lead_id ON projects(lead_id);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
