import { describe, it, expect } from 'vitest'
import { safeMailto, safeTel } from './contactHref'

describe('safeMailto', () => {
  it('geçerli e-posta için mailto üretir', () => {
    expect(safeMailto('a@b.com')).toBe('mailto:a%40b.com')
  })
  it('geçersiz/boş değerde undefined döner', () => {
    expect(safeMailto('not-an-email')).toBeUndefined()
    expect(safeMailto('')).toBeUndefined()
    expect(safeMailto(null)).toBeUndefined()
    expect(safeMailto(undefined)).toBeUndefined()
  })
  it('şema enjeksiyonunu reddeder', () => {
    expect(safeMailto('javascript:alert(1)')).toBeUndefined()
  })
})

describe('safeTel', () => {
  it('geçerli telefonu temizleyip tel üretir', () => {
    expect(safeTel('+90 (212) 555-1234')).toBe('tel:+902125551234')
  })
  it('geçersiz/şema enjeksiyonunda undefined döner', () => {
    expect(safeTel('javascript:alert(1)')).toBeUndefined()
    expect(safeTel('abc')).toBeUndefined()
    expect(safeTel(null)).toBeUndefined()
  })
})
