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
// KURAL 3 (0.5): provider-success + DB-record-failure → satır 'sending' kalır
//   (CRITICAL log + result.recordError). 'sending' satır o gün yeniden
//   gönderime KAPALIDIR (duplicate yapısal imkânsız). Telegram'da Gmail'deki
//   gibi Message-ID araması yoktur → reconcile YERİNE stale-sending kurtarması:
//   STALE_SENDING_MS'ten eski 'sending' (crash-before-send ~kesin; send <15 sn
//   sürer) send_failed'a çevrilir ve normal retry akışına döner. Çok nadir
//   record-fail-after-success vakası CRITICAL loglanır — bilinçli takas:
//   duplicate riski yalnız bu loglu vakada, kayıp yalnız aynı gün içinde.
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { sendTelegramMessage } from '@/lib/telegram/client'
import { logConversationTurn } from '@/lib/assistant/memory'

/** Başarısız denemeler için backoff: 5dk, 15dk, 45dk… (cap 4 saat). */
export function nextRetryDelayMs(attempts: number): number {
  const base = 5 * 60_000 * Math.pow(3, Math.max(0, attempts - 1))
  return Math.min(base, 4 * 60 * 60_000)
}

/** 'sending' claim bu süreden eskiyse crash-before-send say (send <15 sn). */
export const STALE_SENDING_MS = 10 * 60_000

interface ReminderRowLite {
  reminder_type: string
  status: string | null
  metadata: { next_retry_at?: string; claimed_at?: string } | null
}

/**
 * sentToday filtresi:
 * - 'send_failed' + retry vadesi geçti → LİSTEDE YOK (yeniden seçilebilir).
 * - 'sending' + TAZE → bloklar (başka instance gönderiyor olabilir).
 * - 'sending' + STALE → LİSTEDE YOK (crash kurtarması; dispatch CAS ile devralır).
 * - diğer her şey → gönderilmiş sayılır.
 */
export function filterSentToday(rows: ReminderRowLite[], nowMs: number): string[] {
  return rows
    .filter((r) => {
      if (r.status === 'send_failed') {
        const retryAt = r.metadata?.next_retry_at ? Date.parse(r.metadata.next_retry_at) : 0
        return Number.isFinite(retryAt) && retryAt > nowMs
      }
      if (r.status === 'sending') {
        const claimedAt = r.metadata?.claimed_at ? Date.parse(r.metadata.claimed_at) : 0
        return Number.isFinite(claimedAt) && nowMs - claimedAt < STALE_SENDING_MS
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
 * Satır varsa CAS UPDATE: yalnız send_failed VEYA stale-sending devralınır.
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

  // Devralınabilir durumlar: send_failed (retry) veya STALE sending (crash kurtarması).
  const claimedAt = row.metadata?.claimed_at ? Date.parse(row.metadata.claimed_at) : 0
  const staleSending = row.status === 'sending' && nowMs - claimedAt >= STALE_SENDING_MS
  if (row.status !== 'send_failed' && !staleSending) return null

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
    // Satır 'sending' kaldı → STALE_SENDING_MS sonra kurtarma devralır.
    console.error('[reminderDispatch] failure-record yazılamadı', failErr.code ?? failErr.message)
  }
  return { sent: false, messageId: null, error: result.error, attempts }
}
