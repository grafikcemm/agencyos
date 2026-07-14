import { describe, it, expect } from 'vitest'
import { buildOutcomeRows, computeOutreachMetrics, countsFromEmailLedger } from './metrics'

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

describe('buildOutcomeRows — niş/segment gelir deneyi', () => {
  it('ilk mesaj + follow-up aynı lead için tek örnektir; gerçek reply ve funnel sonucu bağlanır', () => {
    const rows = buildOutcomeRows(
      [
        { direction: 'outbound', outreach_message_id: 'o1', gmail_message_id: 'provider-1', body: null },
        { direction: 'outbound', outreach_message_id: 'o2', gmail_message_id: 'provider-2', body: null },
        { direction: 'outbound', outreach_message_id: 'o3', gmail_message_id: 'dryrun-o3', body: null },
        { direction: 'inbound', outreach_message_id: 'o2', gmail_message_id: 'in-1', body: 'Fiyat ve detay alabilir miyim?' },
        { direction: 'inbound', outreach_message_id: 'o3', gmail_message_id: 'in-dry', body: 'Görüşelim' },
      ],
      [
        { id: 'o1', lead_id: 'lead-a' },
        { id: 'o2', lead_id: 'lead-a' },
        { id: 'o3', lead_id: 'lead-b' },
      ],
      [
        { id: 'lead-a', status: 'meeting', sector: 'klinik', normalized_sector: 'Sağlık Kliniği' },
        { id: 'lead-b', status: 'new', sector: 'kafe', normalized_sector: null },
      ],
      ['lead-a'],
    )

    expect(rows).toEqual([
      {
        sector: 'Sağlık Kliniği',
        sent: true,
        replied: true,
        positive: true,
        meeting: true,
        proposal: true,
        won: false,
      },
    ])
  })

  it('auto-reply insan cevabı değildir; converted gerçek won sinyalidir', () => {
    const rows = buildOutcomeRows(
      [
        { direction: 'outbound', outreach_message_id: 'o1', gmail_message_id: 'provider-1', body: null },
        { direction: 'inbound', outreach_message_id: 'o1', gmail_message_id: 'in-1', body: 'Out of office' },
      ],
      [{ id: 'o1', lead_id: 'lead-a' }],
      [{ id: 'lead-a', status: 'converted', sector: null, normalized_sector: null }],
    )

    expect(rows[0]).toMatchObject({ sector: null, replied: false, positive: false, meeting: true, proposal: true, won: true })
  })
})
