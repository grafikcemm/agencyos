import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_AUTH_SCOPES,
  buildGoogleAuthUrl,
  createGoogleAuthPkce,
  createGoogleAuthState,
  exchangeGoogleAuthCode,
  fetchGoogleIdentity,
  resolveGoogleAuthConfig,
  verifyGoogleAuthState,
} from './googleAuth'

const SECRET = 'google-auth-test-secret-en-az-32-karakter-uzun'
const CONFIG = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://agency.example/api/auth/google/callback',
  allowedEmail: 'info@grafikcem.com',
}

beforeEach(() => {
  vi.stubEnv('APP_SESSION_SECRET', SECRET)
  vi.stubEnv('NODE_ENV', 'test')
})

afterEach(() => vi.unstubAllEnvs())

describe('Google giriş state ve PKCE', () => {
  it('state imzalı ve süreli; kurcalama ve expiry reddedilir', () => {
    const now = 1_000_000
    const { state } = createGoogleAuthState(now)
    expect(verifyGoogleAuthState(state, now)).toBe(true)
    const [nonce, expiry, signature] = state.split('.')
    const tampered = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`
    expect(verifyGoogleAuthState(`${nonce}.${expiry}.${tampered}`, now)).toBe(false)
    expect(verifyGoogleAuthState(state, Number(expiry) + 1)).toBe(false)
    expect(verifyGoogleAuthState('bozuk')).toBe(false)
    expect(verifyGoogleAuthState(`.${expiry}.${signature}`, now)).toBe(false)
    expect(verifyGoogleAuthState(`${nonce}.sayi-degil.${signature}`, now)).toBe(false)
  })

  it('oturum secret’ı eksik veya kısa ise imzasız state üretmez', () => {
    vi.stubEnv('APP_SESSION_SECRET', 'kisa')
    expect(() => createGoogleAuthState()).toThrow(/APP_SESSION_SECRET/)
  })

  it('PKCE challenge verifier SHA-256 özetidir', async () => {
    const { verifier, challenge } = createGoogleAuthPkce()
    const { createHash } = await import('node:crypto')
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })
})

describe('Google giriş yapılandırması ve URL', () => {
  it('eksik provider env fail-closed; varsayılan operatör e-postası kullanılır', () => {
    expect(resolveGoogleAuthConfig('https://agency.example').ok).toBe(false)
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
    const resolved = resolveGoogleAuthConfig('https://agency.example')
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.config.allowedEmail).toBe('info@grafikcem.com')
    expect(resolved.config.redirectUri).toBe('https://agency.example/api/auth/google/callback')
  })

  it('bozuk callback, bozuk e-posta ve production HTTP callback reddedilir', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
    vi.stubEnv('AUTH_GOOGLE_REDIRECT_URI', 'geçersiz-url')
    expect(resolveGoogleAuthConfig('https://agency.example').ok).toBe(false)

    vi.stubEnv('AUTH_GOOGLE_REDIRECT_URI', 'https://agency.example/callback')
    vi.stubEnv('APP_AUTH_EMAIL', 'geçersiz')
    expect(resolveGoogleAuthConfig('https://agency.example').ok).toBe(false)

    vi.stubEnv('APP_AUTH_EMAIL', CONFIG.allowedEmail)
    vi.stubEnv('AUTH_GOOGLE_REDIRECT_URI', 'http://agency.example/callback')
    vi.stubEnv('NODE_ENV', 'production')
    expect(resolveGoogleAuthConfig('https://agency.example').ok).toBe(false)
  })

  it('URL yalnız kimlik scope’larını, PKCE’yi ve hesap ipucunu içerir', () => {
    const url = new URL(buildGoogleAuthUrl(CONFIG, 'STATE', 'CHALLENGE'))
    expect(url.searchParams.get('scope')).toBe(GOOGLE_AUTH_SCOPES.join(' '))
    expect(url.searchParams.get('scope')).not.toContain('gmail')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('login_hint')).toBe(CONFIG.allowedEmail)
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
  })
})

describe('Google token ve kimlik doğrulaması', () => {
  it('authorization code PKCE ile access token’a çevrilir', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access-1' }), { status: 200 }),
    )
    const result = await exchangeGoogleAuthCode(CONFIG, 'code-1', 'verifier-1', fakeFetch as typeof fetch)
    expect(result).toEqual({ ok: true, accessToken: 'access-1' })
    const sent = new URLSearchParams(String(fakeFetch.mock.calls[0][1].body))
    expect(sent.get('code_verifier')).toBe('verifier-1')
    expect(sent.get('redirect_uri')).toBe(CONFIG.redirectUri)
  })

  it('doğrulanmış ve allowlist’teki hesap kabul edilir', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sub: 'google-user-1', email: 'INFO@GRAFIKCEM.COM', email_verified: true }), { status: 200 }),
    )
    const result = await fetchGoogleIdentity('access-1', CONFIG.allowedEmail, fakeFetch as typeof fetch)
    expect(result).toEqual({
      ok: true,
      identity: { subject: 'google-user-1', email: CONFIG.allowedEmail },
    })
  })

  it('yanlış hesap, doğrulanmamış e-posta ve provider hatası fail-closed', async () => {
    const wrongAccount = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sub: 'u1', email: 'other@example.com', email_verified: true }), { status: 200 }),
    )
    expect((await fetchGoogleIdentity('a', CONFIG.allowedEmail, wrongAccount as typeof fetch)).ok).toBe(false)

    const unverified = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sub: 'u1', email: CONFIG.allowedEmail, email_verified: false }), { status: 200 }),
    )
    expect((await fetchGoogleIdentity('a', CONFIG.allowedEmail, unverified as typeof fetch)).ok).toBe(false)

    const tokenFailure = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    expect((await exchangeGoogleAuthCode(CONFIG, 'c', 'v', tokenFailure as typeof fetch)).ok).toBe(false)
  })

  it('token ve userinfo ağ hataları fail-closed', async () => {
    const networkFailure = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const tokenResult = await exchangeGoogleAuthCode(CONFIG, 'c', 'v', networkFailure as typeof fetch)
    expect(tokenResult.ok).toBe(false)
    if (!tokenResult.ok) expect(tokenResult.error).toContain('ulaşılamadı')

    const identityResult = await fetchGoogleIdentity('a', CONFIG.allowedEmail, networkFailure as typeof fetch)
    expect(identityResult.ok).toBe(false)
    if (!identityResult.ok) expect(identityResult.error).toContain('ulaşılamadı')
  })

  it('provider geçersiz JSON veya eksik kimlik döndürürse reddedilir', async () => {
    const invalidJson = vi.fn().mockResolvedValue(new Response('JSON-DEĞİL', { status: 200 }))
    expect((await exchangeGoogleAuthCode(CONFIG, 'c', 'v', invalidJson as typeof fetch)).ok).toBe(false)
    expect((await fetchGoogleIdentity('a', CONFIG.allowedEmail, invalidJson as typeof fetch)).ok).toBe(false)
  })
})
