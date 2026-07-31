// ─────────────────────────────────────────────────────────────────────────────
// DENEY KOKPİTİ — saf toplama. DB erişimi YOK; veri enjekte edilir.
//
// KPI SIRASI KASITLI: teslim → cevap → olumlu cevap → görüşme. Açılma ve
// tıklama listenin SONUNDA ve "ana KPI değil" etiketiyle duruyor. Sebep ölçüm:
// açılma oranı, gizlilik korumaları (Apple MPP ve benzeri ön-yükleme) yüzünden
// artık insan davranışını ölçmüyor; ona göre optimize etmek, ölçtüğünü sandığın
// ama ölçmediğin bir şeye göre optimize etmektir.
//
// KAZANAN İLAN ETME EŞİĞİ: en az 50 teslim. Altında "önde görünen" varyant
// gürültüdür; 8/10 ile 5/10 arasındaki fark tesadüften ayırt edilemez. Eşik
// altındayken kokpit KAZANAN GÖSTERMEZ — "yetersiz örneklem" der.
// ─────────────────────────────────────────────────────────────────────────────

import { describeBudget } from './budget'
import type { SpendSummary } from './budget'
import { describeGrowthFlags } from './flags'
import type { GrowthEnv } from './flags'
import type { OutreachHealth } from './outreach/types'
import type { ProviderHealth } from './sources/types'

/** Kazanan ilan etmek için gereken asgari teslim. */
export const MIN_DELIVERED_FOR_WINNER = 50

export interface FunnelCounts {
  sourced: number
  accepted: number
  eligible: number
  enqueued: number
  sent: number
  delivered: number
  replied: number
  positiveReplied: number
  meetings: number
  bounced: number
  optedOut: number
  complaints: number
  /** Ana KPI DEĞİL — yalnız bilgi. */
  opened?: number | null
  clicked?: number | null
  /** Sonucu bilinmeyen gönderimler — sıfır sayılmaz, ayrı gösterilir. */
  unknown: number
}

export interface VariantStats {
  key: string
  changedVariable: string | null
  counts: FunnelCounts
}

