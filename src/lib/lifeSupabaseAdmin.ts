import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Feed The Goat (Yaşam OS) — service-role client. İKİNCİ Supabase projesi (xcqrk…).
// AgencyOS'un kendi service-role client'ı (@/lib/supabase → supabaseAdmin) ile
// KARIŞTIRMA. İsim çakışmasını önlemek için bu dosya `lifeSupabaseAdmin` export eder.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_LIFE_SUPABASE_URL;
    const key = process.env.LIFE_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'lifeSupabaseAdmin: NEXT_PUBLIC_LIFE_SUPABASE_URL / LIFE_SUPABASE_SERVICE_ROLE_KEY tanımlı değil'
      );
    }
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

// Lazy Proxy: import anında env zorunlu kılmaz, ilk erişimde init.
export const lifeSupabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
