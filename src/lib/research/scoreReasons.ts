// Araştırma skor kırılımını UI'ın okuyabildiği biçime ÇEVİRİR.
//
// NEDEN AYRI BİR ALAN
// Operasyonel `leads.score_reasons` tipi `{reason, points}[]` (bkz.
// src/lib/leadScoringV3.ts:52). Araştırma JSON'u ise anahtar→sayı nesnesi
// taşıyor (`{service_fit: 25, recent_buying_signal: 20, …}`). İkisini aynı
// sütuna yazmak tip sözleşmesini kırar ve operasyonel skor motorunun ürettiği
// gerekçeleri araştırma verisiyle ezerdi.
//
// Bu yüzden ham kırılım `research_score_breakdown` (jsonb) içinde AYNEN saklanır,
// gösterim için buradaki fonksiyonla türetilir. Türetme tek yönlüdür: UI'a giden
// biçim veritabanına geri yazılmaz.

/** Araştırma metodolojisindeki `lead_score_weights` anahtarları ve ağırlıkları. */
export const RESEARCH_SCORE_WEIGHTS = {
  service_fit: 25,
  recent_buying_signal: 20,
  budget_capacity: 15,
  creative_frequency: 15,
  ai_or_digital_maturity: 10,
  decision_maker_access: 10,
  case_study_fit: 5,
} as const

export type ResearchScoreKey = keyof typeof RESEARCH_SCORE_WEIGHTS

const LABELS: Record<ResearchScoreKey, string> = {
  service_fit: 'Hizmet uyumu',
  recent_buying_signal: 'Yakın satın alma sinyali',
  budget_capacity: 'Bütçe kapasitesi',
  creative_frequency: 'Kreatif üretim sıklığı',
  ai_or_digital_maturity: 'AI/dijital olgunluk',
  decision_maker_access: 'Karar vericiye erişim',
  case_study_fit: 'Vaka uyumu',
}

/** Operasyonel motorun kullandığı gösterim tipiyle aynı şekil. */
export interface ScoreReason {
  readonly reason: string
  readonly points: number
  /** Bu kalemin alabileceği en yüksek puan — "18/25" gösterimi için. */
  readonly max: number
}

export type ResearchBreakdown = Partial<Record<ResearchScoreKey, number>>

/**
 * Ham kırılımı gösterim biçimine çevirir. Ağırlık sırasına göre (en yüksek
 * ağırlık önce) sıralar — kullanıcı önce en belirleyici kalemi görür.
 *
 * Bilinmeyen anahtarlar SESSİZCE ATILMAZ: `unknownKeys` içinde raporlanır ki
 * araştırma metodolojisi değiştiğinde fark edilsin.
 */
export function toScoreReasons(breakdown: ResearchBreakdown | null | undefined): {
  reasons: ScoreReason[]
  total: number
  unknownKeys: string[]
} {
  if (!breakdown || typeof breakdown !== 'object') {
    return { reasons: [], total: 0, unknownKeys: [] }
  }

  const known = Object.keys(RESEARCH_SCORE_WEIGHTS) as ResearchScoreKey[]
  const unknownKeys = Object.keys(breakdown).filter((k) => !known.includes(k as ResearchScoreKey))

  const reasons = known
    .filter((key) => typeof breakdown[key] === 'number')
    .map((key) => ({
      reason: LABELS[key],
      points: breakdown[key] as number,
      max: RESEARCH_SCORE_WEIGHTS[key],
    }))
    .sort((a, b) => b.max - a.max || b.points - a.points)

  const total = reasons.reduce((sum, r) => sum + r.points, 0)

  return { reasons, total, unknownKeys }
}

/**
 * Kırılım toplamının bildirilen skorla tutarlı olduğunu doğrular.
 * Tutarsızsa skor GÖSTERİLMEZ — kaynaksız/açıklanamayan puan üretmeme kuralı.
 */
export function breakdownMatchesScore(
  breakdown: ResearchBreakdown | null | undefined,
  score: number | null | undefined,
): boolean {
  if (score == null) return false
  const { reasons, total } = toScoreReasons(breakdown)
  if (reasons.length === 0) return false
  return total === score
}

/** Araştırmanın lead eşikleri (metodoloji: `lead_thresholds`). */
export type LeadBand = 'immediate' | 'second_priority' | 'nurture' | 'exclude'

export function scoreBand(score: number | null | undefined): LeadBand | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 80) return 'immediate'
  if (score >= 65) return 'second_priority'
  if (score >= 50) return 'nurture'
  return 'exclude'
}

export const LEAD_BAND_LABELS: Record<LeadBand, string> = {
  immediate: 'Hemen temas',
  second_priority: 'İkinci öncelik',
  nurture: 'Besle',
  exclude: 'Dışarıda',
}
