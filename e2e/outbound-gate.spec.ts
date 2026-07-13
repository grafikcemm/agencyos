import { test, expect } from '@playwright/test'
import { AUTH_HEADERS, seedDraft, cleanupE2E } from './helpers'

// Faz 1.1/1.2 — canonical outbound gate API'si: kanıtsız iddialı metin hiçbir
// yüzeyde (drawer copy, wa.me prefill) 'gönderilebilir' sayılamaz.

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await cleanupE2E()
})

test('kanıtsız iddialar bloklanır: %, süre, X-katı, davranış iddiası → CLAIM_WITHOUT_EVIDENCE + fix aksiyonu', async ({ request }) => {
  const lead = await seedDraft('gate-blok')
  const res = await request.post('/api/outbound/gate', {
    headers: AUTH_HEADERS,
    data: {
      leadId: lead.leadId,
      items: [
        { key: 'k1', kind: 'first_message', text: 'Merhaba, randevularınızı %35 artırabiliriz. 15 dakika uygun musunuz?' },
        { key: 'k2', kind: 'first_message', text: 'Merhaba, 90 günde yorum sayınızı 3 katına çıkarmak mümkün. Görüşelim mi?' },
        { key: 'k3', kind: 'first_message', text: 'Merhaba, müşterileriniz geç yanıt alınca rakibe geçiyor. Görüşelim mi?' },
      ],
    },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
  for (const key of ['k1', 'k2', 'k3']) {
    expect(body.results[key].ok, key).toBe(false)
    const codes = body.results[key].violations.map((v: { code: string }) => v.code)
    expect(codes, key).toContain('CLAIM_WITHOUT_EVIDENCE')
    expect(body.results[key].violations[0].fix, key).toBeTruthy()
  }
})

test('iddiasız + bağlamlı + tek CTA metin kapıdan geçer', async ({ request }) => {
  const lead = await seedDraft('gate-temiz')
  const businessName = `E2E Test İşletmesi gate-temiz (e2e-sprint-p0)`
  const res = await request.post('/api/outbound/gate', {
    headers: AUTH_HEADERS,
    data: {
      leadId: lead.leadId,
      items: [
        {
          key: 'ok1',
          kind: 'first_message',
          text: `Merhaba, ${businessName} Instagram menü linki kırık görünüyor. Kısa bir görüşme ister misiniz?`,
        },
      ],
    },
  })
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.results.ok1.ok).toBe(true)
})

test('auth olmadan gate çağrılamaz', async ({ request }) => {
  const res = await request.post('/api/outbound/gate', {
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3200' },
    data: { leadId: '00000000-0000-0000-0000-000000000000', items: [{ key: 'x', kind: 'pitch', text: 'selam' }] },
  })
  expect(res.status()).toBeGreaterThanOrEqual(401)
})
