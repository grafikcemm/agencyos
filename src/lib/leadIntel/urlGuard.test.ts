import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

// DNS lookup'ı mock'la — testler ağa çıkmaz.
const lookupMock = vi.fn()
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}))

// http(s).request mock — pinli bağlantı katmanı ağsız test edilir.
interface CapturedRequest {
  url: URL
  options: Record<string, unknown>
}
const captured: CapturedRequest[] = []
let responseQueue: Array<{ status: number; location?: string; body?: string }> = []

function fakeRequest(url: URL, options: Record<string, unknown>, cb: (res: unknown) => void) {
  captured.push({ url, options })
  const spec = responseQueue.shift() ?? { status: 200, body: '<html>ok</html>' }
  const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; destroy: () => void }
  res.statusCode = spec.status
  res.headers = spec.location ? { location: spec.location } : {}
  res.destroy = () => {}
  queueMicrotask(() => {
    cb(res)
    if (spec.body) res.emit('data', Buffer.from(spec.body))
    res.emit('end')
  })
  return { on: () => undefined, end: () => undefined }
}
vi.mock('node:https', () => ({ request: (...a: unknown[]) => (fakeRequest as (...x: unknown[]) => unknown)(...a) }))
vi.mock('node:http', () => ({ request: (...a: unknown[]) => (fakeRequest as (...x: unknown[]) => unknown)(...a) }))

import { isPrivateIp, staticUrlCheck, validateLeadUrl, guardedFetch, makePinnedLookup } from './urlGuard'

