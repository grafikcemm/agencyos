import { NextRequest, NextResponse } from 'next/server'
import {
  GOOGLE_AUTH_STATE_TTL_MS,
  GOOGLE_AUTH_PKCE_COOKIE,
  GOOGLE_AUTH_STATE_COOKIE,
  buildGoogleAuthUrl,
  createGoogleAuthPkce,
  createGoogleAuthState,
  resolveGoogleAuthConfig,
} from '@/lib/googleAuth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const resolved = resolveGoogleAuthConfig(request.nextUrl.origin)
  if (!resolved.ok) {
    console.error('Google auth config error:', resolved.error)
    return NextResponse.redirect(new URL('/login?error=config', request.url))
  }

  let signedState: ReturnType<typeof createGoogleAuthState>
  try {
    signedState = createGoogleAuthState()
  } catch (error) {
    console.error('Google auth state error:', (error as Error).message)
    return NextResponse.redirect(new URL('/login?error=config', request.url))
  }
  const pkce = createGoogleAuthPkce()
  const response = NextResponse.redirect(
    buildGoogleAuthUrl(resolved.config, signedState.state, pkce.challenge),
  )
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth/google',
    maxAge: Math.floor(GOOGLE_AUTH_STATE_TTL_MS / 1000),
  }
  response.cookies.set(GOOGLE_AUTH_STATE_COOKIE, signedState.state, cookieOptions)
  response.cookies.set(GOOGLE_AUTH_PKCE_COOKIE, pkce.verifier, cookieOptions)
  return response
}
