// ─────────────────────────────────────────────────────────────────────────────
// Embedding yardımcıları — Google gemini-embedding-001 (mevcut GOOGLE_GEMINI_API_KEY).
// Çok-dilli (TR sorgu ↔ EN manüel), 768-dim. Yeni anahtar GEREKMEZ, Vercel'de çalışır.
// Hem offline indexer hem runtime sorgu embed'i aynı modeli kullanır (vektör uzayı uyumlu).
// best-effort: hata/anahtar yok → null (çağıran RAG'i atlar, mentor normal çalışır).
// ─────────────────────────────────────────────────────────────────────────────

const KEY = process.env.GOOGLE_GEMINI_API_KEY ?? ''
const MODEL = 'gemini-embedding-001'
export const EMBED_DIM = 768

export async function embedText(text: string): Promise<number[] | null> {
  const t = (text ?? '').trim()
  if (!KEY || !t) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: t.slice(0, 8000) }] },
          outputDimensionality: EMBED_DIM,
        }),
      },
    )
    if (!res.ok) return null
    const j = (await res.json()) as { embedding?: { values?: number[] } }
    const v = j?.embedding?.values
    return Array.isArray(v) && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
