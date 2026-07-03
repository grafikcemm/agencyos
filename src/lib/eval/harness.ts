// Minimum golden eval koşucusu (Faz 0, plan §16). Saf — DB'siz, deterministik.
// Amaç: mevcut kritik davranışları (mentor route, council deterministik skorları)
// kilitlemek ki Brain v2 refactoru (Faz 1+) parity'yi bozmadan ilerlesin.
//
// I/O jenerikleri RunnableGoldenSet arkasına gizlenir → toplayıcı `any` kullanmaz.

export interface GoldenCase<I, O> {
  name: string
  input: I
  expected: O
}

export interface GoldenSet<I, O> {
  name: string
  fn: (input: I) => O
  cases: GoldenCase<I, O>[]
  equals?: (a: O, b: O) => boolean
}

export interface CaseResult {
  name: string
  pass: boolean
  expected: unknown
  actual: unknown
}

export interface SetReport {
  name: string
  total: number
  passed: number
  failed: number
  results: CaseResult[]
}

export interface GoldenReport {
  sets: SetReport[]
  total: number
  passed: number
  failed: number
  allPassed: boolean
}

export interface RunnableGoldenSet {
  name: string
  run: () => SetReport
}

function deepEquals<O>(a: O, b: O): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function runGoldenSet<I, O>(set: GoldenSet<I, O>): SetReport {
  const equals = set.equals ?? deepEquals
  const results: CaseResult[] = set.cases.map((c) => {
    let actual: O | { error: string }
    let pass = false
    try {
      const out = set.fn(c.input)
      actual = out
      pass = equals(out, c.expected)
    } catch (err) {
      actual = { error: err instanceof Error ? err.message : String(err) }
      pass = false
    }
    return { name: c.name, pass, expected: c.expected, actual }
  })
  const passed = results.filter((r) => r.pass).length
  return {
    name: set.name,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  }
}

export function makeGoldenSet<I, O>(set: GoldenSet<I, O>): RunnableGoldenSet {
  return { name: set.name, run: () => runGoldenSet(set) }
}

export function runGolden(sets: RunnableGoldenSet[]): GoldenReport {
  const setReports = sets.map((s) => s.run())
  const total = setReports.reduce((n, s) => n + s.total, 0)
  const passed = setReports.reduce((n, s) => n + s.passed, 0)
  return {
    sets: setReports,
    total,
    passed,
    failed: total - passed,
    allPassed: total > 0 && passed === total,
  }
}
