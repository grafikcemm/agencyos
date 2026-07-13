// ─────────────────────────────────────────────────────────────────────────────
// Telegram update_id claim durum makinesi (Faz B4 + 0.3).
//
// HEDEF: crash/timeout/duplicate-delivery/çok-instance koşullarında mesaj
// NE KAYBOLUR NE İKİ KEZ İŞLENİR.
//
// Modlar:
// - 'state' (mig 006 canlıyken): telegram_acquire_update RPC →
//   processing(lease) → complete/fail. Lease'i dolan processing devralınır;
//   completed kesin no-op.
// - 'legacy' (yalnız 005): insert-only claim. complete/fail no-op.
//   Bilinen sınır (0.3 dokümante): claim handler'dan önce kalıcı → handler
//   crash'inde o update kaybolabilir; 006 onayıyla kapanır.
// - Erişilemezlik: PRODUCTION'da FAIL-CLOSED → acquired=false, reason
//   'unavailable' → webhook 503 döner, Telegram SONRA yeniden dener (memory
//   'başarılı durable claim' gibi DAVRANMAZ). Dev'de in-memory kabul edilir.
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'

const SEEN_UPDATE_TTL_MS = 5 * 60_000
const seenUpdates = new Map<number, number>()
export const CLAIM_LEASE_SECONDS = 90

function seenInMemory(updateId: number): boolean {
  const now = Date.now()
  for (const [id, ts] of seenUpdates) {
    if (now - ts > SEEN_UPDATE_TTL_MS) seenUpdates.delete(id)
  }
  if (seenUpdates.has(updateId)) return true
  seenUpdates.set(updateId, now)
  return false
}

export function _resetMemoryClaims(): void {
  seenUpdates.clear()
}

export type AcquireResult =
  | { acquired: true; mode: 'state' | 'legacy' | 'memory'; attempt: number }
  | { acquired: false; reason: 'duplicate' | 'in_progress' | 'unavailable' }

/**
 * Update'i işlemek için devral.
 * - duplicate  → kesin no-op (200 dön, Telegram tekrar göndermesin)
 * - in_progress→ başka instance lease içinde çalışıyor (200 dön)
 * - unavailable→ durable depo yok/erişilemez ve PROD → 503 dön (retry sonra)
 */
export async function acquireUpdateClaim(updateId: number): Promise<AcquireResult> {
  // 1) Yeni durum makinesi (mig 006).
  try {
    const { data, error } = await lifeSupabaseAdmin.rpc('telegram_acquire_update', {
      p_update_id: updateId,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
    })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      if (row?.acquired) {
        seenInMemory(updateId) // optimizasyon amaçlı işaretle
        return { acquired: true, mode: 'state', attempt: (row.attempt as number) ?? 1 }
      }
      // Boş set: completed veya taze processing → durumu ayırt et (yan etkisiz SELECT).
      const { data: existing } = await lifeSupabaseAdmin
        .from('telegram_update_claims')
        .select('status')
        .eq('update_id', updateId)
        .maybeSingle()
      return {
        acquired: false,
        reason: existing?.status === 'processing' ? 'in_progress' : 'duplicate',
      }
    }
    // RPC yok (006 onay bekliyor) → legacy'ye düş; başka DB hatası → aşağıda ele alınır.
    if (error.code !== 'PGRST202' && error.code !== '42883') {
      return unavailableOrMemory(updateId)
    }
  } catch {
    return unavailableOrMemory(updateId)
  }

  // 2) Legacy (005): insert-only claim.
  try {
    const { error } = await lifeSupabaseAdmin
      .from('telegram_update_claims')
      .insert({ update_id: updateId })
    if (!error) {
      seenInMemory(updateId)
      return { acquired: true, mode: 'legacy', attempt: 1 }
    }
    if (error.code === '23505') return { acquired: false, reason: 'duplicate' }
    if (error.code === '42P01') return unavailableOrMemory(updateId) // tablo hiç yok
    return unavailableOrMemory(updateId)
  } catch {
    return unavailableOrMemory(updateId)
  }
}

/** Durable depo erişilemez: PROD fail-closed (503); dev'de memory kabul. */
function unavailableOrMemory(updateId: number): AcquireResult {
  if (process.env.NODE_ENV === 'production') {
    return { acquired: false, reason: 'unavailable' }
  }
  return seenInMemory(updateId)
    ? { acquired: false, reason: 'duplicate' }
    : { acquired: true, mode: 'memory', attempt: 1 }
}

/** Handler başarıyla bitti → claim'i kesinleştir (completed = kalıcı no-op). */
export async function completeUpdateClaim(updateId: number): Promise<void> {
  try {
    await lifeSupabaseAdmin
      .from('telegram_update_claims')
      .update({ status: 'completed', completed_at: new Date().toISOString(), lease_until: null })
      .eq('update_id', updateId)
      .eq('status', 'processing')
  } catch {
    /* legacy modda kolon yok → no-op; lease zaten dolacak */
  }
}

/** Handler hata ile bitti → failed (yeniden denenebilir) + hata izi. */
export async function failUpdateClaim(updateId: number, errMsg: string): Promise<void> {
  try {
    await lifeSupabaseAdmin
      .from('telegram_update_claims')
      .update({ status: 'failed', last_error: errMsg.slice(0, 300), lease_until: null })
      .eq('update_id', updateId)
      .eq('status', 'processing')
  } catch {
    /* legacy modda no-op */
  }
}

/** @deprecated Faz 0.3 — acquireUpdateClaim kullanın. Geri uyum için tutuldu. */
export async function claimTelegramUpdate(updateId: number): Promise<{ fresh: boolean; mode: 'durable' | 'memory' }> {
  const r = await acquireUpdateClaim(updateId)
  if (r.acquired) return { fresh: true, mode: r.mode === 'memory' ? 'memory' : 'durable' }
  return { fresh: false, mode: r.reason === 'unavailable' ? 'memory' : 'durable' }
}
