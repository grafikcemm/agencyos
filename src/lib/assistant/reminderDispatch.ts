// ─────────────────────────────────────────────────────────────────────────────
// Reminder gönderim + kayıt (Faz B2 + Faz 0.5 delivery recovery).
//
// KURAL 1 (B2): message_id yoksa "gönderildi" YOK; başarısızlık send_failed +
//   attempts + next_retry_at ile görünür; conversation log YALNIZ başarıda.
// KURAL 2 (0.5): provider'a AYNI reminder İKİ KEZ GİTMEZ — gönderimden ÖNCE
//   atomik 'sending' claim (INSERT unique(date,type) → yarışta 23505; retry'da
//   CAS UPDATE yalnız send_failed satırı devralır). Her Supabase yazımının
//   `{ error }` sonucu KONTROL edilir; claim yazılamazsa provider ÇAĞRILMAZ
//   (fail-closed).
// KURAL 3 (0.2 revize): provider-success + DB-record-failure → satır 'sending'
//   kalır (CRITICAL log + result.recordError). 'sending' satır yeniden gönderime
//   KAPALIDIR — süresiz. "crash before provider" ile "provider success / DB
//   fail" ayırt EDİLEMEZ (Telegram'da Message-ID araması yok) → stale 'sending'
//   OTOMATİK yeniden gönderilMEZ; sweepUnknownDeliveries onu 'unknown_delivery'
//   durumuna taşır (diagnostics'te görünür) ve provider ancak MANUEL, açık
//   reconcile kararıyla (reconcileReminder) ikinci kez çağrılabilir.
//   NOT: bu makine at-most-once'tır, exactly-once DEĞİLDİR — provider
//   idempotency anahtarı desteklemediği için bilinçli sınır: şüpheli durumda
//   kayıp değil SESSİZLİK tercih edilir; karar operatöre görünür şekilde kalır.
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { sendTelegramMessage } from '@/lib/telegram/client'
import { logConversationTurn } from '@/lib/assistant/memory'

/** Başarısız denemeler için backoff: 5dk, 15dk, 45dk… (cap 4 saat). */
export function nextRetryDelayMs(attempts: number): number {
  const base = 5 * 60_000 * Math.pow(3, Math.max(0, attempts - 1))
  return Math.min(base, 4 * 60 * 60_000)
}

/** 'sending' claim bu süreden eskiyse sonuç BİLİNMİYOR demektir (unknown adayı). */
export const STALE_SENDING_MS = 10 * 60_000

interface ReminderRowLite {
  reminder_type: string
  status: string | null
  metadata: { next_retry_at?: string; claimed_at?: string } | null
}

/**
 * sentToday filtresi:
 * - 'send_failed' + retry vadesi geçti → LİSTEDE YOK (yeniden seçilebilir).
 * - 'sending' → HER ZAMAN bloklar (taze: başka instance gönderiyor olabilir;
 *   stale: sonuç bilinmiyor — otomatik resend YOK, sweep 'unknown_delivery'
 *   yapar ve karar operatörün).
 * - 'unknown_delivery' → bloklar (yalnız manuel reconcile açar).
 * - diğer her şey → gönderilmiş sayılır.
 */
export function filterSentToday(rows: ReminderRowLite[], nowMs: number): string[] {
  return rows
    .filter((r) => {
      if (r.status === 'send_failed') {
        const retryAt = r.metadata?.next_retry_at ? Date.parse(r.metadata.next_retry_at) : 0
        return Number.isFinite(retryAt) && retryAt > nowMs
      }
      return true
    })
    .map((r) => r.reminder_type)
}

export interface DispatchResult {
  sent: boolean
  messageId: number | null
  error: string | null
  attempts: number
  /** true → provider başardı ama DB finalize YAZILAMADI (CRITICAL; satır 'sending'). */
  recordError?: boolean
  /** true → claim alınamadı (başka instance aktif ya da bugün zaten sonuçlanmış). */
  skipped?: boolean
}

interface ExistingRow {
  status: string | null
  metadata: { attempts?: number; claimed_at?: string } | null
}

