import 'server-only'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session'

// Single-operator auth. A valid HMAC-signed session cookie (set by
// /api/auth/login) authorizes the request as the local operator. These helpers
// keep their original union signatures so all existing API routes (which branch
// on `'response' in x`) compile unchanged — they now return the rejection
// variant whenever the session cookie is missing, expired, or tampered with.

const LOCAL_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'local@grafikcem.agency',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date(0).toISOString(),
} as unknown as User

async function hasValidSession(): Promise<boolean> {
  try {
    const store = await cookies()
    return await verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value)
  } catch {
    return false
  }
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Yetkisiz. Giriş gerekli.' }, { status: 401 })
}

export async function getCurrentUser(): Promise<User | null> {
  return (await hasValidSession()) ? LOCAL_USER : null
}

export async function requireApiUser(): Promise<{ user: User } | { response: NextResponse }> {
  if (await hasValidSession()) return { user: LOCAL_USER }
  return { response: unauthorized() }
}

// `req` is accepted for call-site compatibility (some routes pass the request);
// the session is read from the request cookies via next/headers.
export async function requireApiAccess(_req?: Request): Promise<{ ok: true } | { response: NextResponse }> {
  void _req
  if (await hasValidSession()) return { ok: true }
  return { response: unauthorized() }
}
