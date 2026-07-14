import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createOAuthState,
  verifyOAuthState,
  extractStateNonce,
  createPkcePair,
  buildConsentUrl,
  resolveOAuthEnv,
  exchangeCodeForTokens,
  fetchVerifiedEmail,
} from './oauth'
import { ALLOWED_GMAIL_SCOPES } from '@/lib/outreach/gmailScopes'

// FINALIZATION Faz 7 — OAuth güvenlik yardımcıları. GERÇEK ağ çağrısı YOK
// (fetch enjekte edilir).

beforeEach(() => {
  vi.stubEnv('APP_SESSION_SECRET', 'test-secret-en-az-32-karakter-uzunlugunda-abc')
})
afterEach(() => vi.unstubAllEnvs())

describe('state (HMAC + TTL + nonce)', () => {
  it('üretilen state doğrulanır; kurcalanmış imza reddedilir; nonce çıkar', () => {
    const { state, nonce, expMs } = createOAuthState()
    expect(verifyOAuthState(state)).toBe(true)
    expect(extractStateNonce(state)).toBe(nonce)
    expect(typeof expMs).toBe('number')
    const [n, e, sig] = state.split('.')
    expect(verifyOAuthState(`${n}.${e}.${sig.slice(0, -2)}ab`)).toBe(false)
    expect(verifyOAuthState(`kurcalanmis.${e}.${sig}`)).toBe(false)
  })

  it('TTL geçmiş state reddedilir; bozuk format reddedilir; nonce null', () => {
    const { state } = createOAuthState(Date.now() - 11 * 60 * 1000)
    expect(verifyOAuthState(state)).toBe(false)
    expect(verifyOAuthState('tek-parca')).toBe(false)
    expect(extractStateNonce('tek-parca')).toBeNull()
  })

  it('APP_SESSION_SECRET yoksa state üretimi FIRLATIR (imzasız akış yok)', () => {
    vi.stubEnv('APP_SESSION_SECRET', '')
    expect(() => createOAuthState()).toThrow(/APP_SESSION_SECRET/)
  })
})

describe('PKCE S256', () => {
  it('verifier/challenge base64url; challenge = S256(verifier)', async () => {
    const { verifier, challenge } = createPkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    const { createHash } = await import('node:crypto')
    const expected = createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    expect(challenge).toBe(expected)
  })
})

describe('env guard + consent URL', () => {
  it('eksik env: actionable hata; tam env: minimum scope + PKCE parametreli URL', () => {
    const missing = resolveOAuthEnv()
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toContain('GOOGLE_CLIENT_ID')

    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'csec')
    vi.stubEnv('GMAIL_OAUTH_REDIRECT_URI', 'https://app.example/api/gmail/oauth/callback')
    const ok = resolveOAuthEnv()
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    const url = new URL(buildConsentUrl(ok.env, 'STATE', 'CHALLENGE'))
    expect(url.searchParams.get('scope')).toBe(ALLOWED_GMAIL_SCOPES.join(' '))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('state')).toBe('STATE')
  })
})

describe('exchangeCodeForTokens (fetch enjekte — gerçek çağrı yok)', () => {
  const ENV = { clientId: 'cid', clientSecret: 'csec', redirectUri: 'https://x/cb' }

  it('başarı: refresh + access token + scope listesi (e-posta id_token’dan OKUNMAZ)', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          refresh_token: 'rt-1',
          access_token: 'at-1',
          scope: ALLOWED_GMAIL_SCOPES.join(' '),
          id_token: 'h.payload.s',
        }),
        { status: 200 },
      ),
    )
    const r = await exchangeCodeForTokens(ENV, 'code-1', 'verifier-1', fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(true)
    expect(r.refreshToken).toBe('rt-1')
    expect(r.accessToken).toBe('at-1')
    expect((r as { emailAddress?: string }).emailAddress).toBeUndefined()
    const sent = new URLSearchParams(String(fakeFetch.mock.calls[0][1].body))
    expect(sent.get('code_verifier')).toBe('verifier-1')
    expect(sent.get('grant_type')).toBe('authorization_code')
  })

  it('refresh_token yoksa / hata durumunda ok:false (token saklanmaz)', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'x' }), { status: 200 }))
    const r = await exchangeCodeForTokens(ENV, 'c', 'v', fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    const failFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const r2 = await exchangeCodeForTokens(ENV, 'c', 'v', failFetch as unknown as typeof fetch)
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('erişilemedi')
  })
})

describe('fetchVerifiedEmail (getProfile — doğrulanmış mailbox)', () => {
  it('başarı: emailAddress küçük harfe indirilir', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ emailAddress: 'Ops@Ajans.Example' }), { status: 200 }),
    )
    const r = await fetchVerifiedEmail('at-1', fakeFetch as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, email: 'ops@ajans.example' })
    expect(fakeFetch.mock.calls[0][0]).toContain('/users/me/profile')
    expect((fakeFetch.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer at-1')
  })

  it('HTTP hatası → ok:false (fail-closed)', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
    const r = await fetchVerifiedEmail('at-1', fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
  })

  it('geçersiz/boş e-posta → ok:false', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ emailAddress: 'gecersiz' }), { status: 200 }))
    const r = await fetchVerifiedEmail('at-1', fakeFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
  })

  it('ağ hatası → ok:false', async () => {
    const failFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const r = await fetchVerifiedEmail('at-1', failFetch as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('erişilemedi')
  })
})
