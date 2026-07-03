import { describe, it, expect } from 'vitest'
import { scoreTrajectory, judgeWithRubric, keywordPresenceScorer } from './judge'

describe('eval — trajectory skoru (§16)', () => {
  it('tam eşleşme → skor 1', () => {
    const s = scoreTrajectory({ tools: ['a', 'b'] }, { tools: ['a', 'b'] })
    expect(s.toolPrecision).toBe(1)
    expect(s.toolRecall).toBe(1)
    expect(s.orderScore).toBe(1)
    expect(s.score).toBe(1)
  })
  it('fazla tool → precision düşer, recall tam', () => {
    const s = scoreTrajectory({ tools: ['a'] }, { tools: ['a', 'b'] })
    expect(s.toolPrecision).toBeCloseTo(0.5)
    expect(s.toolRecall).toBe(1)
  })
  it('eksik tool → recall düşer', () => {
    const s = scoreTrajectory({ tools: ['a', 'b'] }, { tools: ['a'] })
    expect(s.toolRecall).toBeCloseTo(0.5)
    expect(s.toolPrecision).toBe(1)
  })
  it('ters sıra → orderScore düşer', () => {
    const s = scoreTrajectory({ tools: ['a', 'b', 'c'] }, { tools: ['c', 'b', 'a'] })
    expect(s.orderScore).toBeLessThan(1)
    expect(s.toolRecall).toBe(1)
  })
  it('boş beklenen + boş gerçek → 1', () => {
    const s = scoreTrajectory({ tools: [] }, { tools: [] })
    expect(s.score).toBe(1)
  })
})

describe('eval — LLM-as-judge rubrik', () => {
  it('ağırlıklı skor + clamp', () => {
    const r = judgeWithRubric(
      [{ key: 'evidence', weight: 2 }, { key: 'clarity', weight: 1 }],
      'kanıt açıkça sunuldu',
      (key) => (key === 'evidence' ? 1 : 0),
    )
    expect(r.weighted).toBeCloseTo((1 * 2 + 0 * 1) / 3)
    expect(r.perCriterion).toHaveLength(2)
  })
  it('keywordPresenceScorer: geçiyorsa 1, yoksa 0.5', () => {
    expect(keywordPresenceScorer('kanıt', 'burada kanıt var')).toBe(1)
    expect(keywordPresenceScorer('eksik', 'burada kanıt var')).toBe(0.5)
  })
  it('sıfır ağırlık → 0 (bölme koruması)', () => {
    expect(judgeWithRubric([], 'x', keywordPresenceScorer).weighted).toBe(0)
  })
})
