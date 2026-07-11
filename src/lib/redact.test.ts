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

  // eval.security.token_redaction (21 T4/T11)
  it('Google OAuth access token (ya29.) maskelenir', () => {
    const out = redactForLog('Bearer ya29.a0AfB_byC1234-abc_XYZ.789 kullanıldı')
    expect(out).toContain('[token]')
    expect(out).not.toContain('ya29.a0AfB_byC1234')
  })
  it('Google OAuth refresh token (1//) maskelenir', () => {
    const out = redactForLog('refresh_token=1//0eXvL9-qwerty_ASDF ile yenilendi')
    expect(out).toContain('[token]')
    expect(out).not.toContain('1//0eXvL9')
  })
  it('token JSON gövdesi içinde de maskelenir', () => {
    const out = redactForLog({ access_token: 'ya29.SECRETPART123', refresh_token: '1//SECRETREFRESH' })
    expect(out).not.toContain('SECRETPART123')
    expect(out).not.toContain('SECRETREFRESH')
  })
})
