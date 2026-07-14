// ─────────────────────────────────────────────────────────────────────────────
// Telegram webhook cevabı — durable outbox/delivery ledger (Sprint-3 Faz 1, v2).
//
// PROBLEMLER (v1):
// 1. Her 23505 status'a bakılmadan "deduped başarı" sayılıyordu — mevcut satır
//    'failed' ise kullanıcı mesajı HİÇ görmemişken claim complete olabiliyordu.
// 2. Provider'ın belirsiz sonucu (timeout/5xx) 'failed' yazılıyor, üst katman
//    (replyGuaranteed) YENİ delivery key ile ikinci provider çağrısı yapıyordu
//    → duplicate riski.
//
// v2 durum makinesi (aynı delivery_key için):
//   INSERT 'sending' (attempt 1) ──provider──▶ sent | failed | unknown
//   23505 → mevcut satır:
//     sent            → GERÇEK dedupe (delivered kabul edilir; provider 0 çağrı)
//     unknown         → provider 0 çağrı; OTOMATİK resend ASLA (manuel reconcile)
//     failed          → kontrollü retry: CAS failed→sending (attempt+1) kazanan
//                       AYNI key ile provider'ı yeniden çağırır
//     sending (taze)  → in-progress (başka worker çalışıyor; provider 0 çağrı)
//     sending (bayat) → CAS sending→unknown (crash izi) → unknown kuralları
//   Provider sonucu:
//     ok              → finalize 'sent'
//     KESİN hata      → finalize 'failed' (sonraki webhook retry devralabilir)
//     BELİRSİZ hata   → finalize 'unknown' (resend YOK; reconcile kararı insanda)
//   Finalize yazılamadı + provider ok → satır 'sending' kalır, CRITICAL log,
//     sonuç deliveredButUnrecorded — claim COMPLETE OLAMAZ (authoritative).
//
// Exactly-once İDDİA EDİLMEZ — bu at-most-once + görünür-belirsizlik modelidir.
// Ledger yoksa (006 canlı değil): 'unledgered' düz gönderim — durable başarı
// TAKLİT EDİLMEZ; belirsiz sonuç yine delivered=false sayılır.
// ─────────────────────────────────────────────────────────────────────────────

import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { sendTelegramMessage } from '@/lib/telegram/client'

export type ReplyDeliveryKind =
  | 'sent' // bu çağrıda provider'a gitti ve KESİN başarılı
  | 'deduped_sent' // önceki denemede 'sent' — gerçek dedupe (teslim kanıtlı)
  | 'failed' // KESİN başarısızlık (Telegram işlemedi) — retry güvenli
  | 'unknown' // sonuç belirsiz — OTOMATİK resend ASLA; manuel reconcile
  | 'in_progress' // aynı key başka worker'da taze lease ile işleniyor
  | 'ledger_unavailable' // prod: ledger yazılamadı → provider hiç çağrılmadı
  | 'sent_unrecorded' // provider başarılı AMA finalize yazılamadı (satır sending)
  | 'unledgered_sent' // 006 yok: ledger'sız düz gönderim başarılı (005 sınırı)
  | 'unledgered_failed' // 006 yok: düz gönderim başarısız/belirsiz

export interface ReplyDeliveryResult {
  /** Kullanıcının mesajı GÖRDÜĞÜ KANITLI: sent | deduped_sent | unledgered_sent. */
  delivered: boolean
  kind: ReplyDeliveryKind
  /**
   * Claim'in complete olmasına izin verir mi? delivered VE kayıt tutarlı.
   * sent_unrecorded delivered=true ama countsAsDelivered=false: ledger finalize
   * başarısızlığı AUTHORITATIVE'dir (Faz 1.8) — 200 dönülmez, Telegram retry'ında
   * satır bayat-sending→unknown olur ve reconcile ile kapanır.
   */
  countsAsDelivered: boolean
  httpStatus: number
  error: string | null
}

// FINALIZATION Faz 5: tablo YA DA 006 kolonları (attempt_count/claimed_at/
// 'pending') eksikse aynı fail-closed sınıfındadır — üretimde provider ASLA
// çağrılmaz (unledgered üretim fallback'i KALDIRILDI).
const TABLE_MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])
const LEDGER_MISSING_DIAGNOSTIC =
  'telegram_outbound_deliveries şeması eksik (LIFE mig 006 v3 uygulanmadı) — ' +
  'provider ÇAĞRILMADI (duplicate riski alınmaz). Çözüm: LIFE 006 v3 migration + ' +
  '/api/telegram/diagnostics readiness kontrolü; onaysız canlı migration yapılmaz.'
