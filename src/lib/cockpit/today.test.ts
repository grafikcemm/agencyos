import { describe, it, expect } from 'vitest'
import { computeExpectedRevenue, STAGE_WEIGHTS } from './today'

// Beklenen-gelir şeridi SAF hesabı (deterministik, LLM'siz — doc 33 §1A/3B).

describe('computeExpectedRevenue', () => {
  it('aşama ağırlıklarıyla toplar', () => {
    const r = computeExpectedRevenue([
      { status: 'contacted', expected_monthly_value_tl: 10000 }, // ×0.1 = 1000
      { status: 'responded', expected_monthly_value_tl: 20000 }, // ×0.35 = 7000
      { status: 'proposal', expected_monthly_value_tl: 10000 },  // ×0.7 = 7000
    ])
    expect(r.weightedPipelineTl).toBe(15000)
    const proposal = r.byStage.find((s) => s.stage === 'proposal')!
    expect(proposal.count).toBe(1)
    expect(proposal.weightedTl).toBe(7000)
  })

  it('ağırlıksız aşamalar (new/won/lost) toplamı ETKİLEMEZ', () => {
    const r = computeExpectedRevenue([
      { status: 'new', expected_monthly_value_tl: 99999 },
      { status: 'converted', expected_monthly_value_tl: 99999 },
    ])
    expect(r.weightedPipelineTl).toBe(0)
  })

  it('null değerler 0 sayılır; boş girişte tüm aşamalar 0 satırıyla döner', () => {
    const r = computeExpectedRevenue([{ status: 'meeting', expected_monthly_value_tl: null }])
    expect(r.weightedPipelineTl).toBe(0)
    expect(r.byStage).toHaveLength(Object.keys(STAGE_WEIGHTS).length)
    expect(r.byStage.every((s) => s.weightedTl === 0)).toBe(true)
  })

  it('ağırlıklar 0-1 aralığında ve funnel sırasıyla artar', () => {
    const w = STAGE_WEIGHTS
    expect(w.contacted).toBeLessThan(w.responded)
    expect(w.responded).toBeLessThan(w.meeting)
    expect(w.meeting).toBeLessThan(w.proposal)
    for (const v of Object.values(w)) expect(v).toBeGreaterThan(0)
    for (const v of Object.values(w)) expect(v).toBeLessThan(1)
  })
})
