import { callLight } from '@/lib/openrouter'

// ─────────────────────────────────────────────────────────────────────────────
// Soru sınıflandırıcı — gelen serbest metni iki yola ayırır:
//   life_quick          → hızlı tek-LLM mentor cevabı (hayat: öğün/rutin/sağlık)
//   business_deliberate → çok-ajanlı iş kurulu (müşteri/lead/pipeline/satış)
//
// Önce LLM'siz keyword fast-path; yalnızca belirsizlikte tek ucuz LLM tie-breaker.
// ASLA fırlatmaz — hata → güvenli default 'life_quick' (her zaman cevap üretir).
// ─────────────────────────────────────────────────────────────────────────────

export type QuestionRoute = 'life_quick' | 'business_deliberate'

export interface ClassifyResult {
  route: QuestionRoute
  reason: string
  confidence: number
}

// memory.ts'deki TelegramTurn ile yapısal uyumlu (en az alanlar) — getRecentConversation
// çıktısı doğrudan geçilebilsin. Şu an yönlendirme kararında kullanılmıyor; takip
// sorularında bağlam için ileride kullanılacak.
export interface ConversationTurn {
  role: 'user' | 'assistant'
  message: string
}

// İş/ajans sinyalleri (gerçek AgencyOS verisi gerektirir).
const BUSINESS_KEYWORDS = [
  'musteri', 'lead', 'pipeline', 'kimi arayayim', 'arama listesi', 'hangi lead',
  'teklif', 'satis', 'ciro', 'gelir hedef', 'donusum', 'funnel', 'agencyos',
  'retainer', 'sektor', 'firsat', 'outreach', 'cold email', 'pazarlik',
]

// Hayat/kişisel rutin sinyalleri.
const LIFE_KEYWORDS = [
  'ne yiyeyim', 'ne yesem', 'ogun', 'rutin', 'vitamin', 'su ic', 'uyku', 'spor',
  'antrenman', 'kitap', 'sayfa', 'ders', 'sinav', 'enerji', 'akademi',
  'ingilizce', 'saglik', 'motivasyon', 'yorgun',
]

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim()
}

function countHits(haystack: string, needles: string[]): number {
  return needles.reduce((n, kw) => (haystack.includes(kw) ? n + 1 : n), 0)
}

/**
 * Belirsiz mesajlarda tek ucuz LLM çağrısı ile yön kararı verir.
 * Hata/anlaşılmaz çıktı → null (çağıran default'a düşer).
 */
async function llmTieBreaker(text: string): Promise<QuestionRoute | null> {
  const system =
    'Bir mesajın işle mi (müşteri, lead, satış, pipeline, ajans) yoksa kişisel hayatla mı ' +
    '(öğün, rutin, sağlık, ders, motivasyon) ilgili olduğunu sınıflandırırsın. ' +
    'SADECE tek kelime yanıtla: BUSINESS veya LIFE.'
  try {
    const raw = await callLight(system, text, 24)
    const upper = (raw ?? '').toUpperCase()
    if (upper.includes('BUSINESS')) return 'business_deliberate'
    if (upper.includes('LIFE')) return 'life_quick'
    return null
  } catch {
    return null
  }
}

export async function classifyQuestion(
  text: string,
  _history?: ConversationTurn[],
): Promise<ClassifyResult> {
  const norm = normalizeText(text)
  const businessHits = countHits(norm, BUSINESS_KEYWORDS)
  const lifeHits = countHits(norm, LIFE_KEYWORDS)

  // Net iş sinyali, hayat sinyali yok → kurul.
  if (businessHits > 0 && lifeHits === 0) {
    return { route: 'business_deliberate', reason: `keyword:business(${businessHits})`, confidence: 0.9 }
  }
  // Net hayat sinyali, iş sinyali yok → hızlı mentor.
  if (lifeHits > 0 && businessHits === 0) {
    return { route: 'life_quick', reason: `keyword:life(${lifeHits})`, confidence: 0.9 }
  }

  // Belirsiz (ikisi de 0, ya da ikisi de >0) → LLM tie-breaker.
  const tie = await llmTieBreaker(text)
  if (tie) {
    return { route: tie, reason: 'llm_tiebreaker', confidence: 0.6 }
  }

  // LLM da karar veremedi → güvenli, her zaman cevap veren yol.
  return { route: 'life_quick', reason: 'default', confidence: 0.3 }
}
