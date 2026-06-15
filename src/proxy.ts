import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session'

// Single-operator page gate. The proxy (Next 16's renamed middleware) runs on
// page routes only — API routes enforce auth at the handler level via
// requireApiUser/requireApiAccess. Unauthenticated page requests are redirected
// to /login; the /login page is always reachable so there is no redirect loop.
//
// Per the Next.js docs the proxy is an *optimistic* check (cookie present +
// signature valid); the API layer remains the real authorization boundary.

const PUBLIC_PATHS = new Set(['/login'])

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  let valid = false
  try {
    valid = await verifySessionToken(token)
  } catch {
    // Missing/invalid APP_SESSION_SECRET → treat as unauthenticated rather than
    // throwing a 500 on every page; the operator is funnelled to /login.
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
