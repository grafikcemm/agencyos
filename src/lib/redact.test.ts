import { describe, it, expect } from 'vitest'
import { redactForLog } from './redact'

describe('redactForLog', () => {
  it('e-posta ve telefonu maskeler', () => {
    const out = redactForLog('mail a@b.com tel +902125551234 son')
    expect(out).toContain('[email]')
    expect(out).toContain('[phone]')
    expect(out).not.toContain('a@b.com')
  })
  it('maxLen üstünü kırpar', () => {
    const out = redactForLog('x'.repeat(600), 100)
    expect(out.startsWith('x'.repeat(100))).toBe(true)
    expect(out).toContain('kırpıldı')
  })
  it('nesneyi JSON stringe çevirir', () => {
    expect(redactForLog({ a: 1 })).toBe('{"a":1}')
  })
})
