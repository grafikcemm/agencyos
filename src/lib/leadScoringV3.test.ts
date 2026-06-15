import { describe, it, expect } from 'vitest'
import { calculateLeadScoreV3, rescoreWithRisk } from './leadScoringV3'
import type { EvidenceSignals } from './evidenceEngine'

// Güçlü bir lead temeli: işleyen site, WhatsApp, form var → düşük evidence riski,
// yüksek contactability. Risk sinyali olmadığında base_score === potential_score olmalı.
const STRONG_EVIDENCE: EvidenceSignals = {
  has_real_website: true,
  has_whatsapp: true,
  has_form: true,
  has_online_booking: true,
  has_ads_signal: false,
  instagram_as_site: false,
  is_slow_or_dead: false,
  has_job_signal: false,
}

const baseInput = {
  sector: 'diş kliniği',
  city: 'İstanbul',
  rating: 4.6,
  reviewCount: 120,
  phone: '+90 555 000 0000',
  evidence: STRONG_EVIDENCE,
}

describe('calculateLeadScoreV3 — RISK geriye uyumluluğu', () => {
  it('risk sinyali yokken risk_score 0 ve potential_score === base_score', () => {
    const r = calculateLeadScoreV3({ ...baseInput, email: 'info@klinik.com' })
    expect(r.risk_score).toBe(0)
    expect(r.potential_score).toBe(r.base_score)
    expect(r.risk_reasons).toHaveLength(0)
  })

  it('freemail e-posta hafif risk ekler ve potential_score base_score altına iner', () => {
    const r = calculateLeadScoreV3({ ...baseInput, email: 'klinik@gmail.com' })
    expect(r.risk_score).toBeGreaterThan(0)
    expect(r.potential_score).toBe(Math.max(0, r.base_score - r.risk_score))
  })

  it('davranışsal bayraklar riski artırır', () => {
    const clean = calculateLeadScoreV3({ ...baseInput, email: 'info@klinik.com' })
    const risky = calculateLeadScoreV3({
      ...baseInput,
      email: 'info@klinik.com',
      behavioralFlags: { free_sample: true, bargaining: true, payment_term_long: true },
    })
    expect(risky.risk_score).toBeGreaterThan(clean.risk_score)
    expect(risky.potential_score).toBeLessThan(clean.potential_score)
  })
})

describe('route — hot-lead kapısı', () => {
  it('skor eşiklerine göre doğru rota döner', () => {
    expect(rescoreWithRisk(80, {}).route).toBe('manual_hyper_personalization')
    expect(rescoreWithRisk(65, {}).route).toBe('personalized_sequence')
    expect(rescoreWithRisk(50, {}).route).toBe('nurture')
    expect(rescoreWithRisk(30, {}).route).toBe('skip')
  })
})

describe('rescoreWithRisk — base korunur, risk yeniden hesaplanır', () => {
  it('bayrak eklenince potential düşer, base sabit kalır', () => {
    const clean = rescoreWithRisk(80, { email: 'info@firma.com' })
    const risky = rescoreWithRisk(80, { email: 'info@firma.com', behavioralFlags: { free_sample: true } })
    expect(clean.risk_score).toBe(0)
    expect(clean.potential_score).toBe(80)
    expect(risky.potential_score).toBe(80 - risky.risk_score)
    expect(risky.risk_score).toBeGreaterThan(0)
  })
})
