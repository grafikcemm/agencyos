import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// LIFE istemcisi gerçek env ister; testin ona ihtiyacı yok ve BAĞLANMAMALI.
// Denetim yazımı sessizce yutulduğu için sahte istemci yeterli.
vi.mock('@/lib/lifeSupabaseAdmin', () => ({
  lifeSupabaseAdmin: { from: () => ({ insert: async () => ({}), select: () => ({ eq: () => ({ lt: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }) },
}))

import {
  CemosAuthError, MAX_SKEW_MS, envelope, istanbulDate, requireCemosAuth, requireWriteHeaders,
} from './cemosLifeAuth'

const READ = 'read-token-0123456789abcdef'
const WRITE = 'write-token-0123456789abcdef'

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/integrations/cemos/life/snapshot', { headers })
}

beforeEach(() => {
  process.env.CEMOS_LIFE_READ_TOKEN = READ
  process.env.CEMOS_LIFE_WRITE_TOKEN = WRITE
  // Hız sınırı süreç-içi ve sayaçlı: her test kendi anahtarını kullansın diye
  // istemci kimliği rastgeleleştirilir, aksi hâlde 30. yazma testi 429 alırdı.
  process.env.CEMOS_LIFE_CLIENT_ID = `test-${Math.random().toString(36).slice(2)}`
})

afterEach(() => {
  delete process.env.CEMOS_LIFE_READ_TOKEN
  delete process.env.CEMOS_LIFE_WRITE_TOKEN
  delete process.env.CEMOS_LIFE_CLIENT_ID
})

describe('requireCemosAuth', () => {
  it('token yoksa 401', () => {
    expect(() => requireCemosAuth(req(), 'read')).toThrowError(CemosAuthError)
    try { requireCemosAuth(req(), 'read') } catch (e) { expect((e as CemosAuthError).status).toBe(401) }
  })

  it('env tanımsızsa HER ortamda reddeder — dev açık kapısı yok', () => {
    delete process.env.CEMOS_LIFE_READ_TOKEN
    delete process.env.CEMOS_LIFE_WRITE_TOKEN
    try {
      requireCemosAuth(req({ authorization: `Bearer ${READ}` }), 'read')
      throw new Error('reddetmedi')
    } catch (e) {
      expect((e as CemosAuthError).code).toBe('not_configured')
    }
  })

  it('okuma tokenı okumayı geçer', () => {
    expect(requireCemosAuth(req({ authorization: `Bearer ${READ}` }), 'read').clientId).toBeTruthy()
  })

  it('OKUMA tokenı YAZMA yoluna giremez', () => {
    try {
      requireCemosAuth(req({ authorization: `Bearer ${READ}` }), 'write')
      throw new Error('okuma tokenı yazma yaptı')
    } catch (e) {
      expect((e as CemosAuthError).status).toBe(403)
      expect((e as CemosAuthError).code).toBe('bad_scope')
    }
  })

  it('yazma tokenı okumayı da kapsar', () => {
    expect(requireCemosAuth(req({ authorization: `Bearer ${WRITE}` }), 'read')).toBeTruthy()
    expect(requireCemosAuth(req({ authorization: `Bearer ${WRITE}` }), 'write')).toBeTruthy()
  })

  it('yanlış token 403', () => {
    try {
      requireCemosAuth(req({ authorization: 'Bearer yanlis-token-000000000000' }), 'read')
      throw new Error('yanlış token geçti')
    } catch (e) {
      expect((e as CemosAuthError).status).toBe(403)
    }
  })

  it('farklı uzunlukta token sabit-zamanlı karşılaştırmayı ÇÖKERTMEZ', () => {
    // Ham `timingSafeEqual` farklı uzunlukta throw eder; digest üzerinden
    // karşılaştırma bunu kapatır. Çökme, 500'e ve bilgi sızıntısına dönerdi.
    expect(() => requireCemosAuth(req({ authorization: 'Bearer k' }), 'read')).toThrowError(CemosAuthError)
  })

  it('hız sınırı aşılınca 429', () => {
    const h = { authorization: `Bearer ${WRITE}` }
    let sonuncu: CemosAuthError | null = null
    for (let i = 0; i < 40; i++) {
      try { requireCemosAuth(req(h), 'write') } catch (e) { sonuncu = e as CemosAuthError; break }
    }
    expect(sonuncu?.status).toBe(429)
  })
})

describe('requireWriteHeaders', () => {
  const now = () => String(Date.now())

  it('Idempotency-Key zorunlu', () => {
    try {
      requireWriteHeaders(req({ 'x-request-timestamp': now() }))
      throw new Error('anahtarsız geçti')
    } catch (e) {
      expect((e as CemosAuthError).code).toBe('idempotency_required')
    }
  })

  it('çok kısa anahtar reddedilir', () => {
    expect(() => requireWriteHeaders(req({ 'idempotency-key': 'kisa', 'x-request-timestamp': now() })))
      .toThrowError(CemosAuthError)
  })

  it('zaman damgası zorunlu', () => {
    try {
      requireWriteHeaders(req({ 'idempotency-key': 'anahtar-12345678' }))
      throw new Error('damgasız geçti')
    } catch (e) {
      expect((e as CemosAuthError).code).toBe('timestamp_required')
    }
  })

  it('REPLAY: pencere dışı eski damga reddedilir', () => {
    const eski = String(Date.now() - MAX_SKEW_MS - 60_000)
    try {
      requireWriteHeaders(req({ 'idempotency-key': 'anahtar-12345678', 'x-request-timestamp': eski }))
      throw new Error('eski damga geçti')
    } catch (e) {
      expect((e as CemosAuthError).code).toBe('timestamp_skew')
    }
  })

  it('geçerli başlıklar anahtarı döner', () => {
    const r = requireWriteHeaders(req({ 'idempotency-key': 'anahtar-12345678', 'x-request-timestamp': now() }))
    expect(r.idempotencyKey).toBe('anahtar-12345678')
  })

  it('ISO damga da kabul edilir', () => {
    const r = requireWriteHeaders(req({ 'idempotency-key': 'anahtar-12345678', 'x-request-timestamp': new Date().toISOString() }))
    expect(r.idempotencyKey).toBeTruthy()
  })
})

describe('zarf ve tarih', () => {
  it('zarf sabit alanları taşır', () => {
    const e = envelope('life', { a: 1 })
    expect(e.app).toBe('agencyos')
    expect(e.scope).toBe('life')
    expect(e.status).toBe('ok')
    expect(typeof e.syncTimestamp).toBe('number')
    expect(e.warnings).toBeNull()
  })

  it('uyarılar boş değilse dizide görünür', () => {
    expect(envelope('life', {}, ['eksik tablo']).warnings).toEqual(['eksik tablo'])
  })

  it('İstanbul günü YYYY-MM-DD', () => {
    expect(istanbulDate(new Date('2026-07-30T22:30:00Z'))).toBe('2026-07-31')
  })
})