export interface ExperimentSnapshot {
  key: string
  status: 'draft' | 'running' | 'paused' | 'concluded'
  niche: string | null
  offer: string | null
  hypothesis: string | null
  variants: VariantStats[]
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Number(((num / den) * 100).toFixed(2)) : null

/** Oranlar — payda sıfırsa `null`. Sıfır bölme "%0" olarak gösterilmez. */
export function funnelRates(c: FunnelCounts) {
  return {
    acceptRate: pct(c.accepted, c.sourced),
    eligibleRate: pct(c.eligible, c.accepted),
    deliveryRate: pct(c.delivered, c.sent),
    replyRate: pct(c.replied, c.delivered),
    positiveReplyRate: pct(c.positiveReplied, c.delivered),
    meetingRate: pct(c.meetings, c.delivered),
    bounceRate: pct(c.bounced, c.sent),
    complaintRate: pct(c.complaints, c.delivered),
    unknownRate: pct(c.unknown, c.sent),
  }
}

export type WinnerVerdict =
  | { decided: false; reason: 'insufficient_sample'; delivered: number; needed: number }
  | { decided: false; reason: 'tie' }
  | { decided: false; reason: 'no_variants' }
  | { decided: true; variantKey: string; positiveReplyRate: number }

/**
 * Kazanan varyant — ya da neden karar VERİLEMEDİĞİ.
 *
 * Karar OLUMLU CEVAP oranına göre verilir, açılma/tıklamaya göre değil: para
 * getiren şey cevaptır. Beraberlikte kazanan ilan edilmez; "fark yok" bir
 * sonuçtur ve öyle raporlanmalı.
 */
export function decideWinner(variants: readonly VariantStats[]): WinnerVerdict {
  if (!variants.length) return { decided: false, reason: 'no_variants' }
  const totalDelivered = variants.reduce((s, v) => s + v.counts.delivered, 0)
  if (totalDelivered < MIN_DELIVERED_FOR_WINNER) {
    return { decided: false, reason: 'insufficient_sample', delivered: totalDelivered, needed: MIN_DELIVERED_FOR_WINNER }
  }
  const scored = variants
    .map((v) => ({ key: v.key, rate: v.counts.delivered ? v.counts.positiveReplied / v.counts.delivered : 0 }))
    .sort((a, b) => b.rate - a.rate)
  if (scored.length > 1 && scored[0].rate === scored[1].rate) return { decided: false, reason: 'tie' }
  return { decided: true, variantKey: scored[0].key, positiveReplyRate: Number((scored[0].rate * 100).toFixed(2)) }
}

export interface CostInput {
  /** Kaynak partilerinin GERÇEK maliyeti (USD). */
  sourceCostUsd: number
  /** Lead getirmeden yanan kredi. */
  burnedUsd: number
}

/**
 * Maliyet metrikleri.
 *
 * Payda sıfırken `null` döner — "lead başına sonsuz" ya da "0 USD" göstermek
 * ikisi de yanlış olurdu. Yanan kredi AYRI satır: gömülseydi lead başına maliyet
 * olduğundan iyi görünürdü.
 */
export function costMetrics(counts: FunnelCounts, cost: CostInput) {
  const per = (den: number) => (den > 0 ? Number((cost.sourceCostUsd / den).toFixed(4)) : null)
  return {
    totalCostUsd: Number(cost.sourceCostUsd.toFixed(4)),
    burnedUsd: Number(cost.burnedUsd.toFixed(4)),
    costPerAcceptedLeadUsd: per(counts.accepted),
    costPerEligibleLeadUsd: per(counts.eligible),
    costPerReplyUsd: per(counts.replied),
    costPerPositiveReplyUsd: per(counts.positiveReplied),
  }
}

export interface CockpitInput {
  env?: GrowthEnv
  experiments: readonly ExperimentSnapshot[]
  spend: SpendSummary
  cost: CostInput
  sourceHealth: readonly ProviderHealth[]
  outreachHealth: readonly OutreachHealth[]
  pilotGate: { canSend: boolean; dailyCap: number | null; remainingToday: number; blockedReason: string | null }
}

/** Kokpitin tek görünüm nesnesi. Sayfa bunu render eder, hesap YAPMAZ. */
export function buildCockpit(input: CockpitInput) {
  const experiments = input.experiments.map((e) => {
    const totals = e.variants.reduce<FunnelCounts>(
      (acc, v) => ({
        sourced: acc.sourced + v.counts.sourced,
        accepted: acc.accepted + v.counts.accepted,
        eligible: acc.eligible + v.counts.eligible,
        enqueued: acc.enqueued + v.counts.enqueued,
        sent: acc.sent + v.counts.sent,
        delivered: acc.delivered + v.counts.delivered,
        replied: acc.replied + v.counts.replied,
        positiveReplied: acc.positiveReplied + v.counts.positiveReplied,
        meetings: acc.meetings + v.counts.meetings,
        bounced: acc.bounced + v.counts.bounced,
        optedOut: acc.optedOut + v.counts.optedOut,
        complaints: acc.complaints + v.counts.complaints,
        unknown: acc.unknown + v.counts.unknown,
        opened: (acc.opened ?? 0) + (v.counts.opened ?? 0),
        clicked: (acc.clicked ?? 0) + (v.counts.clicked ?? 0),
      }),
      {
        sourced: 0, accepted: 0, eligible: 0, enqueued: 0, sent: 0, delivered: 0, replied: 0,
        positiveReplied: 0, meetings: 0, bounced: 0, optedOut: 0, complaints: 0, unknown: 0,
        opened: 0, clicked: 0,
      },
    )
    return {
      key: e.key,
      status: e.status,
      niche: e.niche,
      offer: e.offer,
      hypothesis: e.hypothesis,
      totals,
      rates: funnelRates(totals),
      variants: e.variants.map((v) => ({ ...v, rates: funnelRates(v.counts) })),
      winner: decideWinner(e.variants),
      cost: costMetrics(totals, input.cost),
    }
  })

  return {
    experiments,
    budget: describeBudget(input.spend),
    flags: describeGrowthFlags(input.env ?? process.env),
    providers: {
      sources: input.sourceHealth,
      outreach: input.outreachHealth,
    },
    pilotGate: input.pilotGate,
    // Kokpitin okuyucuya söylediği şey: burada gördüğün her rakam ölçüm; oran
    // paydası yoksa `null`, kazanan eşik altındaysa "karar yok".
    notes: [
      'Açılma/tıklama ana KPI değildir — gizlilik korumaları bunları insan davranışı olmaktan çıkardı.',
      `Kazanan ilanı için asgari ${MIN_DELIVERED_FOR_WINNER} teslim gerekir.`,
      'Sonucu bilinmeyen gönderimler ayrı sayılır; sıfır sayılmaz.',
    ],
  }
}

export type Cockpit = ReturnType<typeof buildCockpit>
