import { describe, it, expect } from 'vitest'
import { computeOutreachMetrics, countsFromEmailLedger } from './metrics'

const counts = (over: Partial<Parameters<typeof computeOutreachMetrics>[0]> = {}) => ({
  draft: 0, approved: 0, sent: 0, replied: 0, positiveReplied: 0, failed: 0, ...over,
})

describe('computeOutreachMetrics', () => {
  it('hiç gönderim yoksa oranlar 0 ve benchmark insufficient', () => {
    const m = computeOutreachMetrics(counts({ draft: 5 }))
    expect(m.totalSent).toBe(0)
    expect(m.positiveReplyRate).toBe(0)
    expect(m.bounceRate).toBe(0)
    expect(m.benchmark).toBe('insufficient')
  })

  it('totalSent gerçek outbound sayısıdır; reply ayrıca oranlanır', () => {
    const m = computeOutreachMetrics(counts({ sent: 100, replied: 12, positiveReplied: 10 }))
    expect(m.totalSent).toBe(100)
    expect(m.replyCount).toBe(12)
    expect(m.replyRate).toBeCloseTo(0.12)
    expect(m.positiveReplyRate).toBeCloseTo(0.1)
  })

  it('benchmark eşikleri: <%2.5 below, %2.5-6 ok, >%6 good', () => {
    expect(computeOutreachMetrics(counts({ sent: 100, replied: 1, positiveReplied: 1 })).benchmark).toBe('below')
    expect(computeOutreachMetrics(counts({ sent: 100, replied: 4, positiveReplied: 4 })).benchmark).toBe('ok')
    expect(computeOutreachMetrics(counts({ sent: 100, replied: 10, positiveReplied: 10 })).benchmark).toBe('good')
    expect(computeOutreachMetrics(counts({ sent: 19, replied: 10, positiveReplied: 10 })).benchmark).toBe('insufficient')
  })

  it('bounceRate = failed / (totalSent + failed)', () => {
    const m = computeOutreachMetrics(counts({ sent: 90, failed: 10 }))
    expect(m.bounceRate).toBeCloseTo(0.1)
  })

  it('ledger: dry-run/auto-reply/opt-out sayılmaz; çoklu yanıt outreach bazında dedupe', () => {
    const c = countsFromEmailLedger([
      { direction: 'outbound', outreach_message_id: 'o1', gmail_message_id: 'provider-1', body: null },
      { direction: 'outbound', outreach_message_id: 'o2', gmail_message_id: 'dryrun-o2', body: null },
      { direction: 'outbound', outreach_message_id: 'o5', gmail_message_id: null, body: null },
      { direction: 'inbound', outreach_message_id: 'o1', gmail_message_id: 'in-1', body: 'Fiyat ve detay alabilir miyim?' },
      { direction: 'inbound', outreach_message_id: 'o1', gmail_message_id: 'in-2', body: 'Bir de görüşelim.' },
      { direction: 'inbound', outreach_message_id: 'o2', gmail_message_id: 'in-dry', body: 'Teklif alabilir miyim?' },
      { direction: 'inbound', outreach_message_id: 'o3', gmail_message_id: 'in-3', body: 'Out of office' },
      { direction: 'inbound', outreach_message_id: 'o4', gmail_message_id: 'in-4', body: 'ret' },
    ], { failedOutreachIds: ['f1', 'f1', 'f2'] })
    expect(c).toMatchObject({ sent: 1, replied: 1, positiveReplied: 1, failed: 2 })
  })
})
