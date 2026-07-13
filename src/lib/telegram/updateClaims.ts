// ─────────────────────────────────────────────────────────────────────────────
// Telegram update_id claim durum makinesi (Faz B4 + 0.1 fencing).
//
// HEDEF: crash/timeout/duplicate-delivery/çok-instance koşullarında mesaj
// NE KAYBOLUR NE İKİ KEZ İŞLENİR — ve lease'i biten ESKİ worker, yeni
// worker'ın claim'ini finalize EDEMEZ (fencing token).
//
// Modlar:
// - 'state' (mig 006 canlıyken): telegram_acquire_update RPC →
//   processing(lease, claim_token) → complete/fail CAS'ı update_id + status +
//   claim_token + attempt_count DÖRTLÜSÜNÜ eşler; etkilenen satır 1 değilse
//   BAŞARISIZ sayılır ve route bunu authoritative kullanır (200 dönmez).
// - 'legacy' (yalnız 005): insert-only claim. complete/fail no-op (fence yok).
//   Bilinen sınır (dokümante): claim handler'dan önce kalıcı → handler
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

/** Fencing kimliği: finalize yalnız bu üçlü hâlâ satırdaysa geçer. */
export interface ClaimFence {
  updateId: number
  token: string
  attempt: number
}

export type AcquireResult =
  | { acquired: true; mode: 'state'; attempt: number; fence: ClaimFence }
  | { acquired: true; mode: 'legacy' | 'memory'; attempt: number; fence: null }
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
        const attempt = (row.attempt as number) ?? 1
        const token = (row.claim_token as string) ?? null
        if (!token) {
          // 006 eski sürüm (token kolonu yok) beklenmez ama fail-open olmayalım:
          // fence'siz state modu legacy gibi davranır (finalize no-op değil,
          // token'sız CAS güvensiz olurdu) → PROD'da işlemeyi reddet.
          if (process.env.NODE_ENV === 'production') {
            return { acquired: false, reason: 'unavailable' }
          }
          return { acquired: true, mode: 'legacy', attempt, fence: null }
        }
        return { acquired: true, mode: 'state', attempt, fence: { updateId, token, attempt } }
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
      return { acquired: true, mode: 'legacy', attempt: 1, fence: null }
    }
    if (error.code === '23505') return { acquired: false, reason: 'duplicate' }
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
    : { acquired: true, mode: 'memory', attempt: 1, fence: null }
}

export interface FinalizeResult {
  /** true → finalize KESİN yazıldı (veya fence'siz modda yazılacak şey yok). */
  ok: boolean
  /** 'fenced' → satır artık bize ait değil (lease devralındı) veya durum değişti. */
  reason?: 'db_error' | 'fenced'
}

/**
 * Fencing'li CAS finalize: yalnız update_id + status='processing' +
 * claim_token + attempt_count DÖRTLÜSÜ eşleşen TEK satırı günceller.
 * Etkilenen satır 1 değilse ok:false — route bunu authoritative kullanır.
 * fence=null (legacy/memory): yazılacak durum yok → ok:true (bilinen 005 sınırı).
 */
async function finalizeClaim(
  fence: ClaimFence | null,
  patch: Record<string, unknown>,
): Promise<FinalizeResult> {
  if (!fence) return { ok: true }
  try {
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_update_claims')
      .update(patch)
      .eq('update_id', fence.updateId)
      .eq('status', 'processing')
      .eq('claim_token', fence.token)
      .eq('attempt_count', fence.attempt)
      .select('update_id')
    if (error) {
      console.error('[updateClaims] finalize DB hatası', error.code ?? error.message)
      return { ok: false, reason: 'db_error' }
    }
    if (!data || data.length !== 1) {
      // Fence tutmadı: lease devralındı (yeni token/attempt) veya durum değişti.
      console.error('[updateClaims] finalize fenced — satır artık bu worker\'a ait değil', fence.updateId)
      return { ok: false, reason: 'fenced' }
    }
    return { ok: true }
  } catch (err) {
    console.error('[updateClaims] finalize exception', err instanceof Error ? err.message : 'unknown')
    return { ok: false, reason: 'db_error' }
  }
}

/** Handler başarıyla bitti → claim'i kesinleştir (completed = kalıcı no-op). */
export async function completeUpdateClaim(fence: ClaimFence | null): Promise<FinalizeResult> {
  return finalizeClaim(fence, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    lease_until: null,
  })
}

/** Handler hata ile bitti → failed (yeniden denenebilir) + hata izi. */
export async function failUpdateClaim(fence: ClaimFence | null, errMsg: string): Promise<FinalizeResult> {
  return finalizeClaim(fence, {
    status: 'failed',
    last_error: errMsg.slice(0, 300),
    lease_until: null,
  })
}
