// Lightweight single-operator session: an HMAC-signed token stored in an
// httpOnly cookie. Edge- AND Node-compatible: uses only Web Crypto
// (globalThis.crypto.subtle) so the same helpers run in the proxy (Edge
// runtime) and in route handlers (Node runtime). Imported by server code only
// (proxy, auth helpers, /api/auth routes) — never by a client component.

export const SESSION_COOKIE_NAME = 'agencyos_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 gün
const TOKEN_VERSION = 'v1'

const encoder = new TextEncoder()

function getSecret(): string {
  const secret = process.env.APP_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('APP_SESSION_SECRET ayarlı değil veya çok kısa (min 32 karakter).')
  }
  return secret
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return base64UrlEncode(signature)
}

// Constant-time comparison to avoid timing side-channels on token/password checks.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// Token format: `v1.<expiresAtUnixSeconds>.<base64urlHmac>`
export async function createSessionToken(
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds
  const payload = `${TOKEN_VERSION}.${expiresAt}`
  const signature = await sign(payload)
  return `${payload}.${signature}`
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [version, expiresAtRaw, signature] = parts
  if (version !== TOKEN_VERSION) return false
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return false
  const expected = await sign(`${version}.${expiresAtRaw}`)
  return timingSafeEqual(signature, expected)
}

// Constant-time password check against APP_PASSWORD. Both sides are hashed to
// fixed-length HMACs first so the comparison never leaks the password length.
export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD
  if (!expected) {
    throw new Error('APP_PASSWORD ayarlı değil.')
  }
  if (typeof input !== 'string' || input.length === 0) return false
  const [inputHash, expectedHash] = await Promise.all([sign(`pw:${input}`), sign(`pw:${expected}`)])
  return timingSafeEqual(inputHash, expectedHash)
}
