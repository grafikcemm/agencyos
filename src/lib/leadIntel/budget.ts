// Lead Intelligence günlük AI bütçe tavanı — $0.40/gün (İstanbul günü).
// ai_cost_logs üzerinde operation LIKE 'lead_intel_%' toplamı. Tavan aşımında
// konsey LLM çağrısı YAPMAZ, deterministik moda düşer (asla throw etmez).
// Aylık $20 hard-cap ayrıca callOpenRouter içinde (dış ray) durur.

import { getSpendSince } from '../openrouter'

export const LEAD_INTEL_DAILY_CAP_USD = 0.4
export const LEAD_INTEL_OPERATION_PREFIX = 'lead_intel_'

// İstanbul (UTC+3, sabit — TR'de DST yok) gün anahtarı: 'YYYY-MM-DD'.
// daily-scan'deki idempotency deyimiyle aynı format.
export function istanbulDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now)
}

// İstanbul gününün başlangıcı, UTC ISO olarak (00:00+03:00 → 21:00Z önceki gün).
export function istanbulDayStartIso(now: Date = new Date()): string {
  const dateKey = istanbulDateKey(now)
  return new Date(`${dateKey}T00:00:00+03:00`).toISOString()
}

export async function getLeadIntelDailySpend(now: Date = new Date()): Promise<number> {
  return getSpendSince(istanbulDayStartIso(now), LEAD_INTEL_OPERATION_PREFIX)
}

export async function isUnderDailyCap(
  now: Date = new Date()
): Promise<{ under: boolean; spentUsd: number; capUsd: number }> {
  const spentUsd = await getLeadIntelDailySpend(now)
  return { under: spentUsd < LEAD_INTEL_DAILY_CAP_USD, spentUsd, capUsd: LEAD_INTEL_DAILY_CAP_USD }
}
