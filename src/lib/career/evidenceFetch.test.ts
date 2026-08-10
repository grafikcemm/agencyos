import { describe, it, expect } from 'vitest'
import {
  checkUrlShape,
  isPrivateAddress,
  verifyEvidenceUrl,
  backoffMs,
  countsTowardProgress,
  degradesProgress,
  MAX_RETRIES,
} from './evidenceFetch'

describe('isPrivateAddress — SSRF koruması', () => {
  it('IPv4 dahili aralıkları reddeder', () => {
    for (const ip of [
      '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255',
      '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), `${ip} dahili sayılmalı`).toBe(true)
    }
  })

  it('bulut metadata adresini özellikle reddeder', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true)
  })

  it('genel IPv4 adreslerine izin verir', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1']) {
      expect(isPrivateAddress(ip), `${ip} genel olmalı`).toBe(false)
    }
  })

  it('IPv6 dahili aralıkları reddeder', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1']) {
      expect(isPrivateAddress(ip), `${ip} dahili sayılmalı`).toBe(true)
    }
  })

  it('IPv4-mapped IPv6 ile maskelenen iç adresi yakalar', () => {
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true)
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })

  it('IP olmayan girdi dahili sayılır (fail-closed)', () => {
    expect(isPrivateAddress('example.com')).toBe(true)
    expect(isPrivateAddress('')).toBe(true)
  })
})

describe('checkUrlShape', () => {
  it('HTTPS dışını reddeder', () => {
    expect(checkUrlShape('http://example.com').ok).toBe(false)
    expect(checkUrlShape('file:///etc/passwd').ok).toBe(false)
    expect(checkUrlShape('ftp://example.com').ok).toBe(false)
    expect(checkUrlShape('gopher://example.com').ok).toBe(false)
  })

  it('URL içindeki kimlik bilgisini reddeder', () => {
    const r = checkUrlShape('https://user:pass@example.com')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('kimlik bilgisi')
  })

  it('dahili ana makine adlarını reddeder', () => {
    expect(checkUrlShape('https://localhost/x').ok).toBe(false)
    expect(checkUrlShape('https://api.localhost/x').ok).toBe(false)
    expect(checkUrlShape('https://db.internal/x').ok).toBe(false)
  })

  it('doğrudan dahili IP yi reddeder', () => {
    expect(checkUrlShape('https://169.254.169.254/latest/meta-data/').ok).toBe(false)
    expect(checkUrlShape('https://127.0.0.1:8443/admin').ok).toBe(false)
    expect(checkUrlShape('https://[::1]/x').ok).toBe(false)
  })

  it('geçerli genel HTTPS adresini kabul eder', () => {
    expect(checkUrlShape('https://alicembozma.com/case').ok).toBe(true)
    expect(checkUrlShape('https://github.com/x/y/pull/1').ok).toBe(true)
  })

  it('bozuk URL de patlamaz', () => {
    expect(checkUrlShape('not a url').ok).toBe(false)
    expect(checkUrlShape('').ok).toBe(false)
  })
})

describe('verifyEvidenceUrl', () => {
  const ok = (status: number, headers: Record<string, string> = {}) =>
    (async () => new Response('', { status, headers })) as unknown as typeof fetch

  it('şema hatası KALICIDIR — yeniden denenmez', async () => {
    const r = await verifyEvidenceUrl('http://example.com', 0, ok(200))
    expect(r.status).toBe('unreachable')
    expect(r.retryAfterMs).toBeUndefined()
  })

  it('dahili IP kalıcı olarak reddedilir', async () => {
    const r = await verifyEvidenceUrl('https://169.254.169.254/', 0, ok(200))
    expect(r.status).toBe('unreachable')
  })

  it('404/410 kalıcı — kanıt gerçekten yok', async () => {
    for (const code of [404, 410]) {
      const r = await verifyEvidenceUrl('https://example.com/x', 0, ok(code))
      expect(r.status).toBe('unreachable')
      expect(r.httpStatus).toBe(code)
    }
  })

  it('401/403 kalıcı — erişilemeyen kanıt kanıt değildir', async () => {
    const r = await verifyEvidenceUrl('https://example.com/x', 0, ok(403))
    expect(r.status).toBe('unreachable')
  })

  it('5xx GEÇİCİ — ilerleme anında düşmez, grace ve yeniden deneme', async () => {
    const r = await verifyEvidenceUrl('https://example.com/x', 0, ok(503))
    expect(r.status).toBe('grace')
    expect(r.retryAfterMs).toBeGreaterThan(0)
  })

  it('yönlendirme İZLENMEZ — kontrol kaybı', async () => {
    const r = await verifyEvidenceUrl('https://example.com/x', 0, ok(302, { location: 'https://evil.test' }))
    expect(r.status).toBe('grace')
    expect(r.error).toContain('yönlendirme')
  })

  it('3 başarısız denemeden sonra unreachable olur', async () => {
    const r = await verifyEvidenceUrl('https://example.com/x', MAX_RETRIES - 1, ok(503))
    expect(r.status).toBe('unreachable')
    expect(r.error).toContain(`${MAX_RETRIES} deneme`)
  })

  it('200 → verified', async () => {
    const r = await verifyEvidenceUrl('https://example.com/x', 0, ok(200))
    expect(r.status).toBe('verified')
    expect(r.httpStatus).toBe(200)
  })

  it('büyük gövdede indirme yapmadan verified sayar', async () => {
    const r = await verifyEvidenceUrl(
      'https://example.com/big',
      0,
      ok(200, { 'content-length': String(50 * 1024 * 1024) }),
    )
    expect(r.status).toBe('verified')
  })

  it('ağ istisnası geçici sayılır', async () => {
    const throwing = (async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch
    const r = await verifyEvidenceUrl('https://example.com/x', 0, throwing)
    expect(r.status).toBe('grace')
  })
})

describe('geri çekilme ve ilerleme etkisi', () => {
  it('üstel geri çekilme 25 dk da tavan yapar', () => {
    expect(backoffMs(0)).toBe(60_000)
    expect(backoffMs(1)).toBe(300_000)
    expect(backoffMs(2)).toBe(1_500_000)
    expect(backoffMs(9)).toBe(1_500_000)
  })

  it('yalnız verified ilerlemeye sayılır', () => {
    expect(countsTowardProgress('verified')).toBe(true)
    expect(countsTowardProgress('grace')).toBe(false)
    expect(countsTowardProgress('pending')).toBe(false)
    expect(countsTowardProgress('unreachable')).toBe(false)
  })

  it('yalnız unreachable ilerlemeyi DÜŞÜRÜR — grace düşürmez', () => {
    expect(degradesProgress('unreachable')).toBe(true)
    expect(degradesProgress('grace')).toBe(false)
    expect(degradesProgress('pending')).toBe(false)
    expect(degradesProgress('verified')).toBe(false)
  })
})
