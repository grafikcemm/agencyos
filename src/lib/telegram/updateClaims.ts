// ─────────────────────────────────────────────────────────────────────────────
// Telegram update_id idempotency (Faz B4).
//
// Doğruluk mekanizması: LIFE DB'de `telegram_update_claims` PK claim'i
// (INSERT → unique ihlali = duplicate). Cross-instance güvenli CAS.
//
// In-memory Map YALNIZ optimizasyon (sıcak instance'ta DB round-trip kısaltır)
// ve tablo henüz yokken (migration 005 kullanıcı onayı bekliyor) düşüş yoludur.
// Tablo yokken durable dedup TAMAMLANMIŞ SAYILMAZ — durum `mode` alanında görünür.
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'

const SEEN_UPDATE_TTL_MS = 5 * 60_000
const seenUpdates = new Map<number, number>()

function seenInMemory(updateId: number): boolean {
  const now = Date.now()
  for (const [id, ts] of seenUpdates) {
    if (now - ts > SEEN_UPDATE_TTL_MS) seenUpdates.delete(id)
  }
  if (seenUpdates.has(updateId)) return true
  seenUpdates.set(updateId, now)
  return false
}

export interface ClaimResult {
  /** true → bu update İLK kez işleniyor; false → duplicate, yan etkisiz çık. */
  fresh: boolean
  /** 'durable' = DB claim; 'memory' = tablo yok/erişilemedi, in-memory fallback. */
  mode: 'durable' | 'memory'
}

/** Test için: in-memory dedup setini sıfırlar. */
export function _resetMemoryClaims(): void {
  seenUpdates.clear()
}

/**
 * update_id claim'i. Önce in-memory (ucuz kısa devre), sonra durable INSERT.
 * INSERT unique ihlali (23505) → duplicate. Tablo yok (42P01) veya başka DB
 * hatası → in-memory sonuca güven (fail-open değil: memory zaten kontrol edildi;
 * yalnız cross-instance garantisi düşer, mode='memory' ile görünür).
 */
export async function claimTelegramUpdate(updateId: number): Promise<ClaimResult> {
  const memoryDuplicate = seenInMemory(updateId)
  if (memoryDuplicate) return { fresh: false, mode: 'memory' }

  try {
    const { error } = await lifeSupabaseAdmin
      .from('telegram_update_claims')
      .insert({ update_id: updateId })
    if (!error) return { fresh: true, mode: 'durable' }
    if (error.code === '23505') return { fresh: false, mode: 'durable' }
    // 42P01 = tablo yok (migration onay bekliyor) — sessizce memory moduna düş.
    if (error.code !== '42P01') {
      console.error('[telegram] update claim DB hatası', error.code ?? 'unknown')
    }
    return { fresh: true, mode: 'memory' }
  } catch {
    return { fresh: true, mode: 'memory' }
  }
}
