import { describe, it, expect } from 'vitest'
import { buildProposal } from './proposalGenerator'

describe('buildProposal — 3 kademe + çıpa', () => {
  it('her zaman 3 kademe döner (lite/core/growth)', () => {
    const r = buildProposal({ budgetBand: '20-40k' })
    expect(r.tiers.map((t) => t.id)).toEqual(['lite', 'core', 'growth'])
  })

  it('bütçe bandına göre önerilen kademe işaretlenir', () => {
    expect(buildProposal({ budgetBand: '<20k' }).recommendedTier).toBe('lite')
    expect(buildProposal({ budgetBand: '20-40k' }).recommendedTier).toBe('core')
    expect(buildProposal({ budgetBand: '40-80k' }).recommendedTier).toBe('growth')
    expect(buildProposal({ budgetBand: '80k+' }).recommendedTier).toBe('growth')
  })

  it('bütçe bandı yoksa core önerilir', () => {
    expect(buildProposal({}).recommendedTier).toBe('core')
  })

  it('tam bir kademe önerilen olarak işaretli', () => {
    const r = buildProposal({ budgetBand: '20-40k' })
    expect(r.tiers.filter((t) => t.recommended)).toHaveLength(1)
    expect(r.tiers.find((t) => t.recommended)!.id).toBe('core')
  })
})

describe('buildProposal — peşinat kuralları', () => {
  it('taban %50', () => {
    expect(buildProposal({ budgetBand: '20-40k' }).upfrontRate).toBe(0.5)
  })

  it('yüksek bant → %60', () => {
    expect(buildProposal({ budgetBand: '40-80k' }).upfrontRate).toBe(0.6)
    expect(buildProposal({ budgetBand: '80k+' }).upfrontRate).toBe(0.6)
  })

  it('yüksek risk (≥12) → %70 (bant kuralını ezer)', () => {
    expect(buildProposal({ budgetBand: '40-80k', riskScore: 15 }).upfrontRate).toBe(0.7)
    expect(buildProposal({ budgetBand: '20-40k', riskScore: 12 }).upfrontRate).toBe(0.7)
  })
})
