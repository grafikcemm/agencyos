import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const lookupMock = vi.fn()
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}))

// Pinli HTTP katmanı mock'u (urlGuard artık fetch değil node:http(s) kullanır).
let responseQueue: Array<{ status: number; location?: string; body?: string }> = []
function fakeRequest(_url: URL, _options: Record<string, unknown>, cb: (res: unknown) => void) {
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

import { collectEvidence, countVerified, detectTechStack, analyzeCtas, CandidateInput } from './evidenceCollector'
import type { PsiResult } from './psi'

const CANDIDATE: CandidateInput = {
  businessName: 'Test Klinik',
  sector: 'health_clinic',
  website: 'https://test-klinik.com',
  phone: '+90 555 000 0000',
  rating: 4.2,
  reviewCount: 87,
  googlePlaceId: 'place_abc',
}

const PSI_OK: PsiResult = {
  ok: true,
  finalUrl: 'https://test-klinik.com/',
  metrics: { performanceScore: 35, lcpMs: 5200, cls: 0.3, tbtMs: 900, fcpMs: 2500, speedIndexMs: 6000 },
  screenshot: { mime: 'image/jpeg', base64: '/9j/FAKE=' },
}

function stubHtml(html: string, status = 200) {
  lookupMock.mockResolvedValue([{ address: '104.16.1.1', family: 4 }])
  responseQueue = [{ status, body: html }]
}

describe('detectTechStack / analyzeCtas (saf)', () => {
  it('teknoloji izlerini bulur', () => {
    expect(detectTechStack('<link href="/wp-content/a.css">')).toContain('wordpress')
    expect(detectTechStack('<script src="cdn.shopify.com/x.js">')).toContain('shopify')
    expect(detectTechStack('<div>temiz sayfa</div>')).toEqual([])
  })

  it('CTA sayımları doğru', () => {
    const html = '<a href="tel:+905550000000">Ara</a><a href="https://wa.me/905550000000">WA</a><button>Randevu Al</button>'
    const ctas = analyzeCtas(html)
    expect(ctas.telLinks).toBe(1)
    expect(ctas.waLinks).toBe(1)
    expect(ctas.hasBookingCta).toBe(true)
  })
})

describe('collectEvidence', () => {
  beforeEach(() => {
    lookupMock.mockReset()
    responseQueue = []
  })

  it('tüm kaynaklar çalışınca places + review + html + cta + form + pagespeed + screenshot üretir', async () => {
    stubHtml('<html><meta name="viewport" content="w"><form></form><a href="tel:1">a</a>çok uzun içerik '.repeat(100))
    const psiRunner = vi.fn().mockResolvedValue(PSI_OK)

    const { items, notes } = await collectEvidence(CANDIDATE, { psiRunner, now: new Date('2026-07-03') })
    const kinds = items.map((i) => i.kind)
    expect(kinds).toContain('places_data')
    expect(kinds).toContain('review_signal')
    expect(kinds).toContain('html_signal')
    expect(kinds).toContain('cta_analysis')
    expect(kinds).toContain('form_analysis')
    expect(kinds).toContain('pagespeed')
    expect(kinds).toContain('screenshot')
    expect(countVerified(items)).toBeGreaterThanOrEqual(6)
    expect(notes).toHaveLength(0) // hatasız koşuda not yok
    const shot = items.find((i) => i.kind === 'screenshot')!
    expect(shot.screenshot?.base64).toBe('/9j/FAKE=')
  })

  it('PSI düşerse pagespeed/screenshot ÜRETİLMEZ + hata NOTLANIR (sessiz kayıp yok)', async () => {
    stubHtml('<html><form></form>içerik '.repeat(200))
    const psiRunner = vi.fn().mockResolvedValue({ ok: false, error: 'PSI HTTP 429' } satisfies PsiResult)

    const { items, notes } = await collectEvidence(CANDIDATE, { psiRunner, now: new Date('2026-07-03') })
    const kinds = items.map((i) => i.kind)
    expect(kinds).not.toContain('pagespeed')
    expect(kinds).not.toContain('screenshot')
    expect(kinds).toContain('places_data')
    expect(kinds).toContain('html_signal')
    // 429 gözlemlenebilir: not içinde hem işletme hem hata metni var.
    expect(notes.join(' ')).toContain('PSI başarısız')
    expect(notes.join(' ')).toContain('429')
  })

  it('PSI zaman aşımı da notlanır', async () => {
    stubHtml('<html>içerik '.repeat(200))
    const psiRunner = vi.fn().mockResolvedValue({ ok: false, error: 'PSI zaman aşımı' } satisfies PsiResult)
    const { notes } = await collectEvidence(CANDIDATE, { psiRunner, now: new Date('2026-07-03') })
    expect(notes.join(' ')).toContain('zaman aşımı')
  })

  it('PSI throw ederse koşu düşmez, istisna notlanır', async () => {
    stubHtml('<html>içerik '.repeat(200))
    const psiRunner = vi.fn().mockRejectedValue(new Error('network down'))
    const { items, notes } = await collectEvidence(CANDIDATE, { psiRunner, now: new Date('2026-07-03') })
    expect(items.length).toBeGreaterThan(0)
    expect(notes.join(' ')).toContain('PSI istisnası')
  })

  it('websitesiz aday yalnız places kanıtı alır', async () => {
    const psiRunner = vi.fn()
    const { items } = await collectEvidence({ ...CANDIDATE, website: null }, { psiRunner, now: new Date('2026-07-03') })
    expect(items.every((i) => i.source === 'google_places')).toBe(true)
    expect(psiRunner).not.toHaveBeenCalled()
  })

  it('site yüklenemezse "yüklenemedi" DOĞRULANMIŞ kanıt olarak yazılır', async () => {
    stubHtml('', 500)
    const { items } = await collectEvidence(CANDIDATE, { skipPsi: true, now: new Date('2026-07-03') })
    const htmlItem = items.find((i) => i.kind === 'html_signal')!
    expect(htmlItem.payload.fetch_failed).toBe(true)
    expect(htmlItem.verified).toBe(true)
  })

  it('SSRF-bloklu site kanıtında blok nedeni görünür', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    const { items } = await collectEvidence(CANDIDATE, { skipPsi: true, now: new Date('2026-07-03') })
    const htmlItem = items.find((i) => i.kind === 'html_signal')!
    expect(htmlItem.payload.fetch_failed).toBe(true)
    expect(String(htmlItem.payload.reason)).toContain('Private IP')
  })
})
