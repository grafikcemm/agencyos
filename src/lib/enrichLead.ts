// Raw lead (DB) → enriched Lead for UI.
// DB-stored fields always take precedence — no client-side overwriting.

import { Lead } from './types'
import { calculateLeadScoreV3 } from './leadScoringV3'
import { recommendOffersForLead, estimateLeadValue, reconcileOffers } from './offerMatching'
import { computeNextAction, NextAction, stageAgeDays } from './nextActionEngine'
import { runQualityEngine } from './highQualityLeadEngine'
import type { EvidenceSignals } from './evidenceEngine'

export interface EnrichedLead extends Lead {
  nextAction: NextAction
  stageAge: number
}

function toEvidenceSignals(raw: Partial<Lead>): EvidenceSignals {
  return {
    has_real_website: raw.has_real_website ?? raw.has_website ?? false,
    has_whatsapp: raw.has_whatsapp ?? false,
    has_form: raw.has_form ?? false,
    has_online_booking: raw.has_online_booking ?? false,
    has_ads_signal: raw.has_ads_signal ?? false,
    instagram_as_site: raw.instagram_as_site ?? false,
    is_slow_or_dead: false,
    has_job_signal: raw.has_job_signal ?? false,
  }
}

export function enrichLead(raw: Partial<Lead> & { id: string; business_name: string }): EnrichedLead {
  const evidence = toEvidenceSignals(raw)

  const scoreResult = calculateLeadScoreV3({
    sector: raw.sector ?? '',
    city: raw.city ?? '',
    rating: raw.rating ?? null,
    reviewCount: raw.review_count ?? 0,
    phone: raw.phone ?? null,
    evidence,
    branchCount: raw.branch_count ?? 1,
  })

  // DB potential_score if enriched, else V3
  const potential_score = (raw.potential_score && raw.potential_score > 0)
    ? raw.potential_score
    : scoreResult.potential_score

  // Quality fields — DB-first, fallback to engine
  let quality_score = raw.quality_score ?? 0
  let conversion_probability = raw.conversion_probability ?? 0
  let lead_tier = raw.lead_tier ?? null
  let quality_label = raw.quality_label ?? null
  let why_this_will_convert = raw.why_this_will_convert ?? null
  let first_30_seconds_pitch = raw.first_30_seconds_pitch ?? null
  let next_action_priority = raw.next_action_priority ?? null
  let conversion_angle = raw.conversion_angle ?? null

  if (!quality_score || !lead_tier) {
    const qr = runQualityEngine({ lead: raw, evidence })
    quality_score = qr.quality_score
    conversion_probability = qr.conversion_probability
    lead_tier = qr.lead_tier
    quality_label = qr.quality_label
    why_this_will_convert = qr.why_this_will_convert
    first_30_seconds_pitch = qr.first_30_seconds_pitch
    next_action_priority = qr.next_action_priority
    conversion_angle = qr.conversion_angle
  }

  // Override quality label to strictly follow the tier rules: A->Çok Güçlü, B->Takip, C->Isıt, D->Ele
  if (lead_tier === 'A') {
    quality_label = 'Çok Güçlü'
  } else if (lead_tier === 'B') {
    quality_label = 'Takip'
  } else if (lead_tier === 'C') {
    quality_label = 'Isıt'
  } else if (lead_tier === 'D') {
    quality_label = 'Ele'
  }

  // Offer: DB-stored recommended_offer_id is the source of truth — reconcile so it's primary
  const recommended = reconcileOffers(recommendOffersForLead(raw, 3), raw.recommended_offer_id, raw)
  const value = estimateLeadValue(raw)
  const action = computeNextAction({ ...raw, potential_score })
  const age = stageAgeDays(raw)

  return {
    ...(raw as Lead),
    id: raw.id,
    business_name: raw.business_name,
    sector: raw.sector ?? '',
    city: raw.city ?? '',
    status: raw.status ?? 'new',
    created_at: raw.created_at ?? new Date().toISOString(),
    potential_score,
    priority: scoreResult.priority,
    has_website: evidence.has_real_website,
    has_whatsapp: evidence.has_whatsapp,
    has_form: evidence.has_form,
    has_online_booking: evidence.has_online_booking,
    has_ads_signal: evidence.has_ads_signal,
    scores: {
      sectorFit: scoreResult.fit_score,
      budgetPotential: scoreResult.money_score,
      painIntensity: scoreResult.evidence_score,
      digitalMaturity: scoreResult.evidence_score,
      offerFit: scoreResult.fit_score,
      urgency: scoreResult.urgency_score,
      accessibility: scoreResult.contactability_score,
      trustSignals: Math.min(scoreResult.money_score, 100),
      total: potential_score,
    },
    score_reasons: scoreResult.score_reasons,
    // Quality
    quality_score,
    conversion_probability,
    lead_tier,
    quality_label,
    why_this_will_convert,
    first_30_seconds_pitch,
    next_action_priority,
    conversion_angle,
    // Sales intelligence — DB-first
    why_now: raw.why_now ?? null,
    pain_signals: raw.pain_signals ?? [],
    proof_points: raw.proof_points ?? [],
    disqualification_reason: raw.disqualification_reason ?? null,
    // Offer — DB wins, no client override
    recommended_offer_name: raw.recommended_offer_name ?? recommended[0]?.offerName ?? null,
    recommended_offer_id: raw.recommended_offer_id ?? recommended[0]?.offerId ?? null,
    recommended_offers: recommended,
    estimated_setup_value: raw.expected_offer_value_tl ?? value.setup,
    estimated_monthly_value: raw.expected_monthly_value_tl ?? value.monthly,
    next_action: (() => {
      if (next_action_priority === 'call_now') return 'Bugün ara'
      if (next_action_priority === 'send_audit') return 'Mini audit gönder'
      if (next_action_priority === 'warm_up') return 'Isıt'
      if (next_action_priority === 'discard' || next_action_priority === 'wait') return 'Bekleme listesi/Ele'
      return action.label
    })(),
    sales_angle: raw.sales_angle ?? recommended[0]?.salesAngle ?? null,
    first_message: raw.first_message ?? recommended[0]?.firstMessage ?? null,
    nextAction: {
      ...action,
      label: (() => {
        if (next_action_priority === 'call_now') return 'Bugün ara'
        if (next_action_priority === 'send_audit') return 'Mini audit gönder'
        if (next_action_priority === 'warm_up') return 'Isıt'
        if (next_action_priority === 'discard' || next_action_priority === 'wait') return 'Bekleme listesi/Ele'
        return action.label
      })()
    },
    stageAge: age,
  } as unknown as EnrichedLead
}

export function enrichLeads(raws: Array<Partial<Lead> & { id: string; business_name: string }>): EnrichedLead[] {
  return raws.map(enrichLead)
}
