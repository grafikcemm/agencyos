import { NextResponse, type NextRequest } from 'next/server'

// Auth has been removed. The proxy no longer gates routes or redirects to a
// login page — every request passes straight through. Kept as a no-op so the
// Next.js proxy entrypoint still resolves.

export async function proxy(_request: NextRequest) {
  void _request
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
