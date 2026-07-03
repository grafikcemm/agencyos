// Hafıza governance — SAF çekirdek (§12). quarantine promosyonu + confidence + retention
// + occurrence merge. Tek kötü turun uzun-süreli hafızayı zehirlemesini engeller
// (promosyon yalnız tekrar-eşiği VEYA operatör onayıyla). DB yüzeyi memory/repo (ayrı).

export type MemoryStatus = 'quarantine' | 'active' | 'archived' | 'rejected'

export const DEFAULT_PROMOTION_THRESHOLD = 3
export const DEFAULT_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export interface PromotionInput {
  status: MemoryStatus
  occurrences: number
  operatorApproved?: boolean
  threshold?: number
}

export interface PromotionDecision {
  status: MemoryStatus
  reason: string
}

// quarantine → active yalnız: operatör onayı VEYA occurrences ≥ eşik. rejected/archived
// terminal (değişmez). active zaten terfi etmiş.
export function promotionDecision(input: PromotionInput): PromotionDecision {
  const threshold = input.threshold ?? DEFAULT_PROMOTION_THRESHOLD
  if (input.status === 'rejected') return { status: 'rejected', reason: 'reddedilmiş (terminal)' }
  if (input.status === 'archived') return { status: 'archived', reason: 'arşivlenmiş' }
  if (input.status === 'active') return { status: 'active', reason: 'zaten aktif' }
  if (input.operatorApproved) return { status: 'active', reason: 'operatör onayı' }
  if (input.occurrences >= threshold) return { status: 'active', reason: `tekrar eşiği (${threshold})` }
  return { status: 'quarantine', reason: `karantinada (${input.occurrences}/${threshold})` }
}

// Confidence occurrences ile asimptotik 1'e yaklaşır: base + (1-base)*(1 - 1/(1+n)).
// n=0 → base; n→∞ → 1. [0,1] clamp.
export function confidenceFromOccurrences(occurrences: number, base = 0.5): number {
  const n = Math.max(0, occurrences)
  const raw = base + (1 - base) * (1 - 1 / (1 + n))
  return Math.min(1, Math.max(0, Number(raw.toFixed(3))))
}

export function retentionUntilMs(nowMs: number, days = DEFAULT_RETENTION_DAYS): number {
  return nowMs + days * DAY_MS
}

export function isRetentionExpired(retentionUntilMs: number | null, nowMs: number): boolean {
  if (retentionUntilMs === null) return false
  return nowMs >= retentionUntilMs
}

export interface MergeInput {
  occurrences: number
  base?: number
}

// Aynı memory tekrar gözlendiğinde: occurrences++ + confidence yeniden hesaplanır.
export function mergeOccurrence(input: MergeInput): { occurrences: number; confidence: number } {
  const occurrences = input.occurrences + 1
  return { occurrences, confidence: confidenceFromOccurrences(occurrences, input.base ?? 0.5) }
}

// Retrieval sırasında güven-ağırlıklı skor: benzerlik × confidence.
export function confidenceWeightedScore(similarity: number, confidence: number): number {
  return similarity * confidence
}
