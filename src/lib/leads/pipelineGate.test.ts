import { describe, it, expect } from 'vitest'
import { missingProposalFields, canEnterProposal, proposalGateMessage } from './pipelineGate'

describe('pipelineGate — proposal gatekeeper', () => {
  it('üç alan da doluysa geçişe izin verir', () => {
    const lead = { pain_point: 'görsel tutarsız', decision_maker: 'sahip', budget_band: '20-40k' }
    expect(missingProposalFields(lead)).toHaveLength(0)
    expect(canEnterProposal(lead)).toBe(true)
  })

  it('eksik alanları listeler', () => {
    expect(missingProposalFields({ pain_point: 'x' })).toEqual(['decision_maker', 'budget_band'])
    expect(canEnterProposal({ pain_point: 'x' })).toBe(false)
  })

  it('boş/whitespace değerleri dolu saymaz', () => {
    expect(missingProposalFields({ pain_point: '   ', decision_maker: '', budget_band: null })).toEqual([
      'pain_point',
      'decision_maker',
      'budget_band',
    ])
  })

  it('mesaj eksik alan etiketlerini içerir', () => {
    const msg = proposalGateMessage(['decision_maker', 'budget_band'])
    expect(msg).toContain('Karar verici')
    expect(msg).toContain('Bütçe bandı')
  })
})
