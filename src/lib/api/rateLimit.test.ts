import { describe, it, expect } from 'vitest'
import { rateLimit, clientIp } from './rateLimit'

describe('rateLimit', () => {
  it('limit altında izin verir, üstünde reddeder', () => {
    const key = `test:${Math.floor(performance.now())}:a`
    const limit = 3
    const win = 60000
    expect(rateLimit(key, limit, win).allowed).toBe(true) // 1
    expect(rateLimit(key, limit, win).allowed).toBe(true) // 2
    expect(rateLimit(key, limit, win).allowed).toBe(true) // 3
    const blocked = rateLimit(key, limit, win) // 4
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })
})

describe('clientIp', () => {
  it('x-forwarded-for ilk IP', () => {
    const req = new Request('https://x/', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(clientIp(req)).toBe('1.2.3.4')
  })
  it('başlık yoksa unknown', () => {
    expect(clientIp(new Request('https://x/'))).toBe('unknown')
  })
})
