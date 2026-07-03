-- Migration 042 — pgvector embedding store (Faz 2, plan §11/§18). EXACT-FIRST:
-- 487 satırda ANN (ivfflat/hnsw) index YOK; ölçüm olmadan eklenmez (plan §18).
-- Her satır: embedding + embedding_model + dimension + source_hash (yalnız değişince
-- yeniden-embed) + indexed_at. Politikasız-RLS + REVOKE. Additive + idempotent + atomik.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- gemini-embedding-001 = 768-dim (mevcut assistant/embeddings.ts ile aynı).
CREATE TABLE IF NOT EXISTS skill_embeddings (
  skill_slug      TEXT PRIMARY KEY REFERENCES skills(slug) ON DELETE CASCADE,
  embedding       vector(768),
  embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
  dimension       INTEGER NOT NULL DEFAULT 768,
  source_hash     TEXT NOT NULL,
  text_indexed    TEXT,
  indexed_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE skill_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON skill_embeddings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS tool_embeddings (
  tool_key        TEXT PRIMARY KEY REFERENCES tool_registry(key) ON DELETE CASCADE,
  embedding       vector(768),
  embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
  dimension       INTEGER NOT NULL DEFAULT 768,
  source_hash     TEXT NOT NULL,
  text_indexed    TEXT,
  indexed_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tool_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tool_embeddings FROM anon, authenticated;

-- Hafıza (archival tier) semantik retrieval — Faz 4 governance ile dolar.
CREATE TABLE IF NOT EXISTS memory_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_key      TEXT NOT NULL,
  embedding       vector(768),
  embedding_model TEXT NOT NULL DEFAULT 'gemini-embedding-001',
  dimension       INTEGER NOT NULL DEFAULT 768,
  source_hash     TEXT NOT NULL,
  indexed_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_key ON memory_embeddings(memory_key);
ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON memory_embeddings FROM anon, authenticated;

-- NOT: ANN index (ivfflat/hnsw) BİLEREK eklenmedi — 487 satır için exact cosine
-- sub-ms; index yalnız ölçüm gerekçelendirince ayrı, txn-dışı CONCURRENTLY migration'la.

COMMIT;
