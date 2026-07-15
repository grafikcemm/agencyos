import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeGoogleAuthCode,
  fetchGoogleIdentity,
  GOOGLE_AUTH_PKCE_COOKIE,
  GOOGLE_AUTH_STATE_COOKIE,
  resolveGoogleAuthConfig,
  verifyGoogleAuthState,
} from '@/lib/googleAuth'
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  timingSafeEqual,
} from '@/lib/session'
export const runtime = 'nodejs'

function redirectWithClearedAuthCookies(request: NextRequest, destination: string): NextResponse {
  const response = NextResponse.redirect(new URL(destination, request.url))
  for (const name of [GOOGLE_AUTH_STATE_COOKIE, GOOGLE_AUTH_PKCE_COOKIE]) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 0,
    })
  }
  return response
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has('error')) {
    return redirectWithClearedAuthCookies(request, '/login?error=oauth_denied')
  }

  const code = request.nextUrl.searchParams.get('code') ?? ''
  const state = request.nextUrl.searchParams.get('state') ?? ''
  const stateCookie = request.cookies.get(GOOGLE_AUTH_STATE_COOKIE)?.value ?? ''
  const verifier = request.cookies.get(GOOGLE_AUTH_PKCE_COOKIE)?.value ?? ''
  let validState = false
  try {
    validState = Boolean(
      code
      && state
      && stateCookie
      && verifier
      && timingSafeEqual(state, stateCookie)
      && verifyGoogleAuthState(state),
    )
  } catch {
    validState = false
  }
  if (!validState) {
    return redirectWithClearedAuthCookies(request, '/login?error=state_invalid')
  }

  const resolved = resolveGoogleAuthConfig(request.nextUrl.origin)
  if (!resolved.ok) {
    console.error('Google auth callback config error:', resolved.error)
    return redirectWithClearedAuthCookies(request, '/login?error=config')
  }

  const tokenResult = await exchangeGoogleAuthCode(resolved.config, code, verifier)
  if (!tokenResult.ok) {
    console.error('Google auth token exchange failed:', tokenResult.error)
    return redirectWithClearedAuthCookies(request, '/login?error=provider')
  }
  const identityResult = await fetchGoogleIdentity(
    tokenResult.accessToken,
    resolved.config.allowedEmail,
  )
  if (!identityResult.ok) {
    const wrongAccount = identityResult.error.includes('erişim yetkisi yok')
    console.warn('Google auth identity rejected:', identityResult.error)
    return redirectWithClearedAuthCookies(
      request,
      wrongAccount ? '/login?error=account_not_allowed' : '/login?error=provider',
    )
  }

  let sessionToken: string
  try {
    sessionToken = await createSessionToken()
  } catch (error) {
    console.error('Google auth session error:', (error as Error).message)
    return redirectWithClearedAuthCookies(request, '/login?error=config')
  }

  const response = redirectWithClearedAuthCookies(request, '/command-center')
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}
