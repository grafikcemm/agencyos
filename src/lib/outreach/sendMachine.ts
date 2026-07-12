// ─────────────────────────────────────────────────────────────────────────────
// At-most-once gönderim state machine (mig 054 — Faz 2).
//
// Garanti: aynı outreach_message_id için Gmail provider'ı EN FAZLA BİR kez
// çağrılır — eşzamanlı isteklerde, retry'larda ve provider-success/DB-failure
// senaryolarında.
//
// Mekanizma:
//  • claim = outreach_send_attempts'e INSERT (outreach_message_id UNIQUE) —
//    atomik; kaybeden 23505 alır ve provider'a ulaşamaz.
//  • her durum geçişi CAS: UPDATE ... eq(state) + eq(claim_token) — tek atomik
//    SQL; iki process aynı geçişi yapamaz.
//  • provider sonucu belirsizse (timeout/5xx) state='unknown' — KÖR RETRY YOK;
//    çözüm reconciliation (deterministik rfc_message_id ile gmail.readonly
//    araması) ya da operatör kararı.
//  • kalıcı kayıt finalize_outreach_send RPC'siyle TEK transaction.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'

export type SendAttemptState = 'claimed' | 'sending' | 'sent' | 'unknown' | 'failed' | 'reconciled'

export interface SendAttempt {
  id: string
  outreach_message_id: string
  approval_id: string
  action_digest: string
  rfc_message_id: string
  state: SendAttemptState
  claim_token: string
  attempt_count: number
  claimed_at: string
  sent_at: string | null
  provider_message_id: string | null
  provider_thread_id: string | null
  finalized: boolean
  last_error: string | null
}

/** Bir claim bu süreden uzun 'claimed'/'sending'te kalırsa bayat sayılır ve
 *  'unknown'a düşürülür (process ölmüş olabilir; provider sonucu belirsiz). */
export const STALE_CLAIM_MS = 2 * 60 * 1000

/** Deterministik RFC 2822 Message-ID — outreach id'den türetilir; retry'da
 *  DEĞİŞMEZ, reconciliation `rfc822msgid:` aramasının ankrajıdır. */
export function buildRfcMessageId(outreachMessageId: string): string {
  return `<outreach-${outreachMessageId}@agencyos.grafikcem>`
}

export type ClaimOutcome =
  | { kind: 'claimed'; attempt: SendAttempt }
  | { kind: 'alreadySent'; attempt: SendAttempt }
  | { kind: 'inProgress'; attempt: SendAttempt }
  | { kind: 'needsReconciliation'; attempt: SendAttempt }
  | { kind: 'error'; error: string }

async function loadAttempt(outreachMessageId: string): Promise<SendAttempt | null> {
  const { data } = await supabaseAdmin
    .from('outreach_send_attempts')
    .select('*')
    .eq('outreach_message_id', outreachMessageId)
    .maybeSingle()
  return (data as SendAttempt) ?? null
}

/** CAS geçişi: yalnız beklenen state + claim_token eşleşirse günceller.
 *  Dönen satır yoksa geçiş kaybedilmiştir (başka process önce davranmış). */
async function casTransition(
  attemptId: string,
  claimToken: string,
  fromStates: SendAttemptState[],
  patch: Partial<SendAttempt> & { state: SendAttemptState }
): Promise<SendAttempt | null> {
  const { data, error } = await supabaseAdmin
    .from('outreach_send_attempts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', attemptId)
    .eq('claim_token', claimToken)
    .in('state', fromStates)
    .select('*')
    .maybeSingle()
  if (error) return null
  return (data as SendAttempt) ?? null
}

/** Atomik claim. Kazanan 'claimed' satırıyla döner; kaybeden mevcut satırın
 *  durumuna göre alreadySent / inProgress / needsReconciliation alır.
 *  'failed' satır CAS ile yeniden claim edilebilir (attempt_count+1). */
