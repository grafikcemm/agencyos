import { describe, it, expect } from 'vitest'
import { runQualityEngine } from './highQualityLeadEngine'
import type { EvidenceSignals } from './evidenceEngine'
import { findOfferById } from './offers'

// Yüksek skorlu dental lead: telefon + place id + doğrulanmış dijital problem.
const strongDentalLead = {
  business_name: 'Test Diş Kliniği',
  sector: 'diş kliniği',
  city: 'İstanbul',
  google_place_id: 'ChIJtest123',
  phone: '0212 555 11 22',
  website: null,
  rating: 4.6,
  review_count: 40,
}

const painfulEvidence: EvidenceSignals = {
  has_real_website: false,
  has_whatsapp: false,
  has_form: false,
  has_online_booking: false,
  has_ads_signal: false,
  instagram_as_site: false,
  is_slow_or_dead: false,
}

describe('runQualityEngine — A-tier eligibility (TRAN-ITEM-2.2 regresyonu)', () => {
  it('assigns A-tier + call_now when phone + google_place_id + verified pain + score >= 70', () => {
    const result = runQualityEngine({ lead: strongDentalLead, evidence: painfulEvidence })
    expect(result.quality_score).toBeGreaterThanOrEqual(70)
    expect(result.lead_tier).toBe('A')
    expect(result.next_action_priority).toBe('call_now')
  })

  it('never assigns A-tier when google_place_id is missing — the manual scan bug', () => {
    const { google_place_id: _omitted, ...withoutPlaceId } = strongDentalLead
    void _omitted
    const result = runQualityEngine({ lead: withoutPlaceId, evidence: painfulEvidence })
    expect(result.lead_tier).not.toBe('A')
    expect(result.next_action_priority).not.toBe('call_now')
  })

  it('disqualifies leads without a phone', () => {
    const result = runQualityEngine({
      lead: { ...strongDentalLead, phone: undefined },
      evidence: painfulEvidence,
    })
    expect(result.lead_tier).toBe('D')
    expect(result.disqualification_reason).toBeTruthy()
    expect(result.next_action_priority).toBe('discard')
  })

  it('keeps B-tier for mid-score leads (no call_now)', () => {
    const calmEvidence: EvidenceSignals = {
      ...painfulEvidence,
      has_real_website: true,
      has_whatsapp: true,
      has_form: true,
      has_online_booking: true,
    }
    const result = runQualityEngine({
      lead: { ...strongDentalLead, sector: 'kafe', rating: 4.8, review_count: 200 },
      evidence: calmEvidence,
    })
    expect(result.lead_tier).not.toBe('A')
    expect(result.next_action_priority).not.toBe('call_now')
  })
})

describe('offer catalog — AI Satış Asistanı (tweet konsepti)', () => {
  it('ai_sales_assistant exists with recurring pricing', () => {
    const offer = findOfferById('ai_sales_assistant')
    expect(offer).toBeDefined()
    expect(offer!.monthlyPrice).toBeGreaterThan(0)
    expect(offer!.targetSectors).toContain('beauty')
  })
})