/** 'sending' satırın taze sayıldığı süre — webhook işleme + provider timeout payı. */
export const SENDING_LEASE_MS = 30_000

export function replyDeliveryKey(updateId: number, seq: number): string {
  return `update:${updateId}:reply:${seq}`
}

function result(
  kind: ReplyDeliveryKind,
  httpStatus: number,
  error: string | null = null,
): ReplyDeliveryResult {
  const delivered =
    kind === 'sent' || kind === 'deduped_sent' || kind === 'unledgered_sent' || kind === 'sent_unrecorded'
  const countsAsDelivered = kind === 'sent' || kind === 'deduped_sent' || kind === 'unledgered_sent'
  return { delivered, countsAsDelivered, kind, httpStatus, error }
}

interface LedgerRow {
  status: string
  claimed_at: string | null
  attempt_count: number | null
}

async function readRow(key: string): Promise<LedgerRow | null> {
  const { data } = await lifeSupabaseAdmin
    .from('telegram_outbound_deliveries')
    .select('status, claimed_at, attempt_count')
    .eq('delivery_key', key)
    .maybeSingle()
  return (data as LedgerRow | null) ?? null
}

/**
 * Mevcut satıra göre karar ver (23505 sonrası). Dönen değer:
 * - {proceed:true, attempt} → provider çağrısına DEVAM (failed devralındı)
 * - {proceed:false, result} → terminal sonuç
 */
