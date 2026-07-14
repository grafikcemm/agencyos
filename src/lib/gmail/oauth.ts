// ─────────────────────────────────────────────────────────────────────────────
// Gmail OAuth yardımcıları (FINALIZATION Faz 7) — state HMAC + PKCE S256.
//
// - state: HMAC(APP_SESSION_SECRET) imzalı, TTL'li — CSRF'e kapalı.
// - PKCE: code_verifier httpOnly cookie'de; code_challenge S256.
// - Scope'lar POZİTİF allowlist (gmailScopes.ts) — consent URL'si yalnız
//   minimum scope ister; callback'te granted scope'lar yeniden doğrulanır.
// - GERÇEK token değişimi yalnız kullanıcı consent akışını tamamlarsa olur;
//   fetchImpl testlerde enjekte edilir (gerçek çağrı sıfır).
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ALLOWED_GMAIL_SCOPES } from '@/lib/outreach/gmailScopes'

export const STATE_TTL_MS = 10 * 60 * 1000

/** Google endpoint çağrıları için üst süre — asılı kalan istek fonksiyon
 *  bütçesini tüketmesin. */
export const OAUTH_HTTP_TIMEOUT_MS = 12_000

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function hmacSecret(): string {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('APP_SESSION_SECRET eksik/kısa — OAuth state imzalanamaz')
  }
  return secret
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export interface OAuthState {
  state: string
  nonce: string
  expMs: number
}

/** İmzalı state üretir: <nonce>.<expMs>.<hmac>. Nonce ayrıca tek-kullanımlık
 *  DB kaydına (gmail_oauth_states) yazılır — replay reddi callback'te. */
export function createOAuthState(nowMs: number = Date.now()): OAuthState {
  const nonce = b64url(randomBytes(16))
  const expMs = nowMs + STATE_TTL_MS
  const sig = createHmac('sha256', hmacSecret()).update(`${nonce}.${expMs}`).digest('hex')
  return { state: `${nonce}.${expMs}.${sig}`, nonce, expMs }
}

/** State'ten nonce'u ayıklar (tek-kullanımlık DB tüketimi için). Bozuksa null. */
export function extractStateNonce(state: string): string | null {
  const parts = state.split('.')
  return parts.length === 3 && parts[0] ? parts[0] : null
}

/** State doğrulama: imza + TTL. Bozuk/expired → false (fail-closed). */
export function verifyOAuthState(state: string, nowMs: number = Date.now()): boolean {
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const [nonce, exp, sig] = parts
  if (!/^\d+$/.test(exp) || Number(exp) < nowMs) return false
  const expected = createHmac('sha256', hmacSecret()).update(`${nonce}.${exp}`).digest('hex')
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface PkcePair {
  verifier: string
  challenge: string
}

/** PKCE S256 çifti. verifier httpOnly cookie'de taşınır. */
export function createPkcePair(): PkcePair {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export interface OAuthEnv {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Env guard — eksikse actionable hata (kullanıcı aksiyonu: Google Cloud config). */
export function resolveOAuthEnv():
  | { ok: true; env: OAuthEnv }
  | { ok: false; error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI
  const missing = [
    !clientId && 'GOOGLE_CLIENT_ID',
    !clientSecret && 'GOOGLE_CLIENT_SECRET',
    !redirectUri && 'GMAIL_OAUTH_REDIRECT_URI',
  ].filter(Boolean)
  if (missing.length) {
    return {
      ok: false,
      error: `OAuth env eksik: ${missing.join(', ')} — Google Cloud Console'da OAuth client oluşturup Vercel env'e ekleyin (kullanıcı aksiyonu).`,
    }
  }
  return { ok: true, env: { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri! } }
}

/** Consent URL — minimum scope + offline erişim + PKCE + imzalı state. */
export function buildConsentUrl(env: OAuthEnv, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: ALLOWED_GMAIL_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export interface TokenExchangeResult {
  ok: boolean
  refreshToken?: string
  accessToken?: string
  grantedScopes?: string[]
  error?: string
}

/** code → token değişimi (+ id_token'dan e-posta). GERÇEK ağ çağrısı —
 *  yalnız kullanıcı consent'i tamamlayınca callback'ten tetiklenir. */
export async function exchangeCodeForTokens(
  env: OAuthEnv,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchangeResult> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          redirect_uri: env.redirectUri,
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
        }),
      },
      OAUTH_HTTP_TIMEOUT_MS,
    )
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: isAbort ? 'token endpoint zaman aşımı' : `token endpoint erişilemedi: ${err instanceof Error ? err.name : 'network'}` }
  }
  const body = (await res.json().catch(() => null)) as {
    refresh_token?: string
    access_token?: string
    scope?: string
    error?: string
  } | null
  if (!res.ok || !body?.refresh_token) {
    return { ok: false, error: `token değişimi başarısız (${res.status}): ${body?.error ?? 'refresh_token yok'}` }
  }
  // NOT: hesap e-postası burada id_token'dan OKUNMAZ (imza doğrulanmamış
  // payload güvenilmez). Callback, access_token ile users.getProfile üzerinden
  // DOĞRULANMIŞ mailbox adresini alır (fetchVerifiedEmail). unknown@unknown YOK.
  return {
    ok: true,
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    grantedScopes: (body.scope ?? '').split(/\s+/).filter(Boolean),
  }
}

/**
 * DOĞRULANMIŞ hesap e-postası: access_token ile Gmail users.getProfile çağrılır
 * ve gerçek mailbox adresi (emailAddress) döner. Bu, gönderim yapılacak kutunun
 * ta kendisidir — imza doğrulanmamış id_token payload'ına güvenmekten üstün.
 * Hata/timeout/boş sonuç → fail-closed (hesap saklanamaz).
 */
export async function fetchVerifiedEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } },
      OAUTH_HTTP_TIMEOUT_MS,
    )
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: isAbort ? 'getProfile zaman aşımı' : `getProfile erişilemedi: ${err instanceof Error ? err.name : 'network'}` }
  }
  if (!res.ok) return { ok: false, error: `getProfile başarısız (${res.status})` }
  const body = (await res.json().catch(() => null)) as { emailAddress?: string } | null
  const email = body?.emailAddress?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'getProfile geçerli e-posta döndürmedi — hesap doğrulanamadı' }
  }
  return { ok: true, email }
}
