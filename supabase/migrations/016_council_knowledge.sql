-- Migration 016 — Konsey + Bilgi tabloları.
-- Önceden src/lib/migrations/003 (council_debates) ve 004 (knowledge_docs) altında,
-- normal Supabase migration akışından kopuktu. Repo'dan tekrar-üretilebilirlik için taşındı.
-- Kullanım: council/route.ts, knowledge/route.ts.

CREATE TABLE IF NOT EXISTS council_debates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  context text DEFAULT '',
  strategy_opinion text,
  risk_opinion text,
  operations_opinion text,
  growth_opinion text,
  president_synthesis text,
  status text DEFAULT 'open',                 -- 'approved', 'vetoed'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- knowledge_docs: knowledge/ markdown'ları git-ignored olduğundan Vercel'e gitmiyordu;
-- içerik DB'de tutulup serverless'ta sunulur (kalıcı disk yok).
CREATE TABLE IF NOT EXISTS knowledge_docs (
  key        text PRIMARY KEY,                -- dosya adı, örn. '00_GRAFIKCEM_CONTEXT.md'
  label      text,                            -- insan etiketi, örn. 'Grafikcem Bağlamı'
  content    text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);
