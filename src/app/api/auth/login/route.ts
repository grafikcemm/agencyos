import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from '@/lib/session'

// POST /api/auth/login — single shared password → httpOnly session cookie.
export async function POST(req: Request) {
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
