// GET /api/gmail/oauth/start — Gmail OAuth consent'ine yönlendirir
// (FINALIZATION Faz 7). Minimum scope + imzalı state + PKCE S256.
// Env eksikse actionable 503 (kullanıcı aksiyonu: Google Cloud OAuth client).
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { buildConsentUrl, createOAuthState, createPkcePair, resolveOAuthEnv } from '@/lib/gmail/oauth'

export async function GET(req: Request) {
  const auth = await requireApiUser(req)
  if ('response' in auth) return auth.response

  const env = resolveOAuthEnv()
  if (!env.ok) {
    return NextResponse.json({ success: false, error: env.error }, { status: 503 })
  }

  const state = createOAuthState()
  const pkce = createPkcePair()
  const url = buildConsentUrl(env.env, state, pkce.challenge)

  const res = NextResponse.redirect(url, 302)
  // PKCE verifier YALNIZ httpOnly cookie'de — client script okuyamaz.
  res.cookies.set('gmail_pkce_verifier', pkce.verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/gmail/oauth',
    maxAge: 600,
  })
  return res
}
