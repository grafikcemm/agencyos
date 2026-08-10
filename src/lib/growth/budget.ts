// ─────────────────────────────────────────────────────────────────────────────
// APIFY BÜTÇE KAPISI — aşım YOK.
//
// SABİT $29 LİMİT KALDIRILDI (2026-08-10). Tavan artık politika + ortamdan
// gelir: elde $25 kredi, aylık operasyon hedefi $18, SERT KESME $22, dokunulmaz
// rezerv $3. Kanonik değerler: src/lib/growth/apifyPolicy.ts
//
// Apify tavan aşıldığında koşuyu REDDETMEZ; fazlasını faturalar. Yani üst
// sınırı uygulamak BİZİM işimizdir.
//
// ÜÇ KURAL:
//
//   1. KONTROL START'TAN ÖNCE. `estimate` → kapı → `start`. Koşu başladıktan
//      sonra yapılan kontrol, harcanmış parayı geri getirmez.
//
//   2. ÖLÇÜLEMEYEN HARCAMA SIFIR DEĞİLDİR. Aylık harcama okunamıyorsa (tablo
//      yok, DB düştü) kapı AÇILMAZ. Migration 066 uygulanmadığı sürece bu yol
//      zaten kapalıdır — ve kapalı kalması DOĞRUDUR.
//
//   3. KISMİ KOŞU YOK. Kalan bütçe tahmini karşılamıyorsa koşu KÜÇÜLTÜLMEZ,
//      tamamen reddedilir. "Yarım lead partisi" hem deneyi bozar hem de
//      kullanıcının beklediğinden farklı bir şey teslim eder.
//
// `MAX_LEADS_PER_RUN` ayrı bir emniyet: bütçe yeterli olsa bile tek koşuda
// 100'den fazla lead çekilmez. Sebep maliyet değil KALİTE — 500 kişilik bir
// parti gözden geçirilemez, ve gözden geçirilmeyen liste otomatik gönderime
// girerse pilotun tüm güvenceleri anlamsızlaşır.
// ─────────────────────────────────────────────────────────────────────────────

import type { CostEstimate, SourceProviderKey } from './sources/types'
import { APIFY_MONTHLY_HARD_STOP_USD } from './apifyPolicy'

/**
 * Aylık sert kesme (USD). `APIFY_MONTHLY_BUDGET_USD` adı geriye dönük uyum için
 * korunur; DEĞERİ artık politika modülünden gelir ve ortamla daraltılabilir
 * (genişletilemez — env yalnız daha DÜŞÜK bir tavan koyabilir).
 */
export const APIFY_MONTHLY_BUDGET_USD = APIFY_MONTHLY_HARD_STOP_USD

/** Ortam daha düşük bir tavan dayatabilir; yükseltemez. */
export function monthlyCapUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.APIFY_MONTHLY_CAP_USD ?? '')
  if (!Number.isFinite(raw) || raw <= 0) return APIFY_MONTHLY_HARD_STOP_USD
  return Math.min(raw, APIFY_MONTHLY_HARD_STOP_USD)
}
/** Tek koşuda azami lead. */
export const MAX_LEADS_PER_RUN = 100

export class BudgetExceededError extends Error {
  readonly code = 'budget_exceeded' as const
  constructor(
    readonly detail: {
      provider: SourceProviderKey
      spentUsd: number | null
      estimateUsd: number | null
      capUsd: number
      reason: 'unmeasurable' | 'no_estimate' | 'would_exceed'
    },
    message: string,
  ) {
    super(message)
    this.name = 'BudgetExceededError'
  }
}

/** Aylık harcama özeti — kokpit bunu ham gösterir. */
export interface SpendSummary {
  /** Bu ay bu sağlayıcıya harcanan GERÇEK tutar. Okunamadıysa `null`. */
  spentUsd: number | null
  /**
   * "Yanan kredi": başarısız/iptal koşuların gerçek maliyeti. Ayrı tutulur
   * çünkü lead getirmeden harcanan paradır — kokpitte ayrı satır olmalı,
   * yoksa maliyet/lead oranı olduğundan iyi görünür.
   */
  burnedUsd: number
  /** Bu ay başlatılan koşu sayısı. */
  runCount: number
  /** İstanbul takvimine göre 'YYYY-MM' — hangi ayın penceresi. */
  monthKey: string
}

/** Aylık harcamayı okuyan fonksiyon. DB'ye bağımlılık ENJEKTE edilir. */
export type SpendReader = (provider: SourceProviderKey, monthKey: string) => Promise<SpendSummary>

