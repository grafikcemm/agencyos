import 'server-only'
import type { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

// Auth has been removed from the system. This is a single-operator app, so every
// request is treated as the local operator. These helpers keep their original
// union signatures so all existing API routes (which branch on `'response' in x`)
// keep compiling unchanged — they simply never return the rejection variant.

const LOCAL_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'local@grafikcem.agency',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date(0).toISOString(),
} as unknown as User

export async function getCurrentUser(): Promise<User | null> {
  return LOCAL_USER
}

export async function requireApiUser(): Promise<{ user: User } | { response: NextResponse }> {
  return { user: LOCAL_USER }
}

// `req` is accepted for call-site compatibility (some routes pass the request);
// it is no longer inspected since there is nothing to authenticate.
export async function requireApiAccess(_req?: Request): Promise<{ ok: true } | { response: NextResponse }> {
  return { ok: true }
}
