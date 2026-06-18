import "server-only";
import { lifeSupabaseAdmin } from "@/lib/lifeSupabaseAdmin";

// Feed The Goat (Yaşam OS) — server-side client (server actions + RSC).
//
// GÜVENLİK: Eskiden anon key (NEXT_PUBLIC) kullanıyordu; Life tablolarında RLS
// `allow_all to public` olduğu için aynı anon anahtar tarayıcıdan REST üzerinden
// tüm tabloları okuyup yazabiliyordu. Artık service-role client'a delege ediyor
// (yalnızca server, `server-only` ile bundle'a sızmaz). Anon erişimi migration
// 002_life_rls ile kilitlenir. Mutasyon yetkisi `assertSession` ile korunur.
export function createServerSupabase() {
  return lifeSupabaseAdmin;
}
