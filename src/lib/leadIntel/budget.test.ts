import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSpendSinceMock = vi.fn()
vi.mock('../openrouter', () => ({
  getSpendSince: (...args: unknown[]) => getSpendSinceMock(...args),
}))

import {
  LEAD_INTEL_DAILY_CAP_USD,
  LEAD_INTEL_OPERATION_PREFIX,
  istanbulDateKey,
  istanbulDayStartIso,
  getLeadIntelDailySpend,
  isUnderDailyCap,
} from './budget'

describe('İstanbul gün sınırı', () => {
  it('UTC gece yarısından önce bile İstanbul gününü verir (UTC+3)', () => {
    // 2026-07-02 22:30 UTC = 2026-07-03 01:30 İstanbul
    const utcEvening = new Date('2026-07-02T22:30:00Z')
    expect(istanbulDateKey(utcEvening)).toBe('2026-07-03')
    // İstanbul günü başlangıcı = 2026-07-02T21:00:00Z
    expect(istanbulDayStartIso(utcEvening)).toBe('2026-07-02T21:00:00.000Z')
  })

  it('İstanbul öğlen — aynı gün', () => {
    const noon = new Date('2026-07-03T09:00:00Z') // 12:00 İstanbul
    expect(istanbulDateKey(noon)).toBe('2026-07-03')
  })
})

describe('günlük tavan', () => {
  beforeEach(() => {
    getSpendSinceMock.mockReset()
  })

  it('harcama lead_intel_ prefix\'iyle sorgulanır', async () => {
    getSpendSinceMock.mockResolvedValue(0.1)
    const now = new Date('2026-07-03T09:00:00Z')
    const spent = await getLeadIntelDailySpend(now)
    expect(spent).toBe(0.1)
    expect(getSpendSinceMock).toHaveBeenCalledWith('2026-07-02T21:00:00.000Z', LEAD_INTEL_OPERATION_PREFIX)
  })

  it('tavan altı → under=true; tavan ve üstü → under=false', async () => {
    getSpendSinceMock.mockResolvedValue(0.39)
    expect((await isUnderDailyCap()).under).toBe(true)

    getSpendSinceMock.mockResolvedValue(LEAD_INTEL_DAILY_CAP_USD)
    expect((await isUnderDailyCap()).under).toBe(false)

    getSpendSinceMock.mockResolvedValue(5)
    const over = await isUnderDailyCap()
    expect(over.under).toBe(false)
    expect(over.capUsd).toBe(0.4)
  })
})
