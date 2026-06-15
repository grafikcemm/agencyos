// 3-kademeli teklif jeneratörü — fiyat çıpalama (anchoring) + decoy effect.
// TR araştırma: tek fiyat yerine 3 kademe sun; Core hedef pakettir, Growth çıpa.
// Gelir hedefi 120k/ay → 3-4 retainer × 30-40k. Saf fonksiyon (test edilebilir).

import type { BudgetBand } from './leads/pipelineGate'

export type TierId = 'lite' | 'core' | 'growth'

export interface ProposalTier {
  id: TierId
  name: string
  monthlyMin: number
  monthlyMax: number
  /** Pakette yer alan teslimler. */
  includes: string[]
  /** Bu kademe operatöre nasıl konumlandırılır. */
  positioning: string
  /** UI'da öne çıkan (önerilen) kademe mi? */
  recommended: boolean
}

// Araştırma bantları: Lite yumuşak taban, Core ana satış, Growth çıpa.
const TIER_BASE: Record<TierId, Omit<ProposalTier, 'recommended'>> = {
  lite: {
    id: 'lite',
    name: 'Lite Retainer',
    monthlyMin: 18000,
    monthlyMax: 22000,
    includes: ['1 platform', 'Aylık sınırlı kreatif üretim', 'Hafif raporlama'],
    positioning: 'Giriş/upsell kapısı — gelir hedefine tek başına hizmet etmez.',
  },
  core: {
    id: 'core',
    name: 'Core Retainer',
    monthlyMin: 30000,
    monthlyMax: 36000,
    includes: [
      '2 platform',
      'Düzenli statik + motion/AI asset',
      'Aylık planlama',
      'Kampanya kreatifleri',
      'Öncelikli destek',
    ],
    positioning: 'Ana satış paketi — 120k hedefe 3-4 müşteri ile ulaşır.',
  },
  growth: {
    id: 'growth',
    name: 'Growth Retainer',
    monthlyMin: 42000,
    monthlyMax: 55000,
    includes: [
      '2-3 platform',
      'Yüksek kreatif varyasyon',
      'Reklam kreatif desteği',
      'Landing/PDP dokunuşları',
      'Hızlı turnaround',
    ],
    positioning: 'E-ticaret/büyüme dönemi — Core’u makul gösteren çıpa.',
  },
}

// Bütçe bandına göre hangi kademenin "önerilen" işaretleneceği.
const RECOMMENDED_BY_BAND: Record<BudgetBand, TierId> = {
  '<20k': 'lite',
  '20-40k': 'core',
  '40-80k': 'growth',
  '80k+': 'growth',
}

export interface ProposalResult {
  tiers: ProposalTier[]
  recommendedTier: TierId
  /** İlk iş peşinat oranı (0-1). */
  upfrontRate: number
  upfrontNote: string
}

/**
 * Lead'in bütçe bandı + risk skoruna göre 3 kademeli teklif üretir.
 * Peşinat kuralı (araştırma): ilk iş %50; ≥40k bant %60; risk yüksekse %70.
 */
export function buildProposal(input: {
  budgetBand?: string | null
  riskScore?: number | null
}): ProposalResult {
  const band = (input.budgetBand ?? '20-40k') as BudgetBand
  const recommendedTier = RECOMMENDED_BY_BAND[band] ?? 'core'

  const tiers: ProposalTier[] = (['lite', 'core', 'growth'] as TierId[]).map((id) => ({
    ...TIER_BASE[id],
    recommended: id === recommendedTier,
  }))

  // Peşinat: taban %50. Yüksek bant (40-80k / 80k+) → %60. Risk ≥12 → %70.
  let upfrontRate = 0.5
  let upfrontNote = 'İlk iş için standart %50 peşinat.'
  if (band === '40-80k' || band === '80k+') {
    upfrontRate = 0.6
    upfrontNote = 'Yüksek bütçe bandı — ilk iş %60 peşinat.'
  }
  if ((input.riskScore ?? 0) >= 12) {
    upfrontRate = 0.7
    upfrontNote = 'Yüksek risk skoru — ilk iş %70 peşinat önerilir.'
  }

  return { tiers, recommendedTier, upfrontRate, upfrontNote }
}
