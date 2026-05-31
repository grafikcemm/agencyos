-- Agency OS Memory System — Migration 001
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary text NOT NULL,
  key_facts jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact text NOT NULL,
  source_session_id uuid REFERENCES sessions(id),
  importance_score int DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim text NOT NULL,
  status text DEFAULT 'open',
  evidence jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision text NOT NULL,
  why text,
  made_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS autoresearch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposals jsonb DEFAULT '[]',
  accepted jsonb DEFAULT '[]',
  quality_score numeric DEFAULT 0,
  ran_at timestamptz DEFAULT now()
);

-- Seed initial strategy fields
INSERT INTO strategy (field, value) VALUES
  ('north_star', '"Türkiye''nin en iyi AI ajansı olmak"'),
  ('audience', '"Küçük/orta ölçekli yerel işletmeler (güzellik, kafe, butik, restoran)"'),
  ('voice_rules', '["Profesyonel ama samimi", "Türkçe öncelikli", "Jargon kullanma", "Sonuç odaklı"]'),
  ('do_list', '["AI görseller ile fark yarat", "Hızlı teslimat", "Müşteri referansı iste", "Aylık rapor gönder"]'),
  ('dont_list', '["Bedava iş yapma", "Tek seferlik projeler alma", "Fiyat savaşına girme"]')
ON CONFLICT (field) DO NOTHING;
