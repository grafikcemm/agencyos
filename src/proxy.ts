import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session'

// Single-operator page gate. Proxy performs the optimistic navigation check;
// API routes still enforce auth independently through
// requireApiUser/requireApiAccess. Unauthenticated page requests are redirected
// to /login and /login itself always remains reachable.
//
// The API layer is the actual authorization boundary.

const PUBLIC_PATHS = new Set(['/login'])

// Mirrors isLocalOperatorBypass in lib/auth.ts. NODE_ENV !== 'production' is
// unconditional, so the bypass cannot be enabled on a production deployment.
function isLocalOperatorBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LOCAL_OPERATOR_MODE === 'true'
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  if (isLocalOperatorBypass()) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  let valid = false
  try {
    valid = await verifySessionToken(token)
  } catch {
    // Missing/invalid APP_SESSION_SECRET is fail-closed: direct the operator to
    // /login instead of returning a 500 for every page.
    valid = false
  }

  if (valid) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
