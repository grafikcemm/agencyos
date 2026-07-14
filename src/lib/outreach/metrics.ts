// Cold email KPI hesabı — saf fonksiyon (test edilebilir). Open rate KASITLI
// kullanılmaz (Apple MPP + bot aktivitesi nedeniyle güvenilmez). Gerçek provider
// outbound ledger'ı + inbound reply FSM sonucu kullanılır; dry-run sayılmaz.

import { MIN_SAMPLES_FOR_SIGNAL } from '@/lib/persuasion/outcomeTelemetry'
import { classifyReply } from '@/lib/gmail/replyFsm'

export interface OutreachCounts {
  draft: number
  approved: number
  /** Dry-run hariç, benzersiz gerçek outbound outreach sayısı. */
  sent: number
  /** Auto-reply/opt-out hariç, insan cevabı gelen benzersiz outreach sayısı. */
  replied: number
  /** FSM positive_interest olan benzersiz outreach sayısı. */
  positiveReplied: number
  /** Benzersiz failed send attempt — bounce/hata proxy'si. */
  failed: number
}

export type ReplyBenchmark = 'insufficient' | 'below' | 'ok' | 'good'

export interface OutreachMetrics {
  /** Dry-run hariç, provider'dan çıkan benzersiz ileti. */
  totalSent: number
  replyCount: number
  /** İnsan cevabı / gerçek gönderim. */
  replyRate: number
  failedCount: number
  /** positive_interest / gerçek gönderim (0-1). */
  positiveReplyRate: number
  /** failed / (totalSent + failed) (0-1). payda 0 ise 0. */
  bounceRate: number
  /** Minimum 20 gerçek gönderimden önce false; performans iddiası yapılmaz. */
  sampleSufficient: boolean
  /** Yeterli örnekte: <%2.5 below, %2.5-6 ok, >%6 good. */
  benchmark: ReplyBenchmark
}

const REPLY_OK_FLOOR = 0.025
const REPLY_GOOD_FLOOR = 0.06

export function computeOutreachMetrics(counts: OutreachCounts): OutreachMetrics {
  const totalSent = counts.sent
  const replyCount = counts.replied
  const failedCount = counts.failed

  const replyRate = totalSent > 0 ? replyCount / totalSent : 0
  const positiveReplyRate = totalSent > 0 ? counts.positiveReplied / totalSent : 0
  const bounceDenom = totalSent + failedCount
  const bounceRate = bounceDenom > 0 ? failedCount / bounceDenom : 0
  const sampleSufficient = totalSent >= MIN_SAMPLES_FOR_SIGNAL

  let benchmark: ReplyBenchmark = 'insufficient'
  if (sampleSufficient) {
    benchmark = 'below'
    if (positiveReplyRate >= REPLY_GOOD_FLOOR) benchmark = 'good'
    else if (positiveReplyRate >= REPLY_OK_FLOOR) benchmark = 'ok'
  }

  return { totalSent, replyCount, replyRate, failedCount, positiveReplyRate, bounceRate, sampleSufficient, benchmark }
}

export interface EmailLedgerMetricRow {
  direction: 'inbound' | 'outbound' | string
  outreach_message_id: string | null
  gmail_message_id: string | null
  body: string | null
}

/** Ledger satırlarını benzersiz outreach bazında sayar. Bir konuşmadaki çoklu
 * yanıtlar KPI'yı şişiremez; auto-reply ve opt-out pozitif/insan yanıtı değildir. */
export function countsFromEmailLedger(
  rows: EmailLedgerMetricRow[],
  opts: { draft?: number; approved?: number; failedOutreachIds?: string[] } = {},
): OutreachCounts {
  const sent = new Set<string>()
  const humanReplyCandidates = new Set<string>()
  const positiveCandidates = new Set<string>()

  for (const row of rows) {
    const id = row.outreach_message_id
    if (!id) continue
    if (row.direction === 'outbound') {
      const providerId = String(row.gmail_message_id ?? '').trim()
      if (providerId.length > 0 && !providerId.startsWith('dryrun-')) sent.add(id)
      continue
    }
    if (row.direction !== 'inbound') continue
    const cls = classifyReply(row.body ?? '')
    if (!['auto_reply', 'opt_out'].includes(cls)) humanReplyCandidates.add(id)
    if (cls === 'positive_interest') positiveCandidates.add(id)
  }

  // Fake/dry-run inbound test kayıtları veya orphan mesajlar gerçek funnel
  // sinyali değildir; yalnız gerçek outbound kümesiyle kesişim sayılır.
  const replied = new Set([...humanReplyCandidates].filter((id) => sent.has(id)))
  const positive = new Set([...positiveCandidates].filter((id) => sent.has(id)))

  return {
    draft: opts.draft ?? 0,
    approved: opts.approved ?? 0,
    sent: sent.size,
    replied: replied.size,
    positiveReplied: positive.size,
    failed: new Set(opts.failedOutreachIds ?? []).size,
  }
}
