import { describe, it, expect } from 'vitest'
import {
  promotionDecision,
  confidenceFromOccurrences,
  retentionUntilMs,
  isRetentionExpired,
  mergeOccurrence,
  confidenceWeightedScore,
  DEFAULT_PROMOTION_THRESHOLD,
  DEFAULT_RETENTION_DAYS,
} from './governance'

describe('memory governance — quarantine promosyonu (§12)', () => {
  it('quarantine: eşik altı kalır, eşik/onay ile aktif', () => {
    expect(promotionDecision({ status: 'quarantine', occurrences: 1 }).status).toBe('quarantine')
    expect(promotionDecision({ status: 'quarantine', occurrences: DEFAULT_PROMOTION_THRESHOLD }).status).toBe('active')
    expect(promotionDecision({ status: 'quarantine', occurrences: 1, operatorApproved: true }).status).toBe('active')
  })
  it('terminal durumlar değişmez', () => {
    expect(promotionDecision({ status: 'rejected', occurrences: 99 }).status).toBe('rejected')
    expect(promotionDecision({ status: 'archived', occurrences: 99 }).status).toBe('archived')
    expect(promotionDecision({ status: 'active', occurrences: 0 }).status).toBe('active')
  })

  it('confidence occurrences ile artar, [0,1] içinde', () => {
    const c0 = confidenceFromOccurrences(0)
    const c1 = confidenceFromOccurrences(1)
    const c10 = confidenceFromOccurrences(10)
    expect(c0).toBeCloseTo(0.5)
    expect(c1).toBeGreaterThan(c0)
    expect(c10).toBeGreaterThan(c1)
    expect(c10).toBeLessThanOrEqual(1)
  })

  it('retention + expiry', () => {
    expect(retentionUntilMs(0)).toBe(DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    expect(isRetentionExpired(null, 999)).toBe(false)
    expect(isRetentionExpired(1000, 1000)).toBe(true)
    expect(isRetentionExpired(1000, 500)).toBe(false)
  })

  it('mergeOccurrence: occurrences++ + confidence yeniden', () => {
    const m = mergeOccurrence({ occurrences: 2 })
    expect(m.occurrences).toBe(3)
    expect(m.confidence).toBeCloseTo(confidenceFromOccurrences(3))
  })

  it('confidenceWeightedScore = benzerlik × güven', () => {
    expect(confidenceWeightedScore(0.8, 0.5)).toBeCloseTo(0.4)
  })
})
