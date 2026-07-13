// ─────────────────────────────────────────────────────────────────────────────
// Telegram webhook cevabı — durable delivery ledger (Faz 0.1).
//
// PROBLEM: handler cevabı gönderdikten sonra claim finalize edilemezse update
// yeniden işlenir → AYNI cevap kullanıcıya İKİNCİ kez gider.
// ÇÖZÜM: her cevap, deterministik delivery_key ile
// telegram_outbound_deliveries'e ÖNCE 'sending' olarak claim edilir
// (INSERT unique). Retry'da insert 23505 → provider ÇAĞRILMAZ (dedupe).
//
// Sonuç semantiği (exactly-once DEĞİL — provider idempotency desteklemiyor):
// - claim yazılamadı (DB hatası, PROD)  → provider çağrılmaz (fail-closed).
// - provider başarı + finalize başarı    → 'sent'.
// - provider başarı + finalize BAŞARISIZ → satır 'sending' kalır, CRITICAL log,
//   OTOMATİK resend YOK (unknown; manuel reconcile kararı gerekir).
// - provider başarısız                   → 'failed' (yeni delivery_key ile yeni
//   deneme yapılabilir; aynı key asla ikinci kez provider'a gitmez).
// - Ledger tablosu yok (006 canlı değil) → 'unledgered' düz gönderim (görünür
//   log; durable success TAKLİT EDİLMEZ — bilinen 005 sınırı).
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { sendTelegramMessage } from '@/lib/telegram/client'

export interface ReplyDeliveryResult {
  /** Provider'a bu çağrıda mesaj gitti ve başarılı oldu. */
  sent: boolean
  /** true → aynı delivery_key daha önce claim edilmiş; provider ÇAĞRILMADI. */
  deduped?: boolean
  /** true → provider başarılı AMA finalize yazılamadı (satır 'sending'; resend YOK). */
  recordError?: boolean
  /** true → ledger şeması yok; düz gönderim yapıldı (005 sınırı, dokümante). */
  unledgered?: boolean
  status: number
  error: string | null
}

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

/**
 * Aynı update için deterministik anahtar: update:<id>:reply:<seq>.
 * seq, bir update'in işlenmesi sırasında gönderilen N'inci mesajdır —
 * retry'da handler aynı sırayla aynı mesajları üretir, dedupe tutar.
 */
export function replyDeliveryKey(updateId: number, seq: number): string {
  return `update:${updateId}:reply:${seq}`
}

export async function sendReplyOnce(opts: {
  updateId: number
  seq: number
  text: string
}): Promise<ReplyDeliveryResult> {
  const key = replyDeliveryKey(opts.updateId, opts.seq)

  // 1) Delivery claim — provider'dan ÖNCE, at-most-once temeli.
  let unledgered = false
  try {
    const { error } = await lifeSupabaseAdmin.from('telegram_outbound_deliveries').insert({
      delivery_key: key,
      update_id: opts.updateId,
      purpose: 'webhook_reply',
      status: 'sending',
    })
    if (error) {
      if (error.code === '23505') {
        // Daha önce claim edilmiş (retry / başka worker) → provider'a İKİNCİ mesaj YOK.
        return { sent: false, deduped: true, status: 0, error: null }
      }
      if (TABLE_MISSING.has(error.code ?? '')) {
        unledgered = true // 006 canlı değil → ledger'sız düz gönderim (bilinen sınır).
        console.warn('[replyDelivery] ledger tablosu yok (006 bekliyor) — unledgered gönderim', key)
      } else if (process.env.NODE_ENV === 'production') {
        // Ledger var ama yazılamıyor → PROD fail-closed: duplicate riski almayız.
        console.error('[replyDelivery] claim yazılamadı — provider çağrılmadı', error.code ?? error.message)
        return { sent: false, status: 0, error: 'delivery ledger unavailable' }
      } else {
        unledgered = true
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[replyDelivery] claim exception — provider çağrılmadı', err instanceof Error ? err.message : 'unknown')
      return { sent: false, status: 0, error: 'delivery ledger unavailable' }
    }
    unledgered = true
  }

  // 2) Provider.
  const result = await sendTelegramMessage(opts.text)

  if (unledgered) {
    return { sent: result.ok, unledgered: true, status: result.status, error: result.ok ? null : result.error }
  }

  // 3) Finalize (CAS: yalnız 'sending' satır).
  const patch = result.ok
    ? { status: 'sent', message_id: result.messageId, updated_at: new Date().toISOString() }
    : { status: 'failed', last_error: (result.error ?? 'unknown').slice(0, 300), updated_at: new Date().toISOString() }
  try {
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_outbound_deliveries')
      .update(patch)
      .eq('delivery_key', key)
      .eq('status', 'sending')
      .select('id')
    if (error || !data?.length) {
      if (result.ok) {
        // Provider başardı, kayıt düşmedi → satır 'sending' kalır; OTOMATİK
        // resend YOK (unknown/manuel reconcile). Kullanıcı mesajı gördü.
        console.error('[replyDelivery] CRITICAL: provider-success/finalize-failure', key, error?.code ?? '0rows')
        return { sent: true, recordError: true, status: result.status, error: null }
      }
      console.error('[replyDelivery] failure-finalize yazılamadı', key, error?.code ?? '0rows')
    }
  } catch (err) {
    if (result.ok) {
      console.error('[replyDelivery] CRITICAL: provider-success/finalize-exception', key, err instanceof Error ? err.message : 'unknown')
      return { sent: true, recordError: true, status: result.status, error: null }
    }
  }

  return { sent: result.ok, status: result.status, error: result.ok ? null : result.error }
}
