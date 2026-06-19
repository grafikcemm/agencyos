// ─────────────────────────────────────────────────────────────────────────────
// Semantik bilgi retrieval — terapötik manüellerden (offline indexlenmiş) Cem'in
// mesajına en yakın pasajları çeker ve mentor prompt'una enjekte eder.
//
// Vektörler bundle'lı src/data/knowledgeIndex.json'da (DB/pgvector/migration YOK).
// Runtime: Gemini ile sorgu embed → in-memory cosine → top-k. best-effort:
// index boş / embed başarısız → boş döner, mentor Faz 1+2 gibi çalışır.
// ─────────────────────────────────────────────────────────────────────────────
import indexData from '@/data/knowledgeIndex.json'
import { embedText, cosineSimilarity } from './embeddings'

interface KnowledgeChunk {
  source: string
  content: string
  embedding: number[]
}

const CHUNKS = indexData as KnowledgeChunk[]
// Çapraz-dil (TR sorgu ↔ EN manüel) cosine ilgili içerikte ~0.45-0.60, alakasızda ~0.3-0.4.
const MIN_SCORE = 0.45

export interface KnowledgeHit {
  source: string
  content: string
  score: number
}

export async function retrieveKnowledge(query: string, k = 2): Promise<KnowledgeHit[]> {
  if (!Array.isArray(CHUNKS) || CHUNKS.length === 0) return []
  const qv = await embedText(query)
  if (!qv) return []
  return CHUNKS
    .map((c) => ({ source: c.source, content: c.content, score: cosineSimilarity(qv, c.embedding) }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** Mentor system prompt'una eklenecek pasaj bloğu (eşleşme yoksa boş string). */
export async function buildKnowledgeBlock(query: string, k = 2): Promise<string> {
  try {
    const hits = await retrieveKnowledge(query, k)
    if (hits.length === 0) return ''
    const lines = [
      "=== İLGİLİ KAYNAK PASAJLARI (terapötik manüellerden — teknik uygularken faydalan, kaynak/etiket adı verme) ===",
    ]
    for (const h of hits) {
      lines.push(`• ${h.content.trim().slice(0, 500)}`)
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}
