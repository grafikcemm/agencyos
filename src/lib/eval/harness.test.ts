import { describe, it, expect } from 'vitest'
import { makeGoldenSet, runGolden, runGoldenSet } from './harness'

describe('golden harness', () => {
  it('geçen ve kalan case sayar', () => {
    const set = {
      name: 'square',
      fn: (n: number) => n * n,
      cases: [
        { name: '2', input: 2, expected: 4 },
        { name: '3', input: 3, expected: 9 },
        { name: 'yanlis', input: 4, expected: 15 },
      ],
    }
    const report = runGoldenSet(set)
    expect(report.total).toBe(3)
    expect(report.passed).toBe(2)
    expect(report.failed).toBe(1)
  })

  it('nesne çıktısını derin karşılaştırır', () => {
    const set = makeGoldenSet({
      name: 'obj',
      fn: (x: number) => ({ a: x, b: x + 1 }),
      cases: [{ name: 'ok', input: 1, expected: { a: 1, b: 2 } }],
    })
    expect(set.run().failed).toBe(0)
  })

  it('fn throw ederse case fail olur (harness throw etmez)', () => {
    const set = makeGoldenSet({
      name: 'throws',
      fn: (): number => {
        throw new Error('boom')
      },
      cases: [{ name: 'patlar', input: 0, expected: 1 }],
    })
    const r = set.run()
    expect(r.failed).toBe(1)
    expect(r.passed).toBe(0)
  })

  it('runGolden birden çok seti toplar', () => {
    const s1 = makeGoldenSet({ name: 's1', fn: (n: number) => n, cases: [{ name: 'a', input: 1, expected: 1 }] })
    const s2 = makeGoldenSet({ name: 's2', fn: (n: number) => n, cases: [{ name: 'b', input: 2, expected: 2 }] })
    const rep = runGolden([s1, s2])
    expect(rep.total).toBe(2)
    expect(rep.allPassed).toBe(true)
  })
})
