import { describe, expect, it } from 'vitest'
import { isPlausibleMersis } from './identity'

describe('isPlausibleMersis', () => {
  it('16 haneli, placeholder olmayan degeri kabul eder', () => {
    expect(isPlausibleMersis('0123456789012345')).toBe(true)
    expect(isPlausibleMersis('0123 4567 8901 2345')).toBe(true)
  })

  it('bos, kisa, harfli ve tek rakardan olusan placeholder degerleri reddeder', () => {
    expect(isPlausibleMersis('')).toBe(false)
    expect(isPlausibleMersis('123')).toBe(false)
    expect(isPlausibleMersis('012345678901234X')).toBe(false)
    expect(isPlausibleMersis('0000000000000000')).toBe(false)
    expect(isPlausibleMersis('1111111111111111')).toBe(false)
  })
})
