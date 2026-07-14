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

export type PendingActionType =
  | 'add_task_choice'
  // FINAL PILOT BLOCKERS Faz 6 — imzalı (code'lu) satış aksiyonları:
  | 'sales_send' // onaylı taslağı GÖNDER (ayrı açık teyit — "onayla" ile "gönder" farklı)
  | 'sales_approval_decision' // HITL onay kararı (approve/reject)
  | 'sales_proposal_decision' // teklif approve/reject
  | 'sales_reconcile_decision' // reconcile assume_delivered / confirm_not_found

export interface PendingAction {
  type: PendingActionType
  payload: Record<string, unknown>
  digest: string
  createdAtMs: number
  /** Tek-kullanımlık kısa teyit kodu (imzalı aksiyonlar). Yoksa (legacy) kod
   *  doğrulaması aranmaz. */
  code?: string
}

interface MemoryEntry extends PendingAction {
  chatKey: string
}

/** 6 haneli tek-kullanımlık teyit kodu (0-9A-Z, karışık). rng enjekte edilebilir. */
export function makeConfirmCode(rng: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // benzeşen 0/O/1/I çıkarıldı
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(rng() * alphabet.length)]
  return code
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

/** Bekleyen aksiyonu kurar (chat başına TEK aksiyon — öncekini ezer).
 *  code verilirse imzalı aksiyon (teyit kodu ile tüketilir). */
export async function setPendingAction(
  chatKey: string,
  type: PendingActionType,
  payload: Record<string, unknown>,
  nowMs: number = Date.now(),
  code?: string,
): Promise<{ digest: string; mode: 'durable' | 'memory' }> {
  const digest = computeActionDigest(type, payload)
  memoryEntry = { chatKey, type, payload, digest, createdAtMs: nowMs, code }
  try {
    const { error } = await lifeSupabaseAdmin.from('telegram_pending_actions').upsert(
      {
        chat_key: chatKey,
        action_type: type,
        payload,
        digest,
        code: code ?? null,
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

export type SignedConsumeResult =
  | { status: 'ok'; action: PendingAction }
  | { status: 'missing' } // bekleyen aksiyon yok
  | { status: 'expired' } // TTL doldu (temizlendi)
  | { status: 'mismatch' } // kod uyuşmadı (TÜKETİLMEDİ — doğru kodla tekrar denenebilir)

/**
 * İMZALI aksiyonu teyit koduyla tüketir: kod EŞLEŞİRSE tüketir (siler) ve döner;
 * kod uyuşmazsa mismatch (silmez — tampered/yanlış kod GÜVENLE reddedilir, doğru
 * kodla retry mümkün); TTL dolduysa expired (temizler); yoksa missing.
 * Peek-then-conditional-delete (tek operatör; yarış penceresi ihmal edilebilir).
 */
export async function consumeSignedAction(
  chatKey: string,
  code: string,
  nowMs: number = Date.now(),
): Promise<SignedConsumeResult> {
  // Durable peek.
  let entry: { type: string; payload: Record<string, unknown>; digest: string; code: string | null; createdAtMs: number } | null = null
  let durable = false
  try {
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_pending_actions')
      .select('action_type, payload, digest, code, created_at')
      .eq('chat_key', chatKey)
      .maybeSingle()
    if (!error) {
      durable = true
      if (data) {
        entry = {
          type: data.action_type as string,
          payload: (data.payload as Record<string, unknown>) ?? {},
          digest: data.digest as string,
          code: (data.code as string | null) ?? null,
          createdAtMs: new Date(data.created_at as string).getTime(),
        }
      }
    }
  } catch {
    /* memory fallback */
  }
  if (!durable && memoryEntry?.chatKey === chatKey) {
    entry = { type: memoryEntry.type, payload: memoryEntry.payload, digest: memoryEntry.digest, code: memoryEntry.code ?? null, createdAtMs: memoryEntry.createdAtMs }
  }
  if (!entry) return { status: 'missing' }

  if (isExpired(entry.createdAtMs, nowMs)) {
    await deletePending(chatKey, durable)
    return { status: 'expired' }
  }
  if (entry.code !== code) {
    // Kod uyuşmadı → TÜKETME (doğru kodla tekrar denenebilir; TTL sınırlar).
    return { status: 'mismatch' }
  }
  await deletePending(chatKey, durable)
  return {
    status: 'ok',
    action: {
      type: entry.type as PendingActionType,
      payload: entry.payload,
      digest: entry.digest,
      createdAtMs: entry.createdAtMs,
      code: entry.code ?? undefined,
    },
  }
}

/** Bekleyen aksiyonu TÜKETMEDEN kontrol eder (bare "onayla" yönlendirmesi için).
 *  Var + süresi geçmemişse type+code döner; yoksa/expired null. */
export async function peekPendingAction(
  chatKey: string,
  nowMs: number = Date.now(),
): Promise<{ type: PendingActionType; hasCode: boolean } | null> {
  let entry: { type: string; code: string | null; createdAtMs: number } | null = null
  let durable = false
  try {
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_pending_actions')
      .select('action_type, code, created_at')
      .eq('chat_key', chatKey)
      .maybeSingle()
    if (!error) {
      durable = true
      if (data) {
        entry = {
          type: data.action_type as string,
          code: (data.code as string | null) ?? null,
          createdAtMs: new Date(data.created_at as string).getTime(),
        }
      }
    }
  } catch {
    /* memory fallback */
  }
  if (!durable && memoryEntry?.chatKey === chatKey) {
    entry = { type: memoryEntry.type, code: memoryEntry.code ?? null, createdAtMs: memoryEntry.createdAtMs }
  }
  if (!entry || isExpired(entry.createdAtMs, nowMs)) return null
  return { type: entry.type as PendingActionType, hasCode: entry.code != null }
}

async function deletePending(chatKey: string, durable: boolean): Promise<void> {
  if (memoryEntry?.chatKey === chatKey) memoryEntry = null
  if (!durable) return
  try {
    await lifeSupabaseAdmin.from('telegram_pending_actions').delete().eq('chat_key', chatKey)
  } catch {
    /* best effort */
  }
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
      // Faz 0.4: durable depo ÇALIŞIYOR ve kayıt YOK → tek doğruluk kaynağı budur.
      // Bayat memory girdisi (başka instance tüketmiş olabilir) ASLA tüketilmez.
      if (memoryEntry?.chatKey === chatKey) memoryEntry = null
      return null
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
