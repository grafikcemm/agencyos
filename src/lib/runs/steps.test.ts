import { describe, it, expect } from 'vitest'
import { normalizeMode, nextRunnableSteps, canRetry, type StepStatus } from './steps'
import type { DepEdge } from './deps'

describe('normalizeMode', () => {
  it('shadow korunur', () => expect(normalizeMode('shadow')).toBe('shadow'))
  it('yok/geçersiz → active (backfill defaultu)', () => {
    expect(normalizeMode(undefined)).toBe('active')
    expect(normalizeMode(null)).toBe('active')
    expect(normalizeMode('garbage')).toBe('active')
  })
})

describe('nextRunnableSteps', () => {
  const mk = (id: string, status: StepStatus) => ({ id, status })

  it('bağımlılıksız queued adımları döner', () => {
    const steps = [mk('a', 'queued'), mk('b', 'done')]
    expect(nextRunnableSteps(steps, []).map((s) => s.id)).toEqual(['a'])
  })

  it('bağımlılığı done olmayan adımı vermez', () => {
    const steps = [mk('a', 'working'), mk('b', 'queued')]
    const edges: DepEdge[] = [{ stepId: 'b', dependsOnStepId: 'a' }]
    expect(nextRunnableSteps(steps, edges)).toHaveLength(0)
  })

  it('bağımlılığı done olan adımı verir', () => {
    const steps = [mk('a', 'done'), mk('b', 'queued')]
    const edges: DepEdge[] = [{ stepId: 'b', dependsOnStepId: 'a' }]
    expect(nextRunnableSteps(steps, edges).map((s) => s.id)).toEqual(['b'])
  })
})

describe('canRetry', () => {
  it('attempts < maxAttempts → true', () => {
    expect(canRetry({ attempts: 1, maxAttempts: 3 })).toBe(true)
  })
  it('attempts >= maxAttempts → false', () => {
    expect(canRetry({ attempts: 3, maxAttempts: 3 })).toBe(false)
  })
})
