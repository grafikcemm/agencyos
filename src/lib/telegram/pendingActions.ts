// ─────────────────────────────────────────────────────────────────────────────
// Telegram pending conversation state (Faz B5).
//
// "görev ekle → 1/2 seç" gibi çok-adımlı akışlar ve "onayla/gönder" tipi
// generic ifadelerin GÜVENLİ bağlanması için TTL'li, TEK KULLANIMLIK bekleyen
// aksiyon kaydı. Digest alanı, aksiyonun gösterilen içeriğe bağlı kalmasını
// sağlar (içerik değişti → digest uyuşmaz → bloke).
//
// Depo: LIFE DB `telegram_pending_actions` (migration 005 onay bekliyor);
// tablo yoksa in-memory fallback (sıcak instance içinde çalışır, cross-instance
// garanti YOK — mode alanıyla görünür).
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { createHash } from 'crypto'

export const PENDING_ACTION_TTL_MS = 10 * 60_000

export type PendingActionType = 'add_task_choice'

export interface PendingAction {
  type: PendingActionType
  payload: Record<string, unknown>
  digest: string
  createdAtMs: number
}

interface MemoryEntry extends PendingAction {
  chatKey: string
}

let memoryEntry: MemoryEntry | null = null

export function _resetPendingActions(): void {
  memoryEntry = null
}

export function computeActionDigest(type: string, payload: Record<string, unknown>): string {
  return createHash('sha256').update(`${type}:${JSON.stringify(payload)}`).digest('hex').slice(0, 16)
}

function isExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs > PENDING_ACTION_TTL_MS
}

/** Bekleyen aksiyonu kurar (chat başına TEK aksiyon — öncekini ezer). */
export async function setPendingAction(
  chatKey: string,
  type: PendingActionType,
  payload: Record<string, unknown>,
  nowMs: number = Date.now(),
): Promise<{ digest: string; mode: 'durable' | 'memory' }> {
  const digest = computeActionDigest(type, payload)
  memoryEntry = { chatKey, type, payload, digest, createdAtMs: nowMs }
  try {
    const { error } = await lifeSupabaseAdmin.from('telegram_pending_actions').upsert(
      {
        chat_key: chatKey,
        action_type: type,
        payload,
        digest,
        created_at: new Date(nowMs).toISOString(),
      },
      { onConflict: 'chat_key' },
    )
    if (!error) return { digest, mode: 'durable' }
  } catch {
    /* fallback altta */
  }
  return { digest, mode: 'memory' }
}

/**
 * Bekleyen aksiyonu TÜKETİR (tek kullanımlık): okur ve siler.
 * Süresi dolmuşsa null döner (ve temizler) — süresi dolmuş seçimle mutasyon YOK.
 */
export async function consumePendingAction(
  chatKey: string,
  nowMs: number = Date.now(),
): Promise<PendingAction | null> {
  // Durable dene.
  try {
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_pending_actions')
      .delete()
      .eq('chat_key', chatKey)
      .select('action_type, payload, digest, created_at')
      .maybeSingle()
    if (!error && data) {
      memoryEntry = null
      const createdAtMs = new Date(data.created_at as string).getTime()
      if (isExpired(createdAtMs, nowMs)) return null
      return {
        type: data.action_type as PendingActionType,
        payload: (data.payload as Record<string, unknown>) ?? {},
        digest: data.digest as string,
        createdAtMs,
      }
    }
    if (!error && !data) {
      // Durable depo çalışıyor ve kayıt yok → memory'ye de güvenme (tek doğruluk kaynağı).
      // Ancak tablo yoksa error 42P01 gelir ve buraya düşmeyiz.
      if (memoryEntry?.chatKey !== chatKey) return null
    }
  } catch {
    /* fallback altta */
  }

  // In-memory fallback (tablo yok / DB erişilemedi).
  if (memoryEntry && memoryEntry.chatKey === chatKey) {
    const entry = memoryEntry
    memoryEntry = null
    if (isExpired(entry.createdAtMs, nowMs)) return null
    return entry
  }
  return null
}
