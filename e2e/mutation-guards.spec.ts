import { test, expect } from '@playwright/test'
import { E2E_OPERATOR_TOKEN } from '../playwright.config'

// Faz 0.3 — mutation güvenlik standardı kanıtı (finding #13/#14):
//   1. Yetkisiz istek (auth yok) → 401
//   2. Cross-origin çerez/istek (Origin başka host) geçerli Bearer'la bile → 403
// State-değiştiren route'lar bu iki kapıdan geçmeden hiçbir mutasyona ulaşamaz.
// Not: seed/cleanup YOK — her iki senaryo da DB'ye YAZMADAN reddedilir (kanıt: 403/401
// gövdeye ulaşmadan döner). Bu yüzden izole test DB'de kalıntı bırakmaz.

const BEARER = { authorization: `Bearer ${E2E_OPERATOR_TOKEN}`, 'content-type': 'application/json' }

// Temsilci mutation route'lar: biri requireApiUser (db proxy), biri requireApiAccess.
const MUTATION_ROUTES = [
  { method: 'POST' as const, path: '/api/db/leads', body: { business_name: 'guard-test' } },
  { method: 'POST' as const, path: '/api/leads/scan', body: {} },
  { method: 'POST' as const, path: '/api/memory', body: { fact: 'x' } },
  { method: 'POST' as const, path: '/api/jobs/scan', body: {} },
]

test.describe('mutation güvenlik kapıları', () => {
  for (const r of MUTATION_ROUTES) {
    test(`${r.path}: auth yok → 401`, async ({ request }) => {
      const res = await request.fetch(r.path, {
        method: r.method,
        headers: { 'content-type': 'application/json' }, // Bearer YOK, cookie YOK
        data: r.body,
      })
      expect(res.status(), `${r.path} yetkisizken 401 bekleniyor`).toBe(401)
    })

    test(`${r.path}: cross-origin + geçerli Bearer → 403`, async ({ request }) => {
      const res = await request.fetch(r.path, {
        method: r.method,
        headers: { ...BEARER, origin: 'https://evil.example' },
        data: r.body,
      })
      expect(res.status(), `${r.path} cross-origin'de 403 bekleniyor`).toBe(403)
    })
  }

  test('same-origin + Bearer: origin kapısını geçer (401/403 DEĞİL)', async ({ request, baseURL }) => {
    // db/leads POST: aynı origin + geçerli Bearer → guard'lar geçilir; sonuç mutasyon
    // (200/201) VEYA doğrulama (400) olabilir ama ASLA 401/403 olmaz.
    const origin = new URL(baseURL ?? 'http://localhost:3200').origin
    const res = await request.fetch('/api/db/memories', {
      method: 'POST',
      headers: { ...BEARER, origin },
      data: { fact: 'guard-pozitif-kontrol' },
    })
    expect([401, 403]).not.toContain(res.status())
    // Yazıldıysa temizle (izole test DB — kalıntı bırakma).
    if (res.ok()) {
      const rows = (await res.json()) as Array<{ id?: string }>
      const id = Array.isArray(rows) ? rows[0]?.id : undefined
      if (id) {
        await request.fetch(`/api/db/memories?id=${id}`, { method: 'DELETE', headers: { ...BEARER, origin } })
      }
    }
  })
})
