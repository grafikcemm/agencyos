import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from '@/lib/session'
import { rateLimit, clientIp } from '@/lib/api/rateLimit'

// Yalnız izole E2E'de açık parola modeli → brute-force koruması yine zorunlu.
// IP başına 15 dk'da 8 deneme.
// E2E suite'i tek IP'den ~10+ BAŞARILI login yapar (her spec ayrı oturum) —
// LOGIN_RATE_LIMIT env'i YALNIZ izole test ortamında yükseltilir
// (playwright.config webServer env). Varsayılan (prod) 8 KALIR.
const LOGIN_LIMIT = Math.max(1, Number(process.env.LOGIN_RATE_LIMIT ?? '') || 8)
const LOGIN_WINDOW_MS = 15 * 60 * 1000

// POST /api/auth/login — E2E-only password → httpOnly session cookie.
export async function POST(req: Request) {
  // Eski paylaşımlı parola yolu üretimde kapalıdır. Yalnızca izole Playwright
  // ortamı bu flag'i açık verir; gerçek deploy hiçbir koşulda parola kabul etmez.
  if (process.env.E2E_PASSWORD_AUTH !== 'true') {
    return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })
  }

  const ip = clientIp(req)
  const rl = rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)
  if (!rl.allowed) {
    console.warn(`Login rate-limit aşıldı: ip=${ip}`)
    return NextResponse.json(
      { error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let password = ''
  try {
    const body = await req.json()
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  let ok = false
  try {
    ok = await verifyPassword(password)
  } catch (error) {
    // Missing APP_PASSWORD / APP_SESSION_SECRET is a server misconfiguration,
    // not a client error — surface it as 500 so it is noticed during setup.
    console.error('Login config error:', (error as Error).message)
    return NextResponse.json(
      { error: 'Sunucu yapılandırması hatası.' },
      { status: 500 },
    )
  }

  if (!ok) {
    console.warn(`Başarısız login denemesi: ip=${ip}`)
    return NextResponse.json({ error: 'Hatalı parola.' }, { status: 401 })
  }

  const token = await createSessionToken()
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}
