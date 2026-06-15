import { createClient } from "@supabase/supabase-js";

// Feed The Goat (Yaşam OS) — client-side browser client. İkinci Supabase projesi (xcqrk…).
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_LIFE_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_LIFE_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
