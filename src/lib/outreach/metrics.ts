// Cold email KPI hesabı — saf fonksiyon (test edilebilir). Open rate KASITLI
// kullanılmaz (Apple MPP + bot aktivitesi nedeniyle güvenilmez). Gerçek provider
// outbound ledger'ı + inbound reply FSM sonucu kullanılır; dry-run sayılmaz.

import { MIN_SAMPLES_FOR_SIGNAL } from '@/lib/persuasion/outcomeTelemetry'
import type { OutcomeInputRow } from '@/lib/persuasion/outcomeTelemetry'
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

export interface OutreachOutcomeLinkRow {
  id: string
  lead_id: string | null
}

export interface LeadOutcomeLinkRow {
  id: string
  status: string
  sector: string | null
  normalized_sector: string | null
}

/** Gerçek email ledger'ını lead bazında tekilleştirerek sektör deney satırlarına
 * çevirir. Bir lead'e ilk mesaj + follow-up gönderilmiş olması örnek sayısını
 * şişiremez. Reply yalnız gerçek outbound ile kesişen inbound kayıttan gelir. */
export function buildOutcomeRows(
  ledger: EmailLedgerMetricRow[],
  outreachLinks: OutreachOutcomeLinkRow[],
  leads: LeadOutcomeLinkRow[],
  proposalLeadIds: string[] = [],
): OutcomeInputRow[] {
  const sentOutreachIds = new Set<string>()
  const humanReplyIds = new Set<string>()
  const positiveReplyIds = new Set<string>()

  for (const row of ledger) {
    const outreachId = row.outreach_message_id
    if (!outreachId) continue
    if (row.direction === 'outbound') {
      const providerId = String(row.gmail_message_id ?? '').trim()
      if (providerId && !providerId.startsWith('dryrun-')) sentOutreachIds.add(outreachId)
      continue
    }
    if (row.direction !== 'inbound') continue
    const cls = classifyReply(row.body ?? '')
    if (!['auto_reply', 'opt_out'].includes(cls)) humanReplyIds.add(outreachId)
    if (cls === 'positive_interest') positiveReplyIds.add(outreachId)
  }

  const linkByOutreach = new Map(outreachLinks.map((row) => [row.id, row.lead_id]))
  const outreachIdsByLead = new Map<string, Set<string>>()
  for (const outreachId of sentOutreachIds) {
    const leadId = linkByOutreach.get(outreachId)
    if (!leadId) continue
    const ids = outreachIdsByLead.get(leadId) ?? new Set<string>()
    ids.add(outreachId)
    outreachIdsByLead.set(leadId, ids)
  }

  const leadById = new Map(leads.map((lead) => [lead.id, lead]))
  const proposalSet = new Set(proposalLeadIds)
  const rows: OutcomeInputRow[] = []

  for (const [leadId, outreachIds] of [...outreachIdsByLead.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const lead = leadById.get(leadId)
    if (!lead) continue
    const status = String(lead.status ?? '').toLowerCase()
    const replied = [...outreachIds].some((id) => humanReplyIds.has(id))
    const positive = [...outreachIds].some((id) => positiveReplyIds.has(id))
    rows.push({
      sector: lead.normalized_sector?.trim() || lead.sector?.trim() || null,
      sent: true,
      replied,
      positive,
      meeting: ['meeting', 'proposal', 'converted', 'won'].includes(status),
      proposal: proposalSet.has(leadId) || ['proposal', 'converted', 'won'].includes(status),
      won: ['converted', 'won'].includes(status),
    })
  }

  return rows
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
