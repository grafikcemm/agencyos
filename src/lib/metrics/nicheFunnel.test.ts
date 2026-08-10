import { describe, expect, it } from 'vitest'
import { computeNicheFunnel } from './nicheFunnel'

const input = (over: Partial<Parameters<typeof computeNicheFunnel>[0]> = {}) => ({
  experimentDays: 30,
  delivered: 0,
  positiveReplies: 0,
  meetings: 0,
  paidEntries: 0,
  qualifiedLeads: 0,
  totalCostUsd: 0,
  verifiedWithin14d: 0,
  totalLeads: 0,
  proposals: 0,
  coreProjects: 0,
  retainers: 0,
  ...over,
})

describe('computeNicheFunnel', () => {
  it('payda yoksa 0 uydurmaz ve karar üretmez', () => {
    const result = computeNicheFunnel(input())
    expect(result.positiveReplyRate.value).toBeNull()
    expect(result.positiveReplyRate.decision).toBe('insufficient_data')
    expect(result.costPerQualifiedLeadUsd.value).toBeNull()
  })

  it('olumlu cevap ve toplantıyı delivered paydasına bağlar', () => {
    const result = computeNicheFunnel(input({ delivered: 100, positiveReplies: 12, meetings: 6 }))
    expect(result.positiveReplyRate).toMatchObject({ value: 12, target: 12, decision: 'met' })
    expect(result.meetingRate).toMatchObject({ value: 6, target: 6, decision: 'met' })
  })

  it('ücretli girişi hem meeting hem delivered paydasıyla ayrı taşır', () => {
    const result = computeNicheFunnel(input({ delivered: 200, meetings: 20, paidEntries: 2 }))
    expect(result.paidEntryPerMeetingRate.value).toBe(10)
    expect(result.paidEntryPerMeetingRate.decision).toBe('met')
    expect(result.paidEntryPerDeliveredRate.value).toBe(1)
    expect(result.paidEntryPerDeliveredRate.decision).toBe('informational')
  })

  it('eşik altındaki iyi görünen oranı karar sanmaz', () => {
    const result = computeNicheFunnel(input({ delivered: 10, positiveReplies: 8, meetings: 8 }))
    expect(result.positiveReplyRate.value).toBe(80)
    expect(result.positiveReplyRate.decision).toBe('insufficient_data')
  })

  it('maliyet ve teklif zincirini doğru paydalarla hesaplar', () => {
    const result = computeNicheFunnel(input({
      qualifiedLeads: 20,
      totalCostUsd: 50,
      totalLeads: 20,
      verifiedWithin14d: 15,
      proposals: 10,
      coreProjects: 5,
      retainers: 2,
    }))
    expect(result.costPerQualifiedLeadUsd).toMatchObject({ value: 2.5, decision: 'informational' })
    expect(result.evidenceFreshnessRate.value).toBe(75)
    expect(result.proposalToCoreRate.value).toBe(50)
    expect(result.coreToRetainerRate.decision).toBe('insufficient_data')
  })
})