describe('isPrivateIp', () => {
  it('IPv4 private/reserved aralıkları reddedilir', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.1.1', '0.0.0.0', '100.64.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })

  it('public IPv4 kabul edilir', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '104.16.1.1', '95.216.1.1']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })

  it('IPv6 loopback/ULA/link-local ve mapped-private reddedilir', () => {
    for (const ip of ['::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.1.1', '::ffff:10.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
    expect(isPrivateIp('2606:4700::6810:85e5')).toBe(false)
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('staticUrlCheck', () => {
  it('yalnız http(s) + standart port kabul edilir', () => {
    expect(staticUrlCheck('https://ornek.com').ok).toBe(true)
    expect(staticUrlCheck('http://ornek.com').ok).toBe(true)
    expect(staticUrlCheck('https://ornek.com:443/yol').ok).toBe(true)
    expect(staticUrlCheck('ftp://ornek.com').ok).toBe(false)
    expect(staticUrlCheck('file:///etc/passwd').ok).toBe(false)
    expect(staticUrlCheck('https://ornek.com:8080').ok).toBe(false)
    expect(staticUrlCheck('gopher://ornek.com').ok).toBe(false)
  })

  it('IP-literal ve yerel hostname reddedilir', () => {
    expect(staticUrlCheck('http://127.0.0.1').ok).toBe(false)
    expect(staticUrlCheck('http://192.168.1.1/admin').ok).toBe(false)
    expect(staticUrlCheck('http://8.8.8.8').ok).toBe(false) // public bile olsa IP-literal red
    expect(staticUrlCheck('http://localhost:80').ok).toBe(false)
    expect(staticUrlCheck('http://servis.internal').ok).toBe(false)
    expect(staticUrlCheck('not-a-url').ok).toBe(false)
  })
})

describe('validateLeadUrl (DNS + pinlenecek IP)', () => {
  beforeEach(() => {
    lookupMock.mockReset()
  })

  it('private IP\'ye çözülen hostname reddedilir', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    const result = await validateLeadUrl('https://kotu-site.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Private IP')
  })

  it('birden çok kayıttan BİRİ bile private ise reddedilir', async () => {
    lookupMock.mockResolvedValue([
      { address: '104.16.1.1', family: 4 },
      { address: '192.168.0.10', family: 4 },
    ])
    const result = await validateLeadUrl('https://karisik.com')
    expect(result.ok).toBe(false)
  })

  it('public çözüm kabul edilir ve pinlenecek IP döner', async () => {
    lookupMock.mockResolvedValue([{ address: '104.16.1.1', family: 4 }])
    const result = await validateLeadUrl('https://temiz-site.com')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.pinnedIp).toBe('104.16.1.1')
      expect(result.family).toBe(4)
    }
  })

  it('DNS çözülemezse reddedilir', async () => {
    lookupMock.mockImplementation(() => {
      throw new Error('ENOTFOUND')
    })
    const result = await validateLeadUrl('https://olmayan-domain-xyz.com')
    expect(result.ok).toBe(false)
  })
})

describe('makePinnedLookup', () => {
  it('DNS\'e sormadan HER ZAMAN pinli IP\'yi döndürür (rebinding penceresi yok)', () => {
    const pinned = makePinnedLookup('104.16.1.1', 4)
    let single: unknown, all: unknown
    ;(pinned as (h: string, o: unknown, cb: (e: unknown, a: unknown, f?: number) => void) => void)(
      'herhangi-host.com', {}, (_e, addr) => { single = addr }
    )
    ;(pinned as (h: string, o: unknown, cb: (e: unknown, a: unknown) => void) => void)(
      'herhangi-host.com', { all: true }, (_e, addrs) => { all = addrs }
    )
    expect(single).toBe('104.16.1.1')
    expect(all).toEqual([{ address: '104.16.1.1', family: 4 }])
  })
})

describe('guardedFetch (pinli bağlantı + redirect zinciri)', () => {
  beforeEach(() => {
    lookupMock.mockReset()
    captured.length = 0
    responseQueue = []
  })

  it('DNS REBINDING: doğrulamadan sonra DNS private\'a dönse bile bağlantı doğrulanan public IP\'ye pinlidir', async () => {
    // 1. çözüm: public (doğrulama bunu görür). SONRAKİ her çözüm: private (rebinding).
    lookupMock
      .mockResolvedValueOnce([{ address: '104.16.1.1', family: 4 }])
      .mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    responseQueue = [{ status: 200, body: '<html>guvenli</html>' }]

    const result = await guardedFetch('https://rebind-saldiri.com')
    expect(result.response?.ok).toBe(true)

    // DNS yalnız 1 kez soruldu (doğrulamada) — bağlantı için İKİNCİ sorgu YOK.
    expect(lookupMock).toHaveBeenCalledTimes(1)

    // Socket'e verilen lookup, DNS'e bakmadan pinli public IP'yi döndürür.
    const opts = captured[0].options
    const lookupFn = opts.lookup as (h: string, o: unknown, cb: (e: unknown, a: unknown, f?: number) => void) => void
    let connectedTo: unknown
    lookupFn('rebind-saldiri.com', {}, (_e, addr) => { connectedTo = addr })
    expect(connectedTo).toBe('104.16.1.1') // private 10.0.0.5 DEĞİL

    // Host/SNI hostname'den korunur; URL değişmedi.
    expect(captured[0].url.hostname).toBe('rebind-saldiri.com')
    expect(opts.servername).toBe('rebind-saldiri.com')
  })

  it('private hedefe redirect eden zincir hop\'ta kesilir (2. istek hiç yapılmaz)', async () => {
    lookupMock.mockResolvedValue([{ address: '104.16.1.1', family: 4 }])
    responseQueue = [{ status: 302, location: 'http://192.168.1.1/gizli' }]

    const result = await guardedFetch('https://temiz-gorunen.com')
    expect(result.response).toBeNull()
    if ('blocked' in result) expect(result.blocked).toContain('IP-literal')
    expect(captured).toHaveLength(1) // private hedefe istek HİÇ açılmadı
  })

  it('her redirect hop\'u yeniden doğrulanır VE yeniden pinlenir', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '104.16.1.1', family: 4 }]) // hop 1
      .mockResolvedValueOnce([{ address: '95.216.1.1', family: 4 }]) // hop 2
    responseQueue = [
      { status: 301, location: 'https://www.temiz.com' },
      { status: 200, body: '<html>ok</html>' },
    ]

    const result = await guardedFetch('https://temiz.com')
    expect(result.response?.status).toBe(200)
    expect(result.response?.body).toContain('ok')
    expect(result.finalUrl).toBe('https://www.temiz.com/')
    expect(captured).toHaveLength(2)

    // Hop 2 kendi doğrulanmış IP'sine pinli.
    const hop2Lookup = captured[1].options.lookup as (h: string, o: unknown, cb: (e: unknown, a: unknown) => void) => void
    let hop2Ip: unknown
    hop2Lookup('www.temiz.com', {}, (_e, addr) => { hop2Ip = addr })
    expect(hop2Ip).toBe('95.216.1.1')
  })

  it('redirect limiti aşılırsa kesilir', async () => {
    lookupMock.mockResolvedValue([{ address: '104.16.1.1', family: 4 }])
    responseQueue = Array.from({ length: 10 }, () => ({ status: 301, location: 'https://sonsuz-dongu.com/a' }))

    const result = await guardedFetch('https://sonsuz-dongu.com', {}, { maxRedirects: 3 })
    expect(result.response).toBeNull()
    if ('blocked' in result) expect(result.blocked).toContain('Redirect limiti')
  })
})
