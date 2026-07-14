// GET /api/gmail/oauth/callback — Google consent dönüşü (FINALIZATION Faz 7).
// state (HMAC+TTL) + PKCE doğrulanır → code token'a çevrilir → scope'lar
// POZİTİF allowlist'ten geçer (dışına taşan grant FAIL-CLOSED reddedilir) →
// refresh token Supabase Vault'a yazılır (düz metin tablo/log YOK).
// GERÇEK token değişimi yalnız kullanıcı consent'i tamamlarsa yaşanır.
import { NextResponse } from 'next/server'
import { exchangeCodeForTokens, resolveOAuthEnv, verifyOAuthState } from '@/lib/gmail/oauth'
import { checkGrantedScopes } from '@/lib/outreach/gmailScopes'
import { storeGmailTokens } from '@/lib/gmail/tokenVault'

function redirectWith(req: Request, param: string): NextResponse {
  const url = new URL('/ayarlar', new URL(req.url).origin)
  url.searchParams.set('gmail', param)
  const res = NextResponse.redirect(url, 302)
  res.cookies.set('gmail_pkce_verifier', '', { httpOnly: true, path: '/api/gmail/oauth', maxAge: 0 })
  return res
}

export async function GET(req: Request) {
  const env = resolveOAuthEnv()
  if (!env.ok) return NextResponse.json({ success: false, error: env.error }, { status: 503 })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  if (oauthError) return redirectWith(req, `reddedildi:${oauthError}`)
  if (!code || !state) return redirectWith(req, 'eksik-parametre')

  if (!verifyOAuthState(state)) {
    console.warn('[gmail-oauth] geçersiz/expired state — CSRF veya süre aşımı')
    return redirectWith(req, 'gecersiz-state')
  }

  const cookies = req.headers.get('cookie') ?? ''
  const verifier = cookies.match(/gmail_pkce_verifier=([^;]+)/)?.[1]
  if (!verifier) return redirectWith(req, 'pkce-eksik')

  const exchanged = await exchangeCodeForTokens(env.env, code, verifier)
  if (!exchanged.ok || !exchanged.refreshToken) {
    console.error('[gmail-oauth] token değişimi başarısız:', exchanged.error)
    return redirectWith(req, 'token-degisimi-basarisiz')
  }

  // Scope fail-closed: allowlist dışı grant → token SAKLANMAZ.
  const scopes = checkGrantedScopes(exchanged.grantedScopes ?? [])
  if (!scopes.ok) {
    console.error('[gmail-oauth] allowlist dışı scope reddedildi:', scopes.disallowed.join(','))
    return redirectWith(req, 'scope-reddedildi')
  }

  const stored = await storeGmailTokens({
    emailAddress: exchanged.emailAddress ?? 'unknown@unknown',
    refreshToken: exchanged.refreshToken,
    grantedScopes: exchanged.grantedScopes ?? [],
  })
  if (!stored.ok) {
    console.error('[gmail-oauth] vault yazımı başarısız:', stored.error)
    return redirectWith(req, 'vault-hatasi')
  }
  return redirectWith(req, 'bagli')
}
