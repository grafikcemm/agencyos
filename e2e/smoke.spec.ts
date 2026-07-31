import { test, expect, type Page } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'

// Faz 0.2 — full-app smoke gate: bütün kanonik ekranlar production build'e karşı
// gezilir. Kurallar:
//   - her navigation 2xx/3xx döner
//   - uygulamanın kendi origin'inde beklenmeyen 4xx/5xx response = FAIL
//   - pageerror (yakalanmamış exception) = FAIL
//   - beklenmeyen console.error = FAIL
// Bilinçli istisnalar ALLOWLIST'te gerekçeli tutulur.

const SCREENS = [
  '/bugun',
  '/konsol',
  '/pipeline',
  '/firsatlar',
  '/harita',
  '/projects',
  '/services',
  '/agents',
  '/asistan',
  '/bilgi',
  '/command-center',
  '/dashboard',
  '/icraat-firsatlari',
  '/kariyer',
  '/schedule',
  '/settings',
  '/tasks',
  '/gorevler',
  '/aliskanliklar',
  '/akademi',
  '/finans',
  '/gelisim',
  '/kutuphane',
]

// Aynı origin'de MÜSAADE EDİLEN response'lar — her girişin gerekçesi zorunlu.
const RESPONSE_ALLOWLIST: Array<{ pattern: RegExp; status?: number; reason: string }> = [
  { pattern: /\/favicon\.ico$/, status: 404, reason: 'favicon opsiyonel; app icon route kullanmıyor' },
  {
    pattern: /\/api\/(life|finans|habits)\//,
    reason:
      'LIFE DB endpointleri: test ortamında LIFE_* env yok (LIFE DB izole tutulur, teste bağlanmaz); ekranlar kendi hata state’lerini gösterir',
  },
  {
    pattern: /\/api\/knowledge\?file=/,
    status: 404,
    reason:
      'İzole test DB’de knowledge_docs seed edilmemiş. Route sözleşmesi: doküman yok → 404 {content:\'\'}. /bilgi eksik dokümanı boş-state ile ele alır (crash yok — pageerror/console.error ihlali oluşmaz)',
  },
]

// Console.error allowlist — app-seviyesi (JS) console.error için.
// NOT: tarayıcının ürettiği "Failed to load resource" mesajları BURADA ele
// alınmaz — onlar her zaman bir response event ile eşleşir ve RESPONSE_ALLOWLIST
// (URL-farkında, otoriter gate) tarafından yargılanır. Böylece bir HTTP hatası
// yalnız gerçek kaynak-URL'sine göre değerlendirilir, gevşek metin eşleşmesiyle
// değil. Bu handler sadece uygulamanın kendi console.error çağrılarını yakalar.
const CONSOLE_ALLOWLIST: Array<{ pattern: RegExp; reason: string }> = [
  {
    // /harita client fetch'i (leads/person_leads) otomatik-hızlı navigasyon altında
    // ele-alınmış catch'e düşüp bu mesajı basar. HTTP ihlali DEĞİL (RESPONSE gate temiz —
    // /api/db/* 500/4xx dönmüyor) ve uncaught DEĞİL (pageerror yok); harita boş-state ile
    // graceful degrade eder. Otoriter HTTP-hata tespiti response gate'te; bu yalnız
    // handled-fallback log gürültüsü. Kaynak: src/app/(os)/harita/page.tsx.
    pattern: /^(Lead|Person lead) fetch error$/,
    reason: 'harita handled-catch fallback logu (HTTP ihlali değil — response gate otoriter)',
  },
]

// Tarayıcı kaynak-yükleme hataları response event'inde yargılanır; console'da yok say.
const BROWSER_RESOURCE_ERROR = /^Failed to load resource:/i

interface Violation {
  screen: string
  kind: 'response' | 'pageerror' | 'console'
  detail: string
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByRole('textbox').fill(E2E_PASSWORD)
  await page.getByRole('button').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

test('full-app smoke: tüm kanonik ekranlar hatasız açılır', async ({ page, baseURL }) => {
  test.setTimeout(240_000)
  const origin = new URL(baseURL ?? 'http://localhost:3200').origin
  const violations: Violation[] = []
  let currentScreen = '(login)'

  page.on('response', (res) => {
    const url = res.url()
    if (!url.startsWith(origin)) return
    if (res.status() < 400) return
    const path = url.slice(origin.length)
    const allowed = RESPONSE_ALLOWLIST.some(
      (a) => a.pattern.test(path) && (a.status === undefined || a.status === res.status()),
    )
    if (!allowed) {
      violations.push({ screen: currentScreen, kind: 'response', detail: `${res.status()} ${path}` })
    }
  })
  page.on('pageerror', (err) => {
    violations.push({ screen: currentScreen, kind: 'pageerror', detail: String(err.message).slice(0, 300) })
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Kaynak-yükleme hataları response handler'da (URL-farkında) yargılanır.
    if (BROWSER_RESOURCE_ERROR.test(text)) return
    if (CONSOLE_ALLOWLIST.some((a) => a.pattern.test(text))) return
    violations.push({ screen: currentScreen, kind: 'console', detail: text.slice(0, 300) })
  })

  await login(page)

  for (const screen of SCREENS) {
    currentScreen = screen
    const res = await page.goto(screen, { waitUntil: 'load' })
    expect(res, `${screen}: response yok`).toBeTruthy()
    // goto redirect zincirini takip eder; nihai status 2xx olmalı (3xx zincir içinde OK)
    expect(res!.status(), `${screen}: nihai status ${res!.status()}`).toBeLessThan(400)
    // Client tarafı sakinleşsin ki geç gelen API hataları da yakalansın
    await page.waitForLoadState('networkidle').catch(() => {})
  }

  const report = violations
    .map((v) => `[${v.screen}] ${v.kind}: ${v.detail}`)
    .join('\n')
  expect(violations, `Smoke ihlalleri (${violations.length}):\n${report}`).toEqual([])
})

test('ana giriş ve sidebar yalnız günlük çalışma yüzeylerini gösterir', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('textbox').fill(E2E_PASSWORD)
  await page.getByRole('button').click()
  await expect(page).toHaveURL(/\/command-center$/)

  await page.goto('/')
  await expect(page).toHaveURL(/\/command-center$/)

  const visibleLinks = [
    'Ana Merkez',
    'Bugün',
    'Aktif Görevler',
    'Alışkanlıklar',
    'Lead Radar',
    'Fırsatlar',
    'Pipeline',
    // RT-A6: deney kokpiti ve kariyer yüzeyi artık günlük navigasyonda.
    'Deneyler',
    'Projeler',
    'Kariyer',
    'Gelişim',
    'Finans',
    'Asistan',
    'Hizmetlerim',
    'Ayarlar',
  ]
  for (const name of visibleLinks) {
    await expect(page.getByRole('link', { name, exact: true }), `${name} sidebar'da görünmeli`).toHaveCount(1)
  }

  const backgroundRoutes = [
    'Ajanlar',
    'Konsol',
    'Zamanlanmış İşler',
    'Bilgi Hazinesi',
    'Akademi',
    'Kütüphane',
    'Kariyer Radarı',
  ]
  for (const name of backgroundRoutes) {
    await expect(page.getByRole('link', { name, exact: true }), `${name} günlük sidebar'da görünmemeli`).toHaveCount(0)
  }

  await expect(page.getByRole('link', { name: 'Bugünü İşle', exact: true })).toHaveAttribute('href', '/bugun')

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/command-center$/)
})
