import { createClient } from "@supabase/supabase-js";

// Feed The Goat (Yaşam OS) — server-side client (server actions + RSC).
// Tek kullanıcılı app, auth yok; anon key kullanır. İkinci Supabase projesi (xcqrk…).
export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_LIFE_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_LIFE_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
