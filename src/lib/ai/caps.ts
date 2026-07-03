// AI bütçe tavanı — settings üzerinden yapılandırılabilir (Faz 0 §14).
// Önceden openrouter.ts'te sabit MONTHLY_COST_CAP_USD = 20 idi; artık
// settings.ai_monthly_cap_usd satırı bunu deploy'suz ezebilir. Satır yoksa
// veya geçersizse davranış aynen korunur ($20). settings.value TEXT'tir
// (migration 001), bu yüzden string "20" da sayı 20 da kabul edilir.

import { supabaseAdmin } from '../supabase'

export const DEFAULT_MONTHLY_CAP_USD = 20

// Saf çözümleyici (DB'siz test edilebilir). value: settings.value (TEXT|number|null).
export function resolveMonthlyCapUsd(value: unknown, fallback: number = DEFAULT_MONTHLY_CAP_USD): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const n = Number(value.trim())
    if (Number.isFinite(n) && n > 0) return n
  }
  return fallback
}

let capCache: { usd: number; loadedAt: number } | null = null
const CAP_TTL_MS = 5 * 60 * 1000

export async function getMonthlyCapUsd(): Promise<number> {
  if (capCache && Date.now() - capCache.loadedAt < CAP_TTL_MS) return capCache.usd
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'ai_monthly_cap_usd')
      .maybeSingle()
    const usd = resolveMonthlyCapUsd(data?.value)
    capCache = { usd, loadedAt: Date.now() }
    return usd
  } catch {
    capCache = { usd: DEFAULT_MONTHLY_CAP_USD, loadedAt: Date.now() }
    return DEFAULT_MONTHLY_CAP_USD
  }
}

// Test/manuel sıfırlama için (cache'i temizler).
export function resetCapCache(): void {
  capCache = null
}
