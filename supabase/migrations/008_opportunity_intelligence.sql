-- Migration 008: Opportunity Intelligence OS Hardening
-- 6 tables for trend tracking, signal scoring, JARVIS opportunity memory, and sources

-- 1. Opportunity Products — 7 core product ideas (seeded separately)
CREATE TABLE IF NOT EXISTS opportunity_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'digital_product',
  action_tier TEXT NOT NULL DEFAULT 'park',
  priority_order INTEGER NOT NULL DEFAULT 99,
  status TEXT NOT NULL DEFAULT 'idea_stage',
  description TEXT,
  target_audience TEXT,
  price_range TEXT,
  score_total INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Watch Topics — keywords/topics to monitor across sources
CREATE TABLE IF NOT EXISTS opportunity_watch_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  linked_product_id TEXT REFERENCES opportunity_products(id) ON DELETE SET NULL,
  source_filter TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watch_topics_active ON opportunity_watch_topics(is_active);

-- 3. Trend Sources — monitoring source status & health
CREATE TABLE IF NOT EXISTS opportunity_trend_sources (
  id TEXT PRIMARY KEY, -- 'product_hunt', 'hacker_news', 'reddit', 'google_trends', 'turkey_gap'
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'rss', 'api', 'json_feed', 'static'
  url TEXT,
  is_active BOOLEAN DEFAULT true,
  trust_score INTEGER DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 100),
  last_status TEXT, -- 'ok', 'blocked', 'rate_limited', 'no_data', 'error'
  last_checked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Trend Signals — collected signals from various sources
CREATE TABLE IF NOT EXISTS opportunity_trend_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  relevance_score INTEGER DEFAULT 0 CHECK (relevance_score >= 0 AND relevance_score <= 100),
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  linked_product_id TEXT REFERENCES opportunity_products(id) ON DELETE SET NULL,
  matched_topic_id UUID REFERENCES opportunity_watch_topics(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'reviewed', 'actionable', 'parked', 'dismissed')),
  raw_data JSONB DEFAULT '{}',
  signal_hash TEXT UNIQUE, -- Deduplication hash
  collected_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Existing projects may already have this table from the first 008 draft.
-- CREATE TABLE IF NOT EXISTS does not add new columns to an existing table,
-- so keep hardening changes idempotent with explicit ALTER statements.
ALTER TABLE opportunity_trend_signals
  ADD COLUMN IF NOT EXISTS signal_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunity_trend_signals_signal_hash_key'
      AND conrelid = 'opportunity_trend_signals'::regclass
  ) THEN
    ALTER TABLE opportunity_trend_signals
      ADD CONSTRAINT opportunity_trend_signals_signal_hash_key UNIQUE (signal_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trend_signals_status ON opportunity_trend_signals(status);
CREATE INDEX IF NOT EXISTS idx_trend_signals_collected ON opportunity_trend_signals(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_signals_product ON opportunity_trend_signals(linked_product_id);
CREATE INDEX IF NOT EXISTS idx_trend_signals_confidence ON opportunity_trend_signals(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_signals_hash ON opportunity_trend_signals(signal_hash);

-- 5. Intel Reports — weekly/monthly summary reports
CREATE TABLE IF NOT EXISTS opportunity_intel_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL DEFAULT 'weekly' CHECK (report_type IN ('weekly', 'monthly', 'adhoc')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_signals INTEGER DEFAULT 0,
  actionable_signals INTEGER DEFAULT 0,
  parked_signals INTEGER DEFAULT 0,
  top_products JSONB DEFAULT '[]',
  summary TEXT,
  recommendations JSONB DEFAULT '[]',
  sources_status JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intel_reports_period ON opportunity_intel_reports(period_end DESC);

-- 6. JARVIS Opportunity Memory — conversation context for opportunity discussions
CREATE TABLE IF NOT EXISTS opportunity_jarvis_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT REFERENCES opportunity_products(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'insight' CHECK (message_type IN ('insight', 'question', 'decision', 'action', 'park')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_memory_product ON opportunity_jarvis_memory(product_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_memory_type ON opportunity_jarvis_memory(message_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS) & Policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE opportunity_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_watch_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_trend_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_trend_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_intel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_jarvis_memory ENABLE ROW LEVEL SECURITY;

-- DROP policies if they exist (to ensure safe rerun)
DROP POLICY IF EXISTS "Allow select for authenticated users" ON opportunity_products;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON opportunity_watch_topics;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON opportunity_trend_sources;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON opportunity_trend_signals;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON opportunity_intel_reports;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON opportunity_jarvis_memory;

-- SELECT policies allowing authenticated users to read
CREATE POLICY "Allow select for authenticated users" ON opportunity_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow select for authenticated users" ON opportunity_watch_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow select for authenticated users" ON opportunity_trend_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow select for authenticated users" ON opportunity_trend_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow select for authenticated users" ON opportunity_intel_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow select for authenticated users" ON opportunity_jarvis_memory FOR SELECT TO authenticated USING (true);

-- NOTE: All writing (INSERT/UPDATE/DELETE) is restricted from public/anon/authenticated roles,
-- which means only service_role (which bypasses RLS completely) is permitted.

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
