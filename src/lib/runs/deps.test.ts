import { describe, it, expect } from 'vitest'
import { topoSort, hasCycle, type DepEdge } from './deps'

describe('topoSort', () => {
  it('bağımlılıksız adımlar giriş sırasını korur', () => {
    const res = topoSort(['a', 'b', 'c'], [])
    expect(res).toEqual({ ok: true, order: ['a', 'b', 'c'] })
  })

  it('bağımlılık sırasını dayatır (dependsOn önce)', () => {
    // b, a'ya bağlı → a önce gelmeli
    const edges: DepEdge[] = [{ stepId: 'b', dependsOnStepId: 'a' }]
    const res = topoSort(['b', 'a'], edges)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.order.indexOf('a')).toBeLessThan(res.order.indexOf('b'))
  })

  it('zincir sıralar', () => {
    const edges: DepEdge[] = [
      { stepId: 'c', dependsOnStepId: 'b' },
      { stepId: 'b', dependsOnStepId: 'a' },
    ]
    const res = topoSort(['a', 'b', 'c'], edges)
    expect(res).toEqual({ ok: true, order: ['a', 'b', 'c'] })
  })

  it('çevrimi tespit eder', () => {
    const edges: DepEdge[] = [
      { stepId: 'a', dependsOnStepId: 'b' },
      { stepId: 'b', dependsOnStepId: 'a' },
    ]
    const res = topoSort(['a', 'b'], edges)
    expect(res.ok).toBe(false)
    expect(hasCycle(['a', 'b'], edges)).toBe(true)
  })

  it('kendine-bağımlılık çevrimdir', () => {
    expect(hasCycle(['a'], [{ stepId: 'a', dependsOnStepId: 'a' }])).toBe(true)
  })

  it('bilinmeyen düğüme kenar yok sayılır', () => {
    const res = topoSort(['a'], [{ stepId: 'a', dependsOnStepId: 'zzz' }])
    expect(res).toEqual({ ok: true, order: ['a'] })
  })
})
