import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

// Server-side Supabase client bound to the request cookies.
// Use in Server Components, Route Handlers, and Server Actions to read the
// authenticated session. Writes the refreshed session back into cookies when
// invoked from a context that allows it (Route Handlers / Server Actions).
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase ortam değişkenleri eksik (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  }

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component render pass — cookie writes are not
          // allowed there. Session refresh is handled by proxy.ts instead.
        }
      },
    },
  })
}