/**
 * Atomik claim: önce INSERT (unique date,reminder_type) → yarışta 23505.
 * Satır varsa CAS UPDATE: YALNIZ send_failed devralınır. 'sending' (taze veya
 * stale) ASLA devralınmaz — stale'in sonucu bilinmez; otomatik ikinci provider
 * çağrısı duplicate üretebilirdi (0.2). Karar sweep + manuel reconcile'da.
 * @returns attempts (bu deneme dahil) veya null = claim alınamadı.
 */
async function claimSending(date: string, reminderType: string, nowMs: number): Promise<number | null> {
  const nowIso = new Date(nowMs).toISOString()

  const { data: existing, error: readErr } = await supabaseAdmin
    .from('assistant_reminders')
    .select('status, metadata')
    .eq('date', date)
    .eq('reminder_type', reminderType)
    .maybeSingle()
  if (readErr) return null // okuma bile yoksa fail-closed: provider çağrılmaz.

  if (!existing) {
    const { error } = await supabaseAdmin.from('assistant_reminders').insert({
      date,
      reminder_type: reminderType,
      status: 'sending',
      sent_at: null,
      telegram_message_id: null,
      metadata: { attempts: 1, claimed_at: nowIso },
    })
    if (!error) return 1
    if (error.code === '23505') return null // yarışı başka instance kazandı.
    return null
  }

  const row = existing as ExistingRow
  const prevAttempts = row.metadata?.attempts ?? 0

  // Devralınabilir TEK durum: send_failed (provider'ın başarısız olduğu KESİN).
  if (row.status !== 'send_failed') return null

  const attempts = prevAttempts + 1
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('assistant_reminders')
    .update({
      status: 'sending',
      sent_at: null,
      telegram_message_id: null,
      metadata: { attempts, claimed_at: nowIso },
    })
    .eq('date', date)
    .eq('reminder_type', reminderType)
    .eq('status', row.status) // CAS: bu arada değiştiyse devralma.
    .select('reminder_type')
  if (updErr || !updated?.length) return null
  return attempts
}

/**
 * Reminder'ı at-most-once gönderir ve SONUCA GÖRE kaydeder.
 * @param successStatus başarıda yazılacak statü ('pending' = cevap bekleniyor, 'done' = tek yönlü).
 */
export async function dispatchReminder(opts: {
  date: string
  reminderType: string
  message: string
  successStatus?: 'pending' | 'done'
  nowMs?: number
}): Promise<DispatchResult> {
  const nowMs = opts.nowMs ?? Date.now()
  const nowIso = new Date(nowMs).toISOString()

  // 1) Atomik claim — alınamadıysa provider ÇAĞRILMAZ (çift gönderim imkânsız).
  const attempts = await claimSending(opts.date, opts.reminderType, nowMs)
  if (attempts == null) {
    return { sent: false, messageId: null, error: null, attempts: 0, skipped: true }
  }

  // 2) Provider.
  const result = await sendTelegramMessage(opts.message)

  if (result.ok) {
    // 3a) Finalize: kullanıcı mesajı GÖRDÜ → log + satırı sonuç durumuna çevir.
    await logConversationTurn({
      date: opts.date,
      role: 'assistant',
      message: opts.message,
      intent: opts.reminderType,
    })
    const { error: finErr } = await supabaseAdmin
      .from('assistant_reminders')
      .update({
        sent_at: nowIso,
        status: opts.successStatus ?? 'pending',
        telegram_message_id: result.messageId,
        metadata: attempts > 1 ? { attempts, recovered: true } : { attempts },
      })
      .eq('date', opts.date)
      .eq('reminder_type', opts.reminderType)
    if (finErr) {
      // KURAL 3: provider başardı, kayıt düştü → satır 'sending' kalır (bugün
      // yeniden gönderim YOK), CRITICAL görünürlük.
      console.error(
        '[reminderDispatch] CRITICAL: provider-success/DB-finalize-failure',
        opts.reminderType,
        finErr.code ?? finErr.message,
      )
      return { sent: true, messageId: result.messageId, error: null, attempts, recordError: true }
    }
    return { sent: true, messageId: result.messageId, error: null, attempts }
  }

  // 3b) Başarısızlık: success izi YOK; hata + attempt + next_retry_at görünür.
  const nextRetryAt = new Date(nowMs + nextRetryDelayMs(attempts)).toISOString()
  const { error: failErr } = await supabaseAdmin
    .from('assistant_reminders')
    .update({
      sent_at: null,
      status: 'send_failed',
      telegram_message_id: null,
      metadata: { attempts, last_error: result.error, next_retry_at: nextRetryAt },
    })
    .eq('date', opts.date)
    .eq('reminder_type', opts.reminderType)
  if (failErr) {
    // Satır 'sending' kaldı → sonuç bilinmiyor sayılır; sweep 'unknown_delivery'
    // yapar, otomatik resend YOK (0.2).
    console.error('[reminderDispatch] failure-record yazılamadı', failErr.code ?? failErr.message)
  }
  return { sent: false, messageId: null, error: result.error, attempts }
}

