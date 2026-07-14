// GET /api/gmail/oauth/callback — Google consent dönüşü (FINALIZATION Faz 7).
// state (HMAC+TTL) + PKCE doğrulanır → code token'a çevrilir → scope'lar
// POZİTİF allowlist'ten geçer (dışına taşan grant FAIL-CLOSED reddedilir) →
// refresh token Supabase Vault'a yazılır (düz metin tablo/log YOK).
// GERÇEK token değişimi yalnız kullanıcı consent'i tamamlarsa yaşanır.
import { NextResponse } from 'next/server'
import {
  exchangeCodeForTokens,
  extractStateNonce,
  fetchVerifiedEmail,
  resolveOAuthEnv,
  verifyOAuthState,
} from '@/lib/gmail/oauth'
import { checkGrantedScopes } from '@/lib/outreach/gmailScopes'
import { consumeOAuthState, storeGmailTokens } from '@/lib/gmail/tokenVault'

function redirectWith(req: Request, param: string): NextResponse {
  const url = new URL('/settings', new URL(req.url).origin)
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

  // 1. HMAC+TTL doğrulaması (ucuz, stateless ilk savunma).
  if (!verifyOAuthState(state)) {
    console.warn('[gmail-oauth] geçersiz/expired state — CSRF veya süre aşımı')
    return redirectWith(req, 'gecersiz-state')
  }
  // 2. Tek-kullanımlık DB tüketimi (REPLAY reddi): aynı state ikinci kez gelirse
  //    consume false döner → reddet.
  const nonce = extractStateNonce(state)
  if (!nonce || !(await consumeOAuthState(nonce))) {
    console.warn('[gmail-oauth] state tüketilemedi — replay veya bilinmeyen state')
    return redirectWith(req, 'state-replay')
  }

  const cookies = req.headers.get('cookie') ?? ''
  const verifier = cookies.match(/gmail_pkce_verifier=([^;]+)/)?.[1]
  if (!verifier) return redirectWith(req, 'pkce-eksik')

  const exchanged = await exchangeCodeForTokens(env.env, code, verifier)
  if (!exchanged.ok || !exchanged.refreshToken || !exchanged.accessToken) {
    console.error('[gmail-oauth] token değişimi başarısız:', exchanged.error)
    return redirectWith(req, 'token-degisimi-basarisiz')
  }

  // 3. Scope fail-closed: allowlist dışı VEYA zorunlu (send+readonly) eksikse
  //    token SAKLANMAZ.
  const scopes = checkGrantedScopes(exchanged.grantedScopes ?? [])
  if (!scopes.ok) {
    console.error(
      '[gmail-oauth] scope reddedildi — dışı:', scopes.disallowed.join(','),
      'eksik:', scopes.missing.join(','),
    )
    return redirectWith(req, 'scope-reddedildi')
  }

  // 4. Hesap e-postasını DOĞRULA (getProfile) — unknown@unknown YOK.
  const verified = await fetchVerifiedEmail(exchanged.accessToken)
  if (!verified.ok) {
    console.error('[gmail-oauth] e-posta doğrulanamadı:', verified.error)
    return redirectWith(req, 'email-dogrulanamadi')
  }

  // 5. Tek-tx bağlama (vault + aktivasyon atomik).
  const stored = await storeGmailTokens({
    emailAddress: verified.email,
    refreshToken: exchanged.refreshToken,
    grantedScopes: exchanged.grantedScopes ?? [],
  })
  if (!stored.ok) {
    console.error('[gmail-oauth] hesap bağlanamadı:', stored.error)
    return redirectWith(req, 'vault-hatasi')
  }
  return redirectWith(req, 'bagli')
}
