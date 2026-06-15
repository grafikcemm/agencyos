import { describe, it, expect } from 'vitest'
import { computeOutreachMetrics } from './metrics'

describe('computeOutreachMetrics', () => {
  it('hiç gönderim yoksa tüm oranlar 0 ve benchmark below', () => {
    const m = computeOutreachMetrics({ draft: 5, approved: 0, sent: 0, replied: 0, failed: 0 })
    expect(m.totalSent).toBe(0)
    expect(m.positiveReplyRate).toBe(0)
    expect(m.bounceRate).toBe(0)
    expect(m.benchmark).toBe('below')
  })

  it('totalSent = sent + replied', () => {
    const m = computeOutreachMetrics({ draft: 0, approved: 0, sent: 90, replied: 10, failed: 0 })
    expect(m.totalSent).toBe(100)
    expect(m.replyCount).toBe(10)
    expect(m.positiveReplyRate).toBeCloseTo(0.1)
  })

  it('benchmark eşikleri: <%2.5 below, %2.5-6 ok, >%6 good', () => {
    expect(computeOutreachMetrics({ draft: 0, approved: 0, sent: 99, replied: 1, failed: 0 }).benchmark).toBe('below')
    expect(computeOutreachMetrics({ draft: 0, approved: 0, sent: 96, replied: 4, failed: 0 }).benchmark).toBe('ok')
    expect(computeOutreachMetrics({ draft: 0, approved: 0, sent: 90, replied: 10, failed: 0 }).benchmark).toBe('good')
  })

  it('bounceRate = failed / (totalSent + failed)', () => {
    const m = computeOutreachMetrics({ draft: 0, approved: 0, sent: 90, replied: 0, failed: 10 })
    expect(m.bounceRate).toBeCloseTo(0.1)
  })
})