/** İstanbul takvimine göre ay anahtarı ('YYYY-MM'). */
export function istanbulMonthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  })
    .format(now)
    .slice(0, 7)
}

export interface BudgetDecision {
  allowed: true
  spentUsd: number
  estimateUsd: number
  remainingAfterUsd: number
  capUsd: number
}

/**
 * Koşu başlatılabilir mi.
 *
 * Reddin üç ayrı sebebi var ve hepsi farklı bir arızayı anlatır:
 *   · `unmeasurable` — harcama okunamadı (tablo yok / DB düştü)
 *   · `no_estimate`  — sağlayıcı fiyat veremedi
 *   · `would_exceed` — tahmin kalan bütçeyi aşıyor
 * Tek bir "bütçe hatası" mesajı olsaydı, kullanıcı hangi düğmeye basacağını
 * bilemezdi.
 */
export async function assertWithinBudget(
  estimate: CostEstimate,
  readSpend: SpendReader,
  now: Date = new Date(),
): Promise<BudgetDecision> {
  const monthKey = istanbulMonthKey(now)
  const summary = await readSpend(estimate.provider, monthKey)

  if (summary.spentUsd === null || !Number.isFinite(summary.spentUsd)) {
    throw new BudgetExceededError(
      { provider: estimate.provider, spentUsd: null, estimateUsd: estimate.estimatedCostUsd, capUsd: APIFY_MONTHLY_BUDGET_USD, reason: 'unmeasurable' },
      'Aylık harcama okunamadı — koşu başlatılmadı. Ölçülemeyen harcama sıfır sayılmaz.',
    )
  }
  if (estimate.estimatedCostUsd === null || !Number.isFinite(estimate.estimatedCostUsd)) {
    throw new BudgetExceededError(
      { provider: estimate.provider, spentUsd: summary.spentUsd, estimateUsd: null, capUsd: APIFY_MONTHLY_BUDGET_USD, reason: 'no_estimate' },
      'Sağlayıcı maliyet tahmini vermedi — koşu başlatılmadı.',
    )
  }

  const projected = summary.spentUsd + estimate.estimatedCostUsd
  if (projected > APIFY_MONTHLY_BUDGET_USD) {
    throw new BudgetExceededError(
      { provider: estimate.provider, spentUsd: summary.spentUsd, estimateUsd: estimate.estimatedCostUsd, capUsd: APIFY_MONTHLY_BUDGET_USD, reason: 'would_exceed' },
      `Aylık tavan aşılırdı (${projected.toFixed(2)} > ${APIFY_MONTHLY_BUDGET_USD}) — koşu başlatılmadı, küçültülmedi.`,
    )
  }

  return {
    allowed: true,
    spentUsd: summary.spentUsd,
    estimateUsd: estimate.estimatedCostUsd,
    remainingAfterUsd: Number((APIFY_MONTHLY_BUDGET_USD - projected).toFixed(4)),
    capUsd: APIFY_MONTHLY_BUDGET_USD,
  }
}

/**
 * İstenen lead sayısını güvenli aralığa çeker.
 *
 * Sessizce kırpar ama kırptığını SÖYLER (`clamped`) — kullanıcı 500 isteyip
 * 100 aldığında bunu kokpitte görmeli, yoksa sağlayıcıyı "eksik veri veriyor"
 * sanır.
 */
export function clampLimit(requested: unknown): { limit: number; clamped: boolean } {
  const n = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : 0
  if (n < 1) return { limit: 1, clamped: true }
  if (n > MAX_LEADS_PER_RUN) return { limit: MAX_LEADS_PER_RUN, clamped: true }
  return { limit: n, clamped: false }
}

/** Kokpit satırı — değer değil DURUM + rakam. */
export function describeBudget(summary: SpendSummary) {
  const spent = summary.spentUsd
  return {
    provider: 'apify' as const,
    monthKey: summary.monthKey,
    capUsd: APIFY_MONTHLY_BUDGET_USD,
    spentUsd: spent,
    burnedUsd: summary.burnedUsd,
    runCount: summary.runCount,
    remainingUsd: spent === null ? null : Number((APIFY_MONTHLY_BUDGET_USD - spent).toFixed(4)),
    // Okunamayan harcama "sağlıklı" DEĞİLDİR.
    state: spent === null ? ('unmeasurable' as const) : spent >= APIFY_MONTHLY_BUDGET_USD ? ('exhausted' as const) : ('ok' as const),
  }
}
