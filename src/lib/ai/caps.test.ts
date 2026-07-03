import { describe, it, expect } from 'vitest'
import { resolveMonthlyCapUsd, DEFAULT_MONTHLY_CAP_USD } from './caps'

describe('resolveMonthlyCapUsd', () => {
  it('sayı değeri aynen döner', () => {
    expect(resolveMonthlyCapUsd(35)).toBe(35)
  })

  it('string sayıyı parse eder (settings.value TEXT)', () => {
    expect(resolveMonthlyCapUsd('50')).toBe(50)
    expect(resolveMonthlyCapUsd(' 12.5 ')).toBe(12.5)
  })

  it('yok/geçersiz/negatif → default (davranış korunur)', () => {
    expect(resolveMonthlyCapUsd(null)).toBe(DEFAULT_MONTHLY_CAP_USD)
    expect(resolveMonthlyCapUsd(undefined)).toBe(DEFAULT_MONTHLY_CAP_USD)
    expect(resolveMonthlyCapUsd('abc')).toBe(DEFAULT_MONTHLY_CAP_USD)
    expect(resolveMonthlyCapUsd(0)).toBe(DEFAULT_MONTHLY_CAP_USD)
    expect(resolveMonthlyCapUsd(-5)).toBe(DEFAULT_MONTHLY_CAP_USD)
  })

  it('özel fallback kullanılabilir', () => {
    expect(resolveMonthlyCapUsd(null, 99)).toBe(99)
  })
})
