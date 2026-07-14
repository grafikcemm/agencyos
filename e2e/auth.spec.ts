import { test, expect } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'
import { AUTH_HEADERS } from './helpers'

// Akış 1-2 + 9: yetkisiz API reddi · operatör girişi · flag'ler default OFF.
// Sunucu PRODUCTION modda; .env.local'daki LOCAL_OPERATOR_MODE=true burada
// HÜKÜMSÜZ olmalı — 401'ler tam da bunu kanıtlar.

test.describe('Akış 1 — yetkisiz istekler reddedilir', () => {
  const targets = ['/api/outreach', '/api/flags', '/api/db/leads', '/api/approvals']
  for (const path of targets) {
    test(`GET ${path} → 401`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(401)
    })
  }

  test('POST /api/outreach/x/request-send → 401 (iş mantığına ulaşamaz)', async ({ request }) => {
    const res = await request.post('/api/outreach/00000000-0000-0000-0000-000000000001/request-send', {
      headers: { origin: 'http://localhost:3200', 'content-type': 'application/json' },
      data: {},
    })
    expect(res.status()).toBe(401)
  })

  test('sayfa istekleri /login\'e yönlenir', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/konsol')
    await expect(page).toHaveURL(/\/login/)
  })

  test('sahte oturum cookie\'si sayfa kapısını aşamaz', async ({ context, page }) => {
    await context.addCookies([
      {
        name: 'agencyos_session',
        value: 'v1.9999999999.sahte-imza',
        url: 'http://localhost:3200',
      },
    ])

    await page.goto('/konsol')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Akış 2 — operatör girişi', () => {
  test('yanlış parola → hata; doğru parola → uygulamaya girer', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox').fill('yanlis-parola')
    await page.getByRole('button').click()
    await expect(page.getByText(/hatalı parola/i)).toBeVisible()

    await page.getByRole('textbox').fill(E2E_PASSWORD)
    await page.getByRole('button').click()
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 })
    // Oturum cookie'siyle API artık açık:
    const res = await page.request.get('/api/flags')
    expect(res.status()).toBe(200)
  })

  test('Bearer OPERATOR_API_TOKEN API erişimi verir', async ({ request }) => {
    const res = await request.get('/api/outreach', { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
  })
})

test.describe('Akış 9 — V2 bayrakları default KAPALI', () => {
  test('/api/flags: GMAIL_SEND_ENABLED + FOLLOWUP_FSM_ENABLED false', async ({ request }) => {
    const res = await request.get('/api/flags', { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const json = await res.json()
    const byKey: Record<string, boolean> = {}
    for (const f of json.data.flags as Array<{ key: string; enabled: boolean }>) byKey[f.key] = f.enabled
    expect(byKey.GMAIL_SEND_ENABLED).toBe(false)
    expect(byKey.FOLLOWUP_FSM_ENABLED).toBe(false)
  })
})
