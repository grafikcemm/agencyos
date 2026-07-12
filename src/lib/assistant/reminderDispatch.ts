// ─────────────────────────────────────────────────────────────────────────────
// Reminder gönderim + kayıt (Faz B2 — "sahte başarı" düzeltmesi).
//
// ESKİ BUG: sendTelegram null dönse bile assistant_reminders 'pending' upsert
// ediliyordu → sentToday kilitlenir, retry imkânsız; conversation log da
// kullanıcının GÖRMEDİĞİ mesajı geçmişe yazıyordu.
//
// YENİ KURAL: message_id yoksa "gönderildi" YOK.
// - Başarı → conversation log + reminder upsert (tek satır; onConflict date,type).
// - Başarısızlık → status='send_failed' + metadata{attempts,last_error,next_retry_at};
//   conversation log YAZILMAZ. Sonraki cron'da next_retry_at geçtiyse yeniden dener;
//   başarılı retry AYNI satırı 'pending'/'done'a çevirir → tam bir kayıt.
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { sendTelegramMessage } from '@/lib/telegram/client'
import { logConversationTurn } from '@/lib/assistant/memory'

/** Başarısız denemeler için backoff: 5dk, 15dk, 45dk… (cap 4 saat). */
export function nextRetryDelayMs(attempts: number): number {
  const base = 5 * 60_000 * Math.pow(3, Math.max(0, attempts - 1))
  return Math.min(base, 4 * 60 * 60_000)
}

interface ReminderRowLite {
  reminder_type: string
  status: string | null
  metadata: { next_retry_at?: string } | null
}

/**
 * sentToday filtresi: 'send_failed' satırlar retry vadesi GELDİYSE "gönderilmemiş"
 * sayılır (getDueReminder yeniden seçebilsin); vadesi gelmemişse bloklar (hammer yok).
 */
export function filterSentToday(rows: ReminderRowLite[], nowMs: number): string[] {
  return rows
    .filter((r) => {
      if (r.status !== 'send_failed') return true
      const retryAt = r.metadata?.next_retry_at ? Date.parse(r.metadata.next_retry_at) : 0
      return Number.isFinite(retryAt) && retryAt > nowMs // vade gelmedi → hâlâ "dolu" say
    })
    .map((r) => r.reminder_type)
}

export interface DispatchResult {
  sent: boolean
  messageId: number | null
  error: string | null
  attempts: number
}

/**
 * Reminder'ı gönderir ve SONUCA GÖRE kaydeder.
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

  // Önceki deneme sayısını oku (varsa) — attempt görünürlüğü için.
  let prevAttempts = 0
  try {
    const { data } = await supabaseAdmin
      .from('assistant_reminders')
      .select('status, metadata')
      .eq('date', opts.date)
      .eq('reminder_type', opts.reminderType)
      .maybeSingle()
    const meta = (data?.metadata ?? null) as { attempts?: number } | null
    if (data?.status === 'send_failed') prevAttempts = meta?.attempts ?? 0
  } catch {
    /* best-effort */
  }

  const result = await sendTelegramMessage(opts.message)

  if (result.ok) {
    // Kullanıcı mesajı GÖRDÜ → şimdi loglanabilir.
    await logConversationTurn({
      date: opts.date,
      role: 'assistant',
      message: opts.message,
      intent: opts.reminderType,
    })
    await supabaseAdmin.from('assistant_reminders').upsert(
      {
        date: opts.date,
        reminder_type: opts.reminderType,
        sent_at: nowIso,
        status: opts.successStatus ?? 'pending',
        telegram_message_id: result.messageId,
        metadata: prevAttempts > 0 ? { attempts: prevAttempts + 1, recovered: true } : null,
      },
      { onConflict: 'date,reminder_type' },
    )
    return { sent: true, messageId: result.messageId, error: null, attempts: prevAttempts + 1 }
  }

  // Başarısızlık: success izi YOK; hata + attempt + next_retry_at görünür.
  const attempts = prevAttempts + 1
  const nextRetryAt = new Date(nowMs + nextRetryDelayMs(attempts)).toISOString()
  try {
    await supabaseAdmin.from('assistant_reminders').upsert(
      {
        date: opts.date,
        reminder_type: opts.reminderType,
        sent_at: null,
        status: 'send_failed',
        telegram_message_id: null,
        metadata: { attempts, last_error: result.error, next_retry_at: nextRetryAt },
      },
      { onConflict: 'date,reminder_type' },
    )
  } catch {
    /* kayıt bile düşerse cron bir sonraki turda yeniden dener (satır yok = due) */
  }
  return { sent: false, messageId: null, error: result.error, attempts }
}
