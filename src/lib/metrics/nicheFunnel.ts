export const NICHE_FUNNEL_THRESHOLDS = Object.freeze({
  delivered: 50,
  meetings: 10,
  qualifiedLeads: 20,
  proposals: 10,
  coreProjects: 10,
})

export interface NicheFunnelInput {
  experimentDays: number
  delivered: number
  positiveReplies: number
  meetings: number
  paidEntries: number
  qualifiedLeads: number
  totalCostUsd: number
  verifiedWithin14d: number
  totalLeads: number
  proposals: number
  coreProjects: number
  retainers: number
}

export interface FunnelMetric {
  numerator: number
  denominator: number
  value: number | null
  target: number | null
  sampleSufficient: boolean
  decision: 'met' | 'below' | 'insufficient_data' | 'informational'
}

export interface NicheFunnelSnapshot {
  experimentDays: number
  sample: {
    delivered: number
    meetings: number
    qualifiedLeads: number
    proposals: number
    coreProjects: number
  }
  positiveReplyRate: FunnelMetric
  meetingRate: FunnelMetric
  paidEntryPerMeetingRate: FunnelMetric
  paidEntryPerDeliveredRate: FunnelMetric
  costPerQualifiedLeadUsd: FunnelMetric
  evidenceFreshnessRate: FunnelMetric
  proposalToCoreRate: FunnelMetric
  coreToRetainerRate: FunnelMetric
}

const safeNumber = (value: number): number => Number.isFinite(value) && value > 0 ? value : 0

function ratioMetric(
  numerator: number,
  denominator: number,
  minimumSample: number,
  target: number | null,
): FunnelMetric {
  const n = safeNumber(numerator)
  const d = safeNumber(denominator)
  const value = d > 0 ? Number(((n / d) * 100).toFixed(2)) : null
  const sampleSufficient = d >= minimumSample
  return {
    numerator: n,
    denominator: d,
    value,
    target,
    sampleSufficient,
    decision: !sampleSufficient
      ? 'insufficient_data'
      : target === null
        ? 'informational'
        : value !== null && value >= target
          ? 'met'
          : 'below',
  }
}

function costMetric(totalCostUsd: number, qualifiedLeads: number): FunnelMetric {
  const cost = safeNumber(totalCostUsd)
  const leads = safeNumber(qualifiedLeads)
  return {
    numerator: cost,
    denominator: leads,
    value: leads > 0 ? Number((cost / leads).toFixed(4)) : null,
    target: null,
    sampleSufficient: leads >= NICHE_FUNNEL_THRESHOLDS.qualifiedLeads,
    decision: leads >= NICHE_FUNNEL_THRESHOLDS.qualifiedLeads ? 'informational' : 'insufficient_data',
  }
}

/**
 * Niş kararlarını tek ve açık payda sözleşmesiyle üretir.
 * Eşik altındaki örneklem oranı hesaplanabilir, fakat karar üretmez.
 */
export function computeNicheFunnel(input: NicheFunnelInput): NicheFunnelSnapshot {
  const delivered = safeNumber(input.delivered)
  const meetings = safeNumber(input.meetings)
  const qualifiedLeads = safeNumber(input.qualifiedLeads)
  const proposals = safeNumber(input.proposals)
  const coreProjects = safeNumber(input.coreProjects)

  return {
    experimentDays: safeNumber(input.experimentDays),
    sample: { delivered, meetings, qualifiedLeads, proposals, coreProjects },
    positiveReplyRate: ratioMetric(input.positiveReplies, delivered, NICHE_FUNNEL_THRESHOLDS.delivered, 12),
    meetingRate: ratioMetric(meetings, delivered, NICHE_FUNNEL_THRESHOLDS.delivered, 6),
    paidEntryPerMeetingRate: ratioMetric(input.paidEntries, meetings, NICHE_FUNNEL_THRESHOLDS.meetings, 3),
    paidEntryPerDeliveredRate: ratioMetric(input.paidEntries, delivered, NICHE_FUNNEL_THRESHOLDS.delivered, null),
    costPerQualifiedLeadUsd: costMetric(input.totalCostUsd, qualifiedLeads),
    evidenceFreshnessRate: ratioMetric(input.verifiedWithin14d, input.totalLeads, NICHE_FUNNEL_THRESHOLDS.qualifiedLeads, null),
    proposalToCoreRate: ratioMetric(coreProjects, proposals, NICHE_FUNNEL_THRESHOLDS.proposals, null),
    coreToRetainerRate: ratioMetric(input.retainers, coreProjects, NICHE_FUNNEL_THRESHOLDS.coreProjects, null),
  }
}
