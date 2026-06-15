// Cold email KPI hesabı — saf fonksiyon (test edilebilir). Open rate KASITLI
// kullanılmaz (Apple MPP + bot aktivitesi nedeniyle güvenilmez); başarı metriği
// positive reply / bounce'tur. outreach_messages.status'tan beslenir.
//
// NOT: unsubscribe/complaint, manuel-gönder modelinde henüz ayrı status olarak
// izlenmiyor (reply ingestion eklenince gelecek). Şimdilik 0 raporlanır.

export interface OutreachCounts {
  draft: number
  approved: number
  sent: number // status='sent'
  replied: number // status='replied'
  failed: number // status='failed' — bounce/hata proxy'si
}

export type ReplyBenchmark = 'below' | 'ok' | 'good'

export interface OutreachMetrics {
  /** Outbox'tan çıkan toplam ileti (sent + replied). */
  totalSent: number
  replyCount: number
  failedCount: number
  /** replied / totalSent (0-1). totalSent=0 ise 0. */
  positiveReplyRate: number
  /** failed / (totalSent + failed) (0-1). payda 0 ise 0. */
  bounceRate: number
  /** Araştırma eşiği: <%2.5 below, %2.5-6 ok, >%6 good. */
  benchmark: ReplyBenchmark
}

const REPLY_OK_FLOOR = 0.025
const REPLY_GOOD_FLOOR = 0.06

export function computeOutreachMetrics(counts: OutreachCounts): OutreachMetrics {
  const totalSent = counts.sent + counts.replied
  const replyCount = counts.replied
  const failedCount = counts.failed

  const positiveReplyRate = totalSent > 0 ? replyCount / totalSent : 0
  const bounceDenom = totalSent + failedCount
  const bounceRate = bounceDenom > 0 ? failedCount / bounceDenom : 0

  let benchmark: ReplyBenchmark = 'below'
  if (positiveReplyRate >= REPLY_GOOD_FLOOR) benchmark = 'good'
  else if (positiveReplyRate >= REPLY_OK_FLOOR) benchmark = 'ok'

  return { totalSent, replyCount, failedCount, positiveReplyRate, bounceRate, benchmark }
}