// ── Faz 0.2: unknown-delivery görünürlüğü + manuel reconcile ─────────────────

export interface UnknownDeliveryRow {
  date: string
  reminder_type: string
  claimed_at: string | null
  attempts: number
}

/**
 * STALE 'sending' satırlarını 'unknown_delivery' durumuna taşır (CAS'lı) ve
 * mevcut unknown listesini döner. OTOMATİK resend YOK — bu fonksiyon yalnız
 * görünürlük sağlar; karar operatörün (reconcileReminder).
 */
export async function sweepUnknownDeliveries(nowMs?: number): Promise<{
  swept: number
  unknown: UnknownDeliveryRow[]
  error: string | null
}> {
  const now = nowMs ?? Date.now()
  const { data, error } = await supabaseAdmin
    .from('assistant_reminders')
    .select('date, reminder_type, status, metadata')
    .in('status', ['sending', 'unknown_delivery'])
  if (error) return { swept: 0, unknown: [], error: error.message }

  let swept = 0
  const unknown: UnknownDeliveryRow[] = []
  for (const r of data ?? []) {
    const meta = (r.metadata ?? {}) as { claimed_at?: string; attempts?: number }
    const claimedAt = meta.claimed_at ? Date.parse(meta.claimed_at) : 0
    if (r.status === 'sending') {
      if (!(now - claimedAt >= STALE_SENDING_MS)) continue // taze — dokunma.
      const { data: upd, error: updErr } = await supabaseAdmin
        .from('assistant_reminders')
        .update({ status: 'unknown_delivery', metadata: { ...meta, unknown_since: new Date(now).toISOString() } })
        .eq('date', r.date)
        .eq('reminder_type', r.reminder_type)
        .eq('status', 'sending') // CAS: bu arada finalize olduysa dokunma.
        .select('reminder_type')
      if (updErr || !upd?.length) continue
      swept += 1
    }
    unknown.push({
      date: r.date,
      reminder_type: r.reminder_type,
      claimed_at: meta.claimed_at ?? null,
      attempts: meta.attempts ?? 0,
    })
  }
  return { swept, unknown, error: null }
}

/**
 * MANUEL reconcile (yalnız 'unknown_delivery' satırlar):
 * - 'assume_delivered' → done (mesajın ulaştığına operatör karar verdi).
 * - 'retry_send'       → send_failed + next_retry_at=şimdi (provider'ın İKİNCİ
 *   kez çağrılmasına AÇIK insan kararı; normal dispatch akışı devralır).
 */
export async function reconcileReminder(opts: {
  date: string
  reminderType: string
  decision: 'assume_delivered' | 'retry_send'
  nowMs?: number
}): Promise<{ ok: boolean; error: string | null }> {
  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()
  const patch =
    opts.decision === 'assume_delivered'
      ? { status: 'done', metadata: { reconciled: 'assume_delivered', reconciled_at: nowIso } }
      : { status: 'send_failed', metadata: { reconciled: 'retry_send', reconciled_at: nowIso, next_retry_at: nowIso, attempts: 0 } }
  const { data, error } = await supabaseAdmin
    .from('assistant_reminders')
    .update(patch)
    .eq('date', opts.date)
    .eq('reminder_type', opts.reminderType)
    .eq('status', 'unknown_delivery') // yalnız unknown reconcile edilebilir.
    .select('reminder_type')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'unknown_delivery satırı bulunamadı' }
  return { ok: true, error: null }
}
