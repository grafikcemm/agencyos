import { describe, it, expect } from 'vitest'
import {
  computeBackoffMs,
  leaseExpiresAt,
  isLeaseStale,
  isClaimable,
  selectClaimable,
  retryDecision,
  LEASE_TTL_MS,
  type LeasableStep,
} from './lease'

function s(over: Partial<LeasableStep>): LeasableStep {
  return { id: 'a', status: 'queued', attempts: 0, maxAttempts: 3, nextRunAtMs: null, leaseExpiresAtMs: null, ...over }
}

describe('lease/retry çekirdeği (ADR-001, §15)', () => {
  it('computeBackoffMs: exponential + cap', () => {
    expect(computeBackoffMs(1, 1000, 999999)).toBe(1000)
    expect(computeBackoffMs(2, 1000, 999999)).toBe(2000)
    expect(computeBackoffMs(3, 1000, 999999)).toBe(4000)
    expect(computeBackoffMs(20, 1000, 5000)).toBe(5000) // tavan
  })

  it('leaseExpiresAt + isLeaseStale', () => {
    expect(leaseExpiresAt(100)).toBe(100 + LEASE_TTL_MS)
    expect(isLeaseStale(null, 0)).toBe(true)
    expect(isLeaseStale(1000, 999)).toBe(false)
    expect(isLeaseStale(1000, 1000)).toBe(true)
  })

  it('isClaimable: queued(hazır) / queued(bekliyor) / working(bayat) / working(taze) / done', () => {
    expect(isClaimable(s({ status: 'queued', nextRunAtMs: null }), 100)).toBe(true)
    expect(isClaimable(s({ status: 'queued', nextRunAtMs: 50 }), 100)).toBe(true)
    expect(isClaimable(s({ status: 'queued', nextRunAtMs: 200 }), 100)).toBe(false)
    expect(isClaimable(s({ status: 'working', leaseExpiresAtMs: 50 }), 100)).toBe(true) // crash reclaim
    expect(isClaimable(s({ status: 'working', leaseExpiresAtMs: 200 }), 100)).toBe(false)
    expect(isClaimable(s({ status: 'done' }), 100)).toBe(false)
    expect(isClaimable(s({ status: 'blocked_on_approval' }), 100)).toBe(false)
  })

  it('selectClaimable: filtre + limit + stabil sıra', () => {
    const steps = [
      s({ id: 'c', status: 'queued' }),
      s({ id: 'a', status: 'done' }),
      s({ id: 'b', status: 'queued' }),
      s({ id: 'd', status: 'queued', nextRunAtMs: 9999 }),
    ]
    const picked = selectClaimable(steps, 100, 5).map((x) => x.id)
    expect(picked).toEqual(['b', 'c'])
    expect(selectClaimable(steps, 100, 1).map((x) => x.id)).toEqual(['b'])
  })

  it('retryDecision: hak varsa queued+backoff, yoksa kalıcı error', () => {
    const r1 = retryDecision({ attempts: 0, maxAttempts: 3 }, 'boom', 1000)
    expect(r1.status).toBe('queued')
    expect(r1.attempts).toBe(1)
    if (r1.status === 'queued') expect(r1.nextRunAtMs).toBeGreaterThan(1000)

    const r2 = retryDecision({ attempts: 2, maxAttempts: 3 }, 'boom', 1000)
    expect(r2.status).toBe('error')
    expect(r2.attempts).toBe(3)
    expect(r2.nextRunAtMs).toBeNull()
  })
})
