import 'server-only'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'

// Feed The Goat (Yaşam OS) — server actions için ince sarmalayıcı.
// createServerSupabase ile aynı (service-role), `@/lib/supabase/server` olarak
// import edilebilir. Anon key kullanımı güvenlik nedeniyle kaldırıldı — bkz.
// @/lib/supabaseServer ve migration 002_life_rls.
export function createClient() {
  return lifeSupabaseAdmin
}
