// İlan görünürlük + eleme skorlaması — TEK kaynak (büyülü sayı yok).
// Saf fonksiyonlar; hem pipeline (server) hem kariyer UI (client) import eder, bu yüzden
// 'server-only' YOK. market.ts saf-fonksiyon desenini takip eder, vitest ile kapsanır.
//
// Karma eleme felsefesi:
//  • Net çöp (suspicious / çok düşük fit / bayat) → 'rejected' (DB'de kalır, UI'da gizli).
//  • Gri bölge (orta fit) → 'gray' (varsayılanda katlanır, "Göster" ile açılır).
//  • Güçlü ilan → 'show' (varsayılan listede).
// Ajans-kaynaklı ilanlar fit bonusu alır (kullanıcı küratörlü ajans sitelerine güveniyor).

import type { Legitimacy } from './types'

// Bu skor ve üstü varsayılan listede gösterilir; taslak kapısı da budur.
export const SHOW_THRESHOLD = 60
// [GRAY_FLOOR, SHOW_THRESHOLD) → gri bölge (gizle-ama-sakla). Altı → rejected.
export const GRAY_FLOOR = 40
// Küratörlü ajans kaynağına eklenen fit puanı (cap 100).
export const AGENCY_FIT_BONUS = 12
// fit_reasons'a yazılan ajans-bonusu etiketi öneki. pipeline idempotency guard'ı bununla
// "zaten boost'lu mu" tespit eder → etiket ve guard TEK kaynak (çift-boost'u önler).
export const AGENCY_BOOST_REASON_PREFIX = 'Ajans kaynağı'
// posted_at biliniyorsa ve bundan eskiyse bayat. Tarihsiz ilan asla bayat değil.
export const MAX_AGE_DAYS = 30

// Küratörlü TR ajans kaynak id'leri. job_listings.source ile eşleşir.
// LinkedIn/kariyer.net ('firecrawl') kasıtlı olarak DIŞARIDA — onlar jenerik havuz.
export const AGENCY_SOURCE_IDS: ReadonlySet<string> = new Set([
  'bigumigu',
  'dijitalajanslar',
  'ajanshayvanlari',
  'instagram_ajansisleri',
])

export type Visibility = 'show' | 'gray' | 'rejected'

const MS_PER_DAY = 86_400_000

export function isAgencySource(source: string | null | undefined): boolean {
  return source != null && AGENCY_SOURCE_IDS.has(source)
}

// Ajans kaynağına fit bonusu uygula (cap 100). Ajans değilse skor değişmez.
export function applyAgencyBonus(rawFit: number, source: string | null | undefined): number {
  if (!isAgencySource(source)) return rawFit
  return Math.min(100, rawFit + AGENCY_FIT_BONUS)
}

// posted_at varsa ve MAX_AGE_DAYS'ten eskiyse bayat. Tarihsiz/geçersiz → bayat değil.
export function isStale(postedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!postedAt) return false
  const t = Date.parse(postedAt)
  if (Number.isNaN(t)) return false
  const ageDays = (now.getTime() - t) / MS_PER_DAY
  return ageDays > MAX_AGE_DAYS
}

// İlanın görünürlük sınıfı. fit = ajans bonusu uygulanmış efektif skor.
// Hem pipeline (rejected→status) hem UI (show/gray/rejected görünüm) bunu kullanır → tutarlı.
export function classifyVisibility(
  fit: number | null | undefined,
  legitimacy: Legitimacy | null | undefined,
  postedAt: string | null | undefined,
  now: Date = new Date(),
): Visibility {
  if (legitimacy === 'suspicious') return 'rejected'
  if (isStale(postedAt, now)) return 'rejected'
  const score = fit ?? 0
  if (score < GRAY_FLOOR) return 'rejected'
  if (score < SHOW_THRESHOLD) return 'gray'
  return 'show'
}
