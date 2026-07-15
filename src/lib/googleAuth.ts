import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const GOOGLE_AUTH_STATE_TTL_MS = 10 * 60 * 1000
export const GOOGLE_AUTH_HTTP_TIMEOUT_MS = 12_000
export const DEFAULT_OPERATOR_EMAIL = 'info@grafikcem.com'
export const GOOGLE_AUTH_SCOPES = ['openid', 'email', 'profile'] as const
export const GOOGLE_AUTH_STATE_COOKIE = 'agencyos_google_auth_state'
export const GOOGLE_AUTH_PKCE_COOKIE = 'agencyos_google_auth_pkce'

export interface GoogleAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  allowedEmail: string
}

export interface GoogleAuthState {
  state: string
  expiresAtMs: number
}

export interface GoogleAuthPkce {
  verifier: string
  challenge: string
}

export interface GoogleIdentity {
  subject: string
  email: string
}

function stateSecret(): string {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('APP_SESSION_SECRET eksik veya kısa; Google giriş state imzalanamaz.')
  }
  return secret
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GOOGLE_AUTH_HTTP_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function createGoogleAuthState(nowMs: number = Date.now()): GoogleAuthState {
  const nonce = base64Url(randomBytes(24))
  const expiresAtMs = nowMs + GOOGLE_AUTH_STATE_TTL_MS
  const payload = `${nonce}.${expiresAtMs}`
  const signature = createHmac('sha256', stateSecret()).update(payload).digest('hex')
  return { state: `${payload}.${signature}`, expiresAtMs }
}

export function verifyGoogleAuthState(state: string, nowMs: number = Date.now()): boolean {
  const [nonce, expiresAtRaw, signature, extra] = state.split('.')
  if (!nonce || !expiresAtRaw || !signature || extra !== undefined) return false
  if (!/^\d+$/.test(expiresAtRaw) || Number(expiresAtRaw) < nowMs) return false
  const expected = createHmac('sha256', stateSecret())
    .update(`${nonce}.${expiresAtRaw}`)
    .digest('hex')
  return safeEqual(signature, expected)
}

export function createGoogleAuthPkce(): GoogleAuthPkce {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function resolveGoogleAuthConfig(origin: string):
  | { ok: true; config: GoogleAuthConfig }
  | { ok: false; error: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  const allowedEmail = (process.env.APP_AUTH_EMAIL?.trim() || DEFAULT_OPERATOR_EMAIL).toLowerCase()
  const redirectUri = process.env.AUTH_GOOGLE_REDIRECT_URI?.trim()
    || new URL('/api/auth/google/callback', origin).toString()

  const missing = [!clientId && 'GOOGLE_CLIENT_ID', !clientSecret && 'GOOGLE_CLIENT_SECRET']
    .filter(Boolean)
  if (missing.length > 0) {
    return { ok: false, error: `Google giriş env eksik: ${missing.join(', ')}` }
  }

  let parsedRedirect: URL
  try {
    parsedRedirect = new URL(redirectUri)
  } catch {
    return { ok: false, error: 'AUTH_GOOGLE_REDIRECT_URI geçerli bir URL değil.' }
  }
  if (!allowedEmail.includes('@')) {
    return { ok: false, error: 'APP_AUTH_EMAIL geçerli bir e-posta değil.' }
  }
  if (process.env.NODE_ENV === 'production' && parsedRedirect.protocol !== 'https:') {
    return { ok: false, error: 'Üretimde Google giriş callback adresi HTTPS olmalı.' }
  }

  return {
    ok: true,
    config: { clientId: clientId!, clientSecret: clientSecret!, redirectUri, allowedEmail },
  }
}

export function buildGoogleAuthUrl(
  config: GoogleAuthConfig,
  state: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_AUTH_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
    login_hint: config.allowedEmail,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleAuthCode(
  config: GoogleAuthConfig,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
        }),
      },
    )
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError'
    return { ok: false, error: timeout ? 'Google token isteği zaman aşımına uğradı.' : 'Google token servisine ulaşılamadı.' }
  }

  const body = await response.json().catch(() => null) as { access_token?: string; error?: string } | null
  if (!response.ok || !body?.access_token) {
    return { ok: false, error: `Google token değişimi başarısız (${response.status}): ${body?.error ?? 'access_token yok'}` }
  }
  return { ok: true, accessToken: body.access_token }
}

export async function fetchGoogleIdentity(
  accessToken: string,
  allowedEmail: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; identity: GoogleIdentity } | { ok: false; error: string }> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError'
    return { ok: false, error: timeout ? 'Google kimlik doğrulaması zaman aşımına uğradı.' : 'Google kimlik servisine ulaşılamadı.' }
  }

  const body = await response.json().catch(() => null) as {
    sub?: string
    email?: string
    email_verified?: boolean
  } | null
  const email = body?.email?.trim().toLowerCase()
  if (!response.ok || !body?.sub || body.email_verified !== true || !email) {
    return { ok: false, error: 'Google hesabının e-posta kimliği doğrulanamadı.' }
  }
  if (email !== allowedEmail.toLowerCase()) {
    return { ok: false, error: 'Bu Google hesabının AgencyOS erişim yetkisi yok.' }
  }
  return { ok: true, identity: { subject: body.sub, email } }
}
