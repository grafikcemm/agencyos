import { describe, it, expect } from 'vitest'
import { sanitizeWriteBody, BadRequestError, enforceSameOrigin } from './guards'

describe('sanitizeWriteBody', () => {
  it('düz nesneyi geçirir', () => {
    expect(sanitizeWriteBody({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' })
  })
  it('prototype-pollution anahtarlarını atar', () => {
    const out = sanitizeWriteBody({ a: 1, __proto__: { x: 1 }, constructor: 2, prototype: 3 })
    expect(out).toEqual({ a: 1 })
  })
  it('nesne olmayan/dizi/boş gövdeyi reddeder', () => {
    expect(() => sanitizeWriteBody(null)).toThrow(BadRequestError)
    expect(() => sanitizeWriteBody([1, 2])).toThrow(BadRequestError)
    expect(() => sanitizeWriteBody('x')).toThrow(BadRequestError)
    expect(() => sanitizeWriteBody({})).toThrow(BadRequestError)
  })
})

describe('enforceSameOrigin', () => {
  const mk = (headers: Record<string, string>) => new Request('https://app.test/api', { headers })
  it('origin yoksa izin verir (server-to-server)', () => {
    expect(enforceSameOrigin(mk({ host: 'app.test' }))).toBeNull()
  })
  it('aynı origin izin verir', () => {
    expect(enforceSameOrigin(mk({ host: 'app.test', origin: 'https://app.test' }))).toBeNull()
  })
  it('çapraz origin reddeder (403)', () => {
    const res = enforceSameOrigin(mk({ host: 'app.test', origin: 'https://evil.test' }))
    expect(res?.status).toBe(403)
  })
})