async function resolveExisting(
  key: string,
  nowMs: number,
): Promise<{ proceed: true; attempt: number } | { proceed: false; result: ReplyDeliveryResult }> {
  const row = await readRow(key)
  if (!row) {
    // 23505 dedi ama satır okunamadı → belirsizlik; güvenli taraf: in_progress.
    return { proceed: false, result: result('in_progress', 0) }
  }
  if (row.status === 'sent') return { proceed: false, result: result('deduped_sent', 0) }
  if (row.status === 'unknown') {
    return {
      proceed: false,
      result: result('unknown', 0, 'önceki deneme sonucu belirsiz — otomatik resend yapılmaz'),
    }
  }
  if (row.status === 'failed') {
    // Kontrollü retry: CAS failed→sending. Kazanan AYNI key ile provider'ı çağırır.
    const nextAttempt = (row.attempt_count ?? 1) + 1
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_outbound_deliveries')
      .update({
        status: 'sending',
        attempt_count: nextAttempt,
        claimed_at: new Date(nowMs).toISOString(),
        updated_at: new Date(nowMs).toISOString(),
      })
      .eq('delivery_key', key)
      .eq('status', 'failed')
      .select('id')
    if (error || !data?.length) {
      // Yarışı kaybettik → başka worker devraldı.
      return { proceed: false, result: result('in_progress', 0) }
    }
    return { proceed: true, attempt: nextAttempt }
  }
  // status === 'sending' (veya 'pending')
  const claimedAtMs = row.claimed_at ? Date.parse(row.claimed_at) : 0
  if (nowMs - claimedAtMs < SENDING_LEASE_MS) {
    return { proceed: false, result: result('in_progress', 0) }
  }
  // Bayat sending = önceki worker provider çağrısı ortasında öldü → sonuç
  // BELİRSİZ. Satır unknown'a düşürülür (CAS); resend ASLA otomatik değil.
  await lifeSupabaseAdmin
    .from('telegram_outbound_deliveries')
    .update({
      status: 'unknown',
      last_error: 'stale sending — worker crash şüphesi, sonuç belirsiz',
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq('delivery_key', key)
    .eq('status', row.status)
    .eq('claimed_at', row.claimed_at)
  return {
    proceed: false,
    result: result('unknown', 0, 'bayat sending → unknown; manuel reconcile gerekli'),
  }
}

export async function sendReplyOnce(opts: {
  updateId: number
  seq: number
  text: string
  nowMs?: number
}): Promise<ReplyDeliveryResult> {
  const key = replyDeliveryKey(opts.updateId, opts.seq)
  const nowMs = opts.nowMs ?? Date.now()

  // 1) Delivery claim — provider'dan ÖNCE (at-most-once temeli).
  let unledgered = false
  let attempt = 1
  try {
    const { error } = await lifeSupabaseAdmin.from('telegram_outbound_deliveries').insert({
      delivery_key: key,
      update_id: opts.updateId,
      purpose: 'webhook_reply',
      status: 'sending',
      attempt_count: 1,
      claimed_at: new Date(nowMs).toISOString(),
    })
    if (error) {
      if (error.code === '23505') {
        const decision = await resolveExisting(key, nowMs)
        if (!decision.proceed) return decision.result
        attempt = decision.attempt
      } else if (TABLE_MISSING.has(error.code ?? '')) {
        // FINALIZATION Faz 5: ÜRETİMDE unledgered gönderim YOK — şema eksikse
        // provider çağrılmaz (fail-closed) + eyleme dönük teşhis döner.
        if (process.env.NODE_ENV === 'production') {
          console.error('[replyDelivery] FAIL-CLOSED: ledger şeması eksik — provider çağrılmadı', key, error.code)
          return result('ledger_unavailable', 0, LEDGER_MISSING_DIAGNOSTIC)
        }
        unledgered = true
        console.warn('[replyDelivery] ledger şeması yok (006 bekliyor) — unledgered gönderim (YALNIZ dev)', key)
      } else if (process.env.NODE_ENV === 'production') {
        console.error('[replyDelivery] claim yazılamadı — provider çağrılmadı', error.code ?? error.message)
        return result('ledger_unavailable', 0, 'delivery ledger unavailable')
      } else {
        unledgered = true
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[replyDelivery] claim exception — provider çağrılmadı', err instanceof Error ? err.message : 'unknown')
      return result('ledger_unavailable', 0, 'delivery ledger unavailable')
    }
    unledgered = true
  }

  // 2) Provider.
  const send = await sendTelegramMessage(opts.text)

  if (unledgered) {
    if (send.ok) return result('unledgered_sent', send.status)
    // FINALIZATION Faz 5: ledger'sız (yalnız dev) BELİRSİZ sonuç 'unknown'
    // sınıfındadır — replyGuaranteed dahil HİÇBİR yol yeni seq ile ikinci
    // provider çağrısı yapamaz (duplicate riski). KESİN hata → unledgered_failed.
    if (send.ambiguous) {
      return result('unknown', send.status, `ledger'sız belirsiz sonuç — otomatik resend yapılmaz: ${send.error ?? ''}`)
    }
    return result('unledgered_failed', send.status, send.error)
  }

  // 3) Finalize (CAS: yalnız bizim 'sending' satırımız).
  const terminal: 'sent' | 'failed' | 'unknown' = send.ok
    ? 'sent'
    : send.ambiguous
      ? 'unknown'
      : 'failed'
  const patch: Record<string, unknown> = {
    status: terminal,
    updated_at: new Date().toISOString(),
  }
  if (send.ok) patch.message_id = send.messageId
  else patch.last_error = (send.error ?? 'unknown').slice(0, 300)

  try {
    const { data, error } = await lifeSupabaseAdmin
      .from('telegram_outbound_deliveries')
      .update(patch)
      .eq('delivery_key', key)
      .eq('status', 'sending')
      .eq('attempt_count', attempt) // fencing: devralınmış denemenin finalize'ı 0 satır etkiler
      .select('id')
    if (error || !data?.length) {
      if (send.ok) {
        // Provider başardı, kayıt düşmedi → AUTHORITATIVE başarısızlık:
        // claim complete OLAMAZ; satır bayat-sending→unknown yoluyla reconcile edilir.
        console.error('[replyDelivery] CRITICAL: provider-success/finalize-failure', key, error?.code ?? '0rows')
        return result('sent_unrecorded', send.status, 'finalize yazılamadı')
      }
      console.error('[replyDelivery] failure-finalize yazılamadı', key, error?.code ?? '0rows')
    }
  } catch (err) {
    if (send.ok) {
      console.error('[replyDelivery] CRITICAL: provider-success/finalize-exception', key, err instanceof Error ? err.message : 'unknown')
      return result('sent_unrecorded', send.status, 'finalize exception')
    }
  }

  if (send.ok) return result('sent', send.status)
  if (terminal === 'unknown') {
    return result('unknown', send.status, send.error)
  }
  return result('failed', send.status, send.error)
}
