import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Feed The Goat (Yaşam OS) — server actions için ince sarmalayıcı.
// createServerSupabase ile aynı ama `@/lib/supabase/server` olarak import edilebilir.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_LIFE_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_LIFE_SUPABASE_ANON_KEY!
  return createSupabaseClient(url, key)
}
