import { describe, it, expect } from 'vitest'
import { runGolden, allGoldenSets } from './index'

describe('golden eval — Faz 0 parity kilidi', () => {
  const report = runGolden(allGoldenSets)

  it('tüm golden setler geçer', () => {
    const failures = report.sets.flatMap((s) => s.results.filter((r) => !r.pass))
    expect(failures, JSON.stringify(failures, null, 2)).toHaveLength(0)
    expect(report.allPassed).toBe(true)
  })

  for (const set of allGoldenSets) {
    it(`set geçer: ${set.name}`, () => {
      const r = set.run()
      expect(r.failed, JSON.stringify(r.results.filter((x) => !x.pass), null, 2)).toBe(0)
    })
  }
})