export async function claimSendAttempt(opts: {
  outreachMessageId: string
  approvalId: string
  actionDigest: string
  nowMs?: number
}): Promise<ClaimOutcome> {
  const nowMs = opts.nowMs ?? Date.now()
  const claimToken = randomUUID()
  const insert = {
    outreach_message_id: opts.outreachMessageId,
    approval_id: opts.approvalId,
    action_digest: opts.actionDigest,
    rfc_message_id: buildRfcMessageId(opts.outreachMessageId),
    state: 'claimed' as const,
    claim_token: claimToken,
    claimed_at: new Date(nowMs).toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('outreach_send_attempts')
    .insert(insert)
    .select('*')
    .maybeSingle()

  if (!error && data) return { kind: 'claimed', attempt: data as SendAttempt }

  const isUniqueViolation = error && /duplicate key|23505/i.test(error.message)
  if (!isUniqueViolation) {
    return { kind: 'error', error: `claim yazılamadı: ${error?.message ?? 'bilinmeyen'}` }
  }

  // Claim kaybedildi — mevcut satırın durumuna göre karar.
  const existing = await loadAttempt(opts.outreachMessageId)
  if (!existing) return { kind: 'error', error: 'claim çakıştı ama satır okunamadı' }

  switch (existing.state) {
    case 'sent':
    case 'reconciled':
      return { kind: 'alreadySent', attempt: existing }
    case 'unknown':
      return { kind: 'needsReconciliation', attempt: existing }
    case 'claimed':
    case 'sending': {
      const claimedAtMs = Date.parse(existing.claimed_at)
      if (Number.isFinite(claimedAtMs) && nowMs - claimedAtMs > STALE_CLAIM_MS) {
        // Bayat claim: process ölmüş olabilir; provider sonucu bilinmiyor →
        // 'unknown'a düşür (kör retry YOK — reconciliation gerekir).
        const moved = await casTransition(existing.id, existing.claim_token, ['claimed', 'sending'], {
          state: 'unknown',
          last_error: `bayat claim (${Math.round((nowMs - claimedAtMs) / 1000)}s) — reconciliation gerekli`,
        })
        return { kind: 'needsReconciliation', attempt: moved ?? existing }
      }
      return { kind: 'inProgress', attempt: existing }
    }
    case 'failed': {
      // Kesin başarısızlık sonrası yeniden deneme: CAS re-claim (yalnız bir
      // process kazanır — eq state='failed' filtresi atomik).
      const reclaimed = await casTransition(existing.id, existing.claim_token, ['failed'], {
        state: 'claimed',
        claim_token: claimToken,
        attempt_count: existing.attempt_count + 1,
        claimed_at: new Date(nowMs).toISOString(),
        last_error: null,
      } as Partial<SendAttempt> & { state: SendAttemptState })
      if (reclaimed) return { kind: 'claimed', attempt: reclaimed }
      const latest = await loadAttempt(opts.outreachMessageId)
      return latest
        ? { kind: 'inProgress', attempt: latest }
        : { kind: 'error', error: 're-claim yarışı sonrası satır okunamadı' }
    }
    default:
      return { kind: 'error', error: `bilinmeyen state: ${existing.state}` }
  }
}

/** claimed → sending. false dönerse provider ÇAĞRILMAZ. */
export async function markSending(attempt: SendAttempt): Promise<SendAttempt | null> {
  return casTransition(attempt.id, attempt.claim_token, ['claimed'], { state: 'sending' })
}

/** sending → sent (provider başarı; küçük/hızlı CAS — finalize RPC'den önce
 *  provider id'lerini güvenceye alır). */
export async function markSentProvider(
  attempt: SendAttempt,
  providerMessageId: string,
  providerThreadId: string,
  nowMs: number = Date.now()
): Promise<SendAttempt | null> {
  return casTransition(attempt.id, attempt.claim_token, ['sending'], {
    state: 'sent',
    provider_message_id: providerMessageId,
    provider_thread_id: providerThreadId,
    sent_at: new Date(nowMs).toISOString(),
  } as Partial<SendAttempt> & { state: SendAttemptState })
}

/** → failed (KESİN başarısızlık: provider kabul etmedi — 4xx sınıfı; ya da
 *  reconciliation "gönderilmemiş" kararı verdi). 'failed' yeniden claim
 *  edilebilir. 'unknown'dan geçiş yalnız reconciliation kararıyla yapılır. */
export async function markFailed(attempt: SendAttempt, reason: string): Promise<SendAttempt | null> {
  return casTransition(attempt.id, attempt.claim_token, ['claimed', 'sending', 'unknown'], {
    state: 'failed',
    last_error: reason.slice(0, 500),
  })
}

/** sending → unknown (BELİRSİZ sonuç: timeout/5xx/ağ hatası — mail gitmiş
 *  OLABİLİR). Kör retry yasak; reconciliation bekler. */
export async function markUnknown(attempt: SendAttempt, reason: string): Promise<SendAttempt | null> {
  return casTransition(attempt.id, attempt.claim_token, ['claimed', 'sending', 'sent'], {
    state: 'unknown',
    last_error: reason.slice(0, 500),
  })
}

/** Tek-transaction kalıcı kayıt (mig 054 RPC). Idempotent — finalized=true
 *  ise no-op. Başarısızsa provider'a DOKUNMADAN tekrar çağrılabilir. */
export async function finalizeSend(opts: {
  attempt: SendAttempt
  approvalId: string
  gmailMessageId: string
  gmailThreadId: string
  fromAddress: string
  toAddress: string
  subject: string
  body: string
  sentAtIso: string
  finalState?: 'sent' | 'reconciled'
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc('finalize_outreach_send', {
    p_outreach_message_id: opts.attempt.outreach_message_id,
    p_approval_id: opts.approvalId,
    p_claim_token: opts.attempt.claim_token,
    p_gmail_message_id: opts.gmailMessageId,
    p_gmail_thread_id: opts.gmailThreadId,
    p_from_address: opts.fromAddress,
    p_to_address: opts.toAddress,
    p_subject: opts.subject,
    p_body: opts.body,
    p_sent_at: opts.sentAtIso,
    p_final_state: opts.finalState ?? 'sent',
  })
  if (error) return { ok: false, error: error.message }
  const result = data as { ok: boolean; error?: string } | null
  if (!result?.ok) return { ok: false, error: result?.error ?? 'finalize bilinmeyen hata' }
  return { ok: true }
}

export async function getSendAttempt(outreachMessageId: string): Promise<SendAttempt | null> {
  return loadAttempt(outreachMessageId)
}

// ── Transport adapter (test edilebilir provider sınırı) ──────────────────────

/** Provider hatası sınıflandırması: `ambiguous=true` → mail gitmiş OLABİLİR
 *  (timeout/5xx/ağ); `false` → provider kesin reddetti (4xx). */
export class GmailTransportError extends Error {
  readonly ambiguous: boolean
  constructor(message: string, ambiguous: boolean) {
    super(message)
    this.name = 'GmailTransportError'
    this.ambiguous = ambiguous
  }
}

export interface GmailTransport {
  /** RFC 2822 raw (base64url) gönderir; Gmail id/threadId döner. Hatada
   *  GmailTransportError fırlatır (ambiguous sınıflandırmasıyla). */
  send(opts: { fromAddress: string; raw: string }): Promise<{ id: string; threadId: string }>
  /** Reconciliation: deterministik Message-ID ile arama (gmail.readonly).
   *  Bulunamazsa null. */
  findByRfcMessageId(rfcMessageId: string): Promise<{ id: string; threadId: string } | null>
}

/** Dry-run transport: deterministik mock id'ler; hiçbir ağ çağrısı yok. */
export function createDryRunTransport(outreachMessageId: string, existingThreadId?: string | null): GmailTransport {
  return {
    async send() {
      return {
        id: `dryrun-${outreachMessageId}`,
        threadId: existingThreadId ?? `dryrun-thread-${outreachMessageId}`,
      }
    },
    async findByRfcMessageId() {
      return null
    },
  }
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export type ReconcileResult =
  | { outcome: 'reconciled_sent'; providerMessageId: string }
  | { outcome: 'not_found_marked_failed' }
  | { outcome: 'no_action'; reason: string }
  | { outcome: 'error'; error: string }

/** Belirsiz ('unknown') ya da bayat 'sending' attempt'i çözer:
 *  1. Gmail'de deterministik Message-ID ara (KÖR RETRY DEĞİL).
 *  2. Bulunursa → sent + finalize (state 'reconciled').
 *  3. Bulunamazsa → 'failed' (yeniden claim edilebilir).
 *  Finalize parametreleri çağırandan gelir (içerik DB'deki onaylı içeriktir). */
export async function reconcileSendAttempt(opts: {
  attempt: SendAttempt
  transport: GmailTransport
  approvalId: string
  fromAddress: string
  toAddress: string
  subject: string
  body: string
  nowMs?: number
}): Promise<ReconcileResult> {
  const { attempt } = opts
  if (attempt.state === 'sent' && !attempt.finalized) {
    // Provider başarılı ama finalize yarıda kalmış — yalnız finalize tekrarı.
    const fin = await finalizeSend({
      attempt,
      approvalId: opts.approvalId,
      gmailMessageId: attempt.provider_message_id ?? '',
      gmailThreadId: attempt.provider_thread_id ?? '',
      fromAddress: opts.fromAddress,
      toAddress: opts.toAddress,
      subject: opts.subject,
      body: opts.body,
      sentAtIso: attempt.sent_at ?? new Date(opts.nowMs ?? Date.now()).toISOString(),
    })
    if (!fin.ok) return { outcome: 'error', error: fin.error ?? 'finalize başarısız' }
    return { outcome: 'reconciled_sent', providerMessageId: attempt.provider_message_id ?? '' }
  }

  if (attempt.state !== 'unknown' && attempt.state !== 'sending') {
    return { outcome: 'no_action', reason: `state '${attempt.state}' reconciliation gerektirmiyor` }
  }

  let found: { id: string; threadId: string } | null
  try {
    found = await opts.transport.findByRfcMessageId(attempt.rfc_message_id)
  } catch (err) {
    return { outcome: 'error', error: err instanceof Error ? err.message : 'arama hatası' }
  }

  if (found) {
    const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString()
    const fin = await finalizeSend({
      attempt,
      approvalId: opts.approvalId,
      gmailMessageId: found.id,
      gmailThreadId: found.threadId,
      fromAddress: opts.fromAddress,
      toAddress: opts.toAddress,
      subject: opts.subject,
      body: opts.body,
      sentAtIso: nowIso,
      finalState: 'reconciled',
    })
    if (!fin.ok) return { outcome: 'error', error: fin.error ?? 'finalize başarısız' }
    console.warn(`[email.reconciled] outreach=${attempt.outreach_message_id} providerMessageId=${found.id}`)
    return { outcome: 'reconciled_sent', providerMessageId: found.id }
  }

  const failed = await markFailed(attempt, 'reconciliation: Gmail aramasında bulunamadı — gönderilmemiş sayıldı')
  if (!failed) {
    // CAS kaybedildi (paralel reconcile?) — durum değişmiş; tekrar bakılmalı.
    return { outcome: 'error', error: 'failed geçişi CAS kaybetti — durumu yeniden kontrol edin' }
  }
  return { outcome: 'not_found_marked_failed' }
}
