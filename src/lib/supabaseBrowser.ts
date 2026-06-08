import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Browser-side Supabase client (cookie-based session, shared with the server).
// Use inside Client Components for auth state and RLS-scoped reads.
let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error('Supabase ortam değişkenleri eksik (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).')
    }
    browserClient = createBrowserClient(url, anonKey)
  }
  return browserClient
}
