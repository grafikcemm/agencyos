import { describe, it, expect, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 4 — proposalBuilder çıktıları GERÇEK canonical outbound
// gate'ten geçer (gate MOCK DEĞİL; yalnız DB/Voice okumaları stub). Eski
// uyumsuzluğun regresyonu: opt-out eksikliği, tanınmayan CTA, salesPromise'in
// kanıtsız vaatleri unit'te YAKALANIR.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: () => api,
        limit: () => api,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      })
      return api
    },
  },
}))
vi.mock('@/lib/outreach/voiceDna', () => ({ getBannedPhrases: async () => [] }))

import { buildProposal } from './proposalBuilder'
import { evaluateOutboundText } from './outreach/outboundGate'
import { findOfferById } from './offers'

const LEAD = {
  id: 'L1',
  business_name: 'Denta Klinik',
  sector: 'diş kliniği',
  pain_points: ['Web sitesi yok', 'Randevu telefonla yönetiliyor'],
  why_now: null,
}

describe('proposalBuilder × GERÇEK gate (mock yok)', () => {
  it('whatsapp metni gerçek gate PASS (proposal_whatsapp)', async () => {
    const p = buildProposal({ lead: LEAD, offerIds: ['ai_lead_response'] })
    const v = await evaluateOutboundText({
      leadId: null,
      businessName: LEAD.business_name,
      subject: null,
      body: p.whatsappText,
      kind: 'proposal_whatsapp',
    })
    expect(v.violations.map((x) => `${x.code}:${x.detail}`)).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('kurumsal ton whatsapp metni de PASS (rica CTA varyantı tanınır)', async () => {
    const p = buildProposal({ lead: LEAD, offerIds: ['ai_lead_response'], tone: 'kurumsal' })
    const v = await evaluateOutboundText({
      leadId: null,
      businessName: LEAD.business_name,
      subject: null,
      body: p.whatsappText,
      kind: 'proposal_whatsapp',
    })
    expect(v.violations.map((x) => `${x.code}:${x.detail}`)).toEqual([])
  })

  it('email metni gerçek gate PASS: opt-out VAR + tek tanınan CTA', async () => {
    const p = buildProposal({ lead: LEAD, offerIds: ['ai_lead_response'] })
    expect(p.emailText).toContain('istemiyorsanız')
    const v = await evaluateOutboundText({
      leadId: null,
      businessName: LEAD.business_name,
      subject: `Teklif — ${LEAD.business_name}`,
      body: p.emailText,
      kind: 'proposal_email',
    })
    expect(v.violations.map((x) => `${x.code}:${x.detail}`)).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('salesPromise OUTBOUND metne GİRMEZ (kanıtsız süre/sonuç vaadi yok)', () => {
    const offer = findOfferById('ai_lead_response')!
    const p = buildProposal({ lead: LEAD, offerIds: ['ai_lead_response'] })
    expect(p.whatsappText).not.toContain(offer.salesPromise)
    expect(p.emailText).not.toContain(offer.salesPromise)
    // Beklenen sonuç alanı süreç/çıktı dilidir:
    expect(p.expectedOutcome).toContain('teslim edilir')
  })

  it('REGRESYON: salesPromise metne eklenirse gerçek gate BLOKLAR', async () => {
    const offer = findOfferById('ai_lead_response')!
    const p = buildProposal({ lead: LEAD, offerIds: ['ai_lead_response'] })
    const tampered = `${p.emailText}\n${offer.salesPromise}`
    const v = await evaluateOutboundText({
      leadId: null,
      businessName: LEAD.business_name,
      subject: `Teklif — ${LEAD.business_name}`,
      body: tampered,
      kind: 'proposal_email',
    })
    expect(v.ok).toBe(false)
    expect(v.violations.map((x) => x.code)).toContain('CLAIM_WITHOUT_EVIDENCE')
  })

  it('iddialı pain_point / why_now cümleleri metne ALINMAZ (fail-closed filtre)', () => {
    const p = buildProposal({
      lead: {
        ...LEAD,
        pain_points: ['Müşterileriniz rakibe geçiyor', 'Randevu telefonla yönetiliyor'],
        why_now: 'Sitenize baktım, çok yavaş',
      },
      offerIds: ['ai_lead_response'],
    })
    expect(p.problem).toBe('Randevu telefonla yönetiliyor')
    expect(p.whatsappText).not.toContain('baktım')
  })
})
