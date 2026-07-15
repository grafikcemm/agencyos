import 'server-only'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { SESSION_COOKIE_NAME, verifySessionToken, timingSafeEqual } from '@/lib/session'

// Single-operator auth, fail-closed in production.
//
// A request is authorized when ONE of these holds:
//  1. Valid HMAC-signed session cookie (production'da Google OAuth callback'i,
//     izole E2E'de /api/auth/login tarafından set edilir).
//  2. `Authorization: Bearer <OPERATOR_API_TOKEN>` header (only when the env
//     var is set AND the route passes its Request through) — for scripts/E2E.
//  3. Explicit local bypass: LOCAL_OPERATOR_MODE=true AND NODE_ENV is NOT
//     'production'. The NODE_ENV check is unconditional so the bypass can
//     never be switched on in a production deployment.
//
// Missing/short APP_SESSION_SECRET makes verifySessionToken throw → caught →
// unauthorized. So a misconfigured production deploy rejects everything
// instead of allowing everything (fail-closed).
//
// These helpers keep their original union signatures so all existing API
// routes (which branch on `'response' in x`) compile unchanged.

const LOCAL_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'local@grafikcem.agency',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date(0).toISOString(),
} as unknown as User

export function isLocalOperatorBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LOCAL_OPERATOR_MODE === 'true'
}

function hasValidBearerToken(req?: Request): boolean {
  const expected = process.env.OPERATOR_API_TOKEN
  if (!req || !expected || expected.length < 32) return false
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false
  return timingSafeEqual(header.slice('Bearer '.length), expected)
}

async function hasValidSession(): Promise<boolean> {
  try {
    const store = await cookies()
    return await verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value)
  } catch {
    return false
  }
}

async function isAuthorized(req?: Request): Promise<boolean> {
  if (isLocalOperatorBypass()) return true
  if (hasValidBearerToken(req)) return true
  return hasValidSession()
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Yetkisiz. Giriş gerekli.' }, { status: 401 })
}

export async function getCurrentUser(): Promise<User | null> {
  return (await isAuthorized()) ? LOCAL_USER : null
}

export async function requireApiUser(req?: Request): Promise<{ user: User } | { response: NextResponse }> {
  if (await isAuthorized(req)) return { user: LOCAL_USER }
  return { response: unauthorized() }
}

// `req` enables the Bearer-token path; cookie auth works without it.
export async function requireApiAccess(req?: Request): Promise<{ ok: true } | { response: NextResponse }> {
  if (await isAuthorized(req)) return { ok: true }
  return { response: unauthorized() }
}

/**
 * Throwing session guard for Server Actions.
 *
 * Server Actions are auto-exposed as public POST endpoints by Next.js, so they
 * must authenticate independently of the page-level proxy gate. Actions have
 * no Response to return, so this throws on failure.
 */
export async function assertSession(): Promise<void> {
  if (!(await isAuthorized())) {
    throw new Error('Yetkisiz. Giriş gerekli.')
  }
}
