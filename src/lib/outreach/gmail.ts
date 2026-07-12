// ─────────────────────────────────────────────────────────────────────────────
// Gmail L2 send çekirdeği (Sprint 0/1 — WS E, 12-gmail-and-followup-engine.md).
// TEK gönderim fonksiyonu: sendGmailMessage — hiçbir route-handler doğrudan
// Gmail API çağırmaz (T5). Akış:
//   taslak (outreach_messages) → audit-compliance deterministik kapı (T8)
//   → HITL onay (approval_requests digest-lock, mig 043 — YENİ onay sistemi YOK)
//   → send (GMAIL_SEND_ENABLED=false → DRY-RUN mock; akışın kalanı gerçek)
//   → markMessageSent (mevcut idempotency) → email_threads/email_messages (046)
//   → [email.sent] event logu.
// Duplicate-send yapısal imkânsız (T6): sent_at no-op + approval executed +
// email_messages.gmail_message_id UNIQUE.
// Gerçek send: Gmail REST (gmail.googleapis.com users.me/messages/send) —
// googleapis SDK bağımlılığı BİLİNÇLİ eklenmedi: tek endpoint + fetch yeterli,
// tedarik-zinciri yüzeyi küçük kalır (handoff'taki SDK önerisinden kayıtlı sapma).
// OAuth token akışı kullanıcı yetkilendirmesi + bağımsız güvenlik incelemesi
// gerektirir (19 §5) — o gelene kadar gerçek yol açıklayıcı hata verir.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { computeActionDigest } from '@/lib/brain/gate'
import { buildApprovalDraft, DEFAULT_APPROVAL_TTL_MS } from '@/lib/approvals/integrity'
import { getApproval } from '@/lib/approvals/repo'
import { auditCompliance, extractDomain } from '@/lib/outreach/auditCompliance'
import { isGmailSendEnabled } from '@/lib/outreach/flags'
import { redactForLog } from '@/lib/redact'
import {
  claimSendAttempt,
  markSending,
  markSentProvider,
  markFailed,
  markUnknown,
  finalizeSend,
  getSendAttempt,
  reconcileSendAttempt,
  buildRfcMessageId,
  createDryRunTransport,
  GmailTransportError,
  type GmailTransport,
  type SendAttempt,
} from '@/lib/outreach/sendMachine'

export const SEND_GMAIL_ACTION = 'send-gmail'

interface OutreachRow {
  id: string
  lead_id: string | null
  channel: string
  status: string
  subject: string | null
  body: string
  final_body: string | null
  sent_at: string | null
  gmail_message_id: string | null
  gmail_thread_id: string | null
}

interface LeadContact {
  id: string
  business_name: string | null
  email: string | null
  do_not_contact: boolean | null
}

async function loadOutreachRow(id: string): Promise<OutreachRow | null> {
  const { data } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, lead_id, channel, status, subject, body, final_body, sent_at, gmail_message_id, gmail_thread_id')
    .eq('id', id)
    .maybeSingle()
  return (data as OutreachRow) ?? null
}

async function loadLeadContact(leadId: string): Promise<LeadContact | null> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, email, do_not_contact')
    .eq('id', leadId)
    .maybeSingle()
  return (data as LeadContact) ?? null
}

function effectiveContent(row: OutreachRow): { subject: string; body: string } {
  return { subject: row.subject ?? '', body: (row.final_body ?? row.body ?? '').trim() }
}

// ONAYLANAN içerik dijesti — konu+gövde+alıcı; onaydan sonra içerik değişirse
// yürütme anındaki digest eşleşmez ve gönderim yürümez (§13 bütünlük).
export function computeSendArgs(outreachMessageId: string, to: string, subject: string, body: string) {
  const contentDigest = createHash('sha256').update(`${subject}\n\n${body}`).digest('hex')
  return { action: SEND_GMAIL_ACTION, outreachMessageId, to: to.toLowerCase(), contentDigest }
}

// ── Onay isteği (HITL) ───────────────────────────────────────────────────────

export interface RequestSendResult {
  ok: boolean
  approvalId?: string
  status?: string
  blockedReasons?: string[]
  error?: string
}

/** Gmail gönderimi için approval_requests satırı oluşturur (idempotent).
 *  Suppression/uyum kapısını ONAY İSTEĞİ aşamasında da çalıştırır — suppress
 *  edilmiş lead için taslak onaya bile GİDEMEZ (Senaryo: bloke). Opsiyonel
 *  düzenleme (subject/finalBody) burada persist edilir; digest düzenleme
 *  SONRASI içeriğe bağlanır. */
export async function requestSendApproval(
  outreachMessageId: string,
  edits?: { subject?: string; finalBody?: string },
  nowMs: number = Date.now()
): Promise<RequestSendResult> {
  const row = await loadOutreachRow(outreachMessageId)
  if (!row) return { ok: false, error: 'Taslak bulunamadı' }
  if (row.channel !== 'email') return { ok: false, error: 'Yalnız email kanalı Gmail ile gönderilir' }
  if (row.sent_at || row.status === 'sent') return { ok: false, error: 'Mesaj zaten gönderilmiş' }
  if (!row.lead_id) return { ok: false, error: 'Taslağın lead bağı yok' }

  const lead = await loadLeadContact(row.lead_id)
  if (!lead) return { ok: false, error: 'Lead bulunamadı' }
  if (!lead.email) return { ok: false, error: 'Lead e-posta adresi yok — önce adres ekleyin' }

  // Operatör düzenlemesi (Senaryo 2: taslak → düzenle → onayla)
  if (edits && (edits.subject !== undefined || edits.finalBody !== undefined)) {
    const patch: Record<string, unknown> = { updated_at: new Date(nowMs).toISOString() }
    if (edits.subject !== undefined) patch.subject = edits.subject
    if (edits.finalBody !== undefined) patch.final_body = edits.finalBody
    const { error } = await supabaseAdmin.from('outreach_messages').update(patch).eq('id', outreachMessageId)
    if (error) return { ok: false, error: `Düzenleme kaydedilemedi: ${error.message}` }
    row.subject = edits.subject !== undefined ? edits.subject : row.subject
    row.final_body = edits.finalBody !== undefined ? edits.finalBody : row.final_body
  }

  const { subject, body } = effectiveContent(row)

  // Deterministik kapı — onay isteğinden ÖNCE (bloke ise onay kartı bile doğmaz).
  const audit = await auditCompliance({ toAddress: lead.email, body, doNotContact: lead.do_not_contact })
  if (!audit.ok) {
    await supabaseAdmin
      .from('outreach_messages')
      .update({ error: `audit-compliance bloke: ${audit.failures.join(', ')}` })
      .eq('id', outreachMessageId)
    console.warn(`[outreach.blocked] stage=request-approval outreach=${outreachMessageId} reasons=${audit.failures.join(',')}`)
    return { ok: false, blockedReasons: audit.failures }
  }

  const args = computeSendArgs(outreachMessageId, lead.email, subject, body)
  const domain = extractDomain(lead.email) ?? 'bilinmiyor'
  // Alıcı domain onay kartında GÖRÜNÜR (T10) — redactPreview e-postayı maskeler,
  // domain'i ayrıca düz yazıyoruz.
  const previewText = `Gmail gönderimi → alıcı-domain: ${domain} · işletme: ${lead.business_name ?? '—'} · konu: ${subject || '(konu yok)'} · ${body.slice(0, 240)}`

  const draft = buildApprovalDraft({
    runId: `outreach:${outreachMessageId}`,
    stepId: SEND_GMAIL_ACTION,
    action: SEND_GMAIL_ACTION,
    args,
    previewText,
    permissionScopes: ['email:send'],
    riskLevel: 'high',
    dataSensitivity: 'confidential',
    nowMs,
    ttlMs: DEFAULT_APPROVAL_TTL_MS,
  })

  // outreach-orijinli onay: run_id/step_id FK'leri NULL (directives/agent_tasks
  // satırı yok); idempotency_key yine (outreach,eylem,digest) türevi → aynı
  // içerik için ikinci onay isteği doğmaz.
  const { data: existing } = await supabaseAdmin
    .from('approval_requests')
    .select('id, status')
    .eq('idempotency_key', draft.idempotencyKey)
    .maybeSingle()
  if (existing) return { ok: true, approvalId: existing.id as string, status: existing.status as string }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('approval_requests')
    .insert({
      run_id: null,
      step_id: null,
      action: draft.action,
      action_digest: draft.actionDigest,
      redacted_preview: draft.redactedPreview,
      idempotency_key: draft.idempotencyKey,
      expires_at: new Date(draft.expiresAtMs).toISOString(),
      permission_scopes: draft.permissionScopes,
      risk_level: draft.riskLevel,
      data_sensitivity: draft.dataSensitivity,
      status: 'pending',
    })
    .select('id')
    .single()
  if (insertErr || !inserted) return { ok: false, error: `Onay isteği oluşturulamadı: ${insertErr?.message ?? '?'}` }

  return { ok: true, approvalId: inserted.id as string, status: 'pending' }
}

/** Mevcut içerik için onay durumunu bulur (idempotency_key ile — FK kolonu yok). */
export async function findSendApproval(outreachMessageId: string): Promise<{ id: string; status: string; expires_at: string } | null> {
  const row = await loadOutreachRow(outreachMessageId)
  if (!row || !row.lead_id) return null
  const lead = await loadLeadContact(row.lead_id)
  if (!lead?.email) return null
  const { subject, body } = effectiveContent(row)
  const args = computeSendArgs(outreachMessageId, lead.email, subject, body)
  const draft = buildApprovalDraft({
    runId: `outreach:${outreachMessageId}`,
    stepId: SEND_GMAIL_ACTION,
    action: SEND_GMAIL_ACTION,
    args,
    previewText: '-',
    permissionScopes: ['email:send'],
    riskLevel: 'high',
    dataSensitivity: 'confidential',
    nowMs: Date.now(),
  })
  const { data } = await supabaseAdmin
    .from('approval_requests')
    .select('id, status, expires_at')
    .eq('idempotency_key', draft.idempotencyKey)
    .maybeSingle()
  return (data as { id: string; status: string; expires_at: string }) ?? null
}

// ── Gönderim ─────────────────────────────────────────────────────────────────

export interface SendGmailOutcome {
  ok: boolean
  dryRun?: boolean
  alreadySent?: boolean
  /** Başka bir istek claim'i tutuyor — provider'a dokunulmadı. */
  inProgress?: boolean
  /** Sonuç belirsiz (timeout/5xx ya da bayat claim) — KÖR RETRY YASAK;
   *  /reconcile ile çözülür. */
  needsReconciliation?: boolean
  /** Provider gönderdi ama kalıcı kayıt (finalize) tamamlanamadı — retry
   *  provider'ı BİR DAHA ÇAĞIRMAZ, yalnız finalize'ı tekrarlar. */
  finalizePending?: boolean
  blockedReasons?: string[]
  error?: string
  gmailMessageId?: string | null
  gmailThreadId?: string | null
}

interface GmailAccountRow {
  id: string
  email_address: string
  vault_secret_id: string | null
  active: boolean
}

async function loadActiveGmailAccount(): Promise<GmailAccountRow | null> {
  const { data } = await supabaseAdmin
    .from('gmail_accounts')
    .select('id, email_address, vault_secret_id, active')
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  return (data as GmailAccountRow) ?? null
}

// Gerçek Gmail REST transport'u — YALNIZ flag açık + aktif hesap + OAuth env
// hazırken yürür. Token akışı (refresh→access, Vault okuma) kullanıcı OAuth'u
// + bağımsız güvenlik incelemesi sonrası doldurulacak (19 §5). O zamana kadar
// KESİN (ambiguous=false) hatayla reddeder: provider'a hiç çıkılmadı →
// attempt 'failed' olur ve güvenle yeniden denenebilir. Sessiz düşüş YOK.
export function createGmailRestTransport(account: GmailAccountRow): GmailTransport {
  void account // OAuth + güvenlik incelemesi sonrası gerçek REST çağrısında kullanılacak
  return {
    async send() {
      throw new GmailTransportError(
        'Gerçek Gmail gönderimi henüz yapılandırılmadı: OAuth istemcisi (GMAIL_OAUTH_CLIENT_ID/GMAIL_OAUTH_CLIENT_SECRET) ' +
          've Vault token akışı güvenlik incelemesinden geçmeli. GMAIL_SEND_ENABLED=false yapın (dry-run) veya OAuth kurulumunu tamamlayın.',
        false
      )
    },
    async findByRfcMessageId() {
      throw new GmailTransportError('Gmail araması için OAuth (gmail.readonly) yapılandırılmadı.', false)
    },
  }
}

// RFC 2822 düz-metin mesaj → base64url (Gmail API raw formatı). Message-ID
// deterministik (outreach id türevi) — retry'da değişmez, reconciliation ankrajı.
export function buildRawMessage(opts: {
  from: string
  to: string
  subject: string
  body: string
  messageId?: string
}): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
  ]
  if (opts.messageId) lines.push(`Message-ID: ${opts.messageId}`)
  lines.push(
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    opts.body
  )
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

interface SendContext {
  row: OutreachRow
  /** Guard'dan geçmiş, null olmayan alıcı adresi. */
  toAddress: string
  subject: string
  body: string
}

/** Ortak ön-kontroller: satır + lead + HITL onay + digest + compliance.
 *  Provider'a ve claim'e dokunmaz — hepsi read-only (compliance yazımı hariç). */
async function validateSendPreconditions(
  outreachMessageId: string,
  approvalId: string,
  nowMs: number
): Promise<{ ok: true; ctx: SendContext } | { ok: false; outcome: SendGmailOutcome }> {
  const row = await loadOutreachRow(outreachMessageId)
  if (!row) return { ok: false, outcome: { ok: false, error: 'Taslak bulunamadı' } }

  // İdempotency katman 1: outreach satırı zaten gönderilmiş → no-op (T6).
  if (row.sent_at || row.status === 'sent') {
    return {
      ok: false,
      outcome: { ok: true, alreadySent: true, gmailMessageId: row.gmail_message_id, gmailThreadId: row.gmail_thread_id },
    }
  }
  if (!row.lead_id) return { ok: false, outcome: { ok: false, error: 'Taslağın lead bağı yok' } }

  const lead = await loadLeadContact(row.lead_id)
  if (!lead?.email) return { ok: false, outcome: { ok: false, error: 'Lead e-posta adresi yok' } }
  const { subject, body } = effectiveContent(row)

  // HITL kapısı (T5): approved + süresi geçmemiş + digest birebir.
  const approval = await getApproval(approvalId)
  if (!approval) return { ok: false, outcome: { ok: false, error: 'Onay kaydı bulunamadı — onaysız gönderim yapılamaz' } }
  if (approval.action !== SEND_GMAIL_ACTION) return { ok: false, outcome: { ok: false, error: 'Onay farklı bir eyleme ait' } }
  if (approval.status === 'executed') {
    return { ok: false, outcome: { ok: false, error: 'Bu onay zaten yürütüldü (çift gönderim engellendi)' } }
  }
  if (approval.status !== 'approved') {
    return { ok: false, outcome: { ok: false, error: `Onay durumu '${approval.status}' — gönderim için 'approved' gerekir` } }
  }
  if (Date.parse(approval.expires_at) < nowMs) {
    return { ok: false, outcome: { ok: false, error: 'Onay süresi dolmuş — yeniden onay isteyin' } }
  }
  const expectedDigest = computeActionDigest(SEND_GMAIL_ACTION, computeSendArgs(row.id, lead.email, subject, body))
  if (approval.approved_digest !== expectedDigest) {
    return {
      ok: false,
      outcome: { ok: false, error: 'Digest uyuşmazlığı: onaylanan içerik ile gönderilecek içerik farklı — yeniden onay isteyin' },
    }
  }

  // Deterministik kapı yürütme anında TEKRAR (suppression onaydan sonra
  // eklenmiş olabilir — pre-send kapısı atlanamaz, T8). Provider'dan ve
  // claim'den ÖNCE: bloke ise provider çağrı sayısı SIFIR.
  const audit = await auditCompliance({ toAddress: lead.email, body, doNotContact: lead.do_not_contact })
  if (!audit.ok) {
    await supabaseAdmin
      .from('outreach_messages')
      .update({ error: `audit-compliance bloke (send): ${audit.failures.join(', ')}` })
      .eq('id', row.id)
    console.warn(`[outreach.blocked] stage=send outreach=${row.id} reasons=${audit.failures.join(',')}`)
    return { ok: false, outcome: { ok: false, blockedReasons: audit.failures } }
  }

  return { ok: true, ctx: { row, toAddress: lead.email, subject, body } }
}

/** TEK gönderim yolu (T5). At-most-once garantisi sendMachine ile:
 *  claim (atomik INSERT) → sending (CAS) → provider → sent (CAS) →
 *  finalize (tek-transaction RPC). Onaysız/digest-uyuşmasız/suppress'li
 *  gönderim YAPISAL olarak yürümez. GMAIL_SEND_ENABLED=false → dry-run
 *  (transport mock, kalan her adım gerçek). */
export async function sendGmailMessage(opts: {
  outreachMessageId: string
  approvalId: string
  nowMs?: number
  /** Test dikişi — verilmezse flag'e göre gerçek REST ya da dry-run transport. */
  transport?: GmailTransport
}): Promise<SendGmailOutcome> {
  const nowMs = opts.nowMs ?? Date.now()

  const pre = await validateSendPreconditions(opts.outreachMessageId, opts.approvalId, nowMs)
  if (!pre.ok) return pre.outcome
  const { row, toAddress, subject, body } = pre.ctx

  // Transport seçimi (claim'den önce hazır — claim sonrası hızlı yol).
  const sendEnabled = isGmailSendEnabled()
  const account = sendEnabled ? await loadActiveGmailAccount() : null
  if (sendEnabled && !account) {
    return { ok: false, error: 'GMAIL_SEND_ENABLED=true ama aktif gmail_accounts kaydı yok — OAuth kurulumunu tamamlayın' }
  }
  const dryRun = !sendEnabled
  const transport =
    opts.transport ?? (dryRun ? createDryRunTransport(row.id, row.gmail_thread_id) : createGmailRestTransport(account!))
  const fromAddress = account?.email_address ?? 'dry-run@local'

  // ── At-most-once claim (atomik INSERT; kaybeden provider'a ULAŞAMAZ) ──
  const expectedDigest = computeActionDigest(SEND_GMAIL_ACTION, computeSendArgs(row.id, toAddress, subject, body))
  const claim = await claimSendAttempt({
    outreachMessageId: row.id,
    approvalId: opts.approvalId,
    actionDigest: expectedDigest,
    nowMs,
  })

  switch (claim.kind) {
    case 'alreadySent': {
      // Provider zaten göndermiş; finalize yarıda kaldıysa idempotent onar.
      const outcome = await repairFinalizeIfPending(claim.attempt, opts.approvalId, {
        fromAddress,
        toAddress,
        subject,
        body,
      })
      return {
        ok: true,
        alreadySent: true,
        dryRun: claim.attempt.provider_message_id?.startsWith('dryrun-') ?? undefined,
        finalizePending: outcome.finalizePending,
        gmailMessageId: claim.attempt.provider_message_id,
        gmailThreadId: claim.attempt.provider_thread_id,
      }
    }
    case 'inProgress':
      return { ok: false, inProgress: true, error: 'Gönderim başka bir istek tarafından yürütülüyor — bekleyin' }
    case 'needsReconciliation':
      return {
        ok: false,
        needsReconciliation: true,
        error: 'Önceki gönderim denemesinin sonucu belirsiz — otomatik tekrar YAPILMAZ; reconciliation gerekli',
      }
    case 'error':
      return { ok: false, error: claim.error }
    case 'claimed':
      break
  }
  const attempt = claim.attempt

  // claimed → sending (CAS). Kaybedersek provider'a dokunmadan çık.
  const sending = await markSending(attempt)
  if (!sending) {
    return { ok: false, inProgress: true, error: 'Claim geçişi kaybedildi — başka bir istek yürütüyor' }
  }

  // ── Provider çağrısı (bu noktaya AYNI outreach için tek process ulaşır) ──
  const raw = buildRawMessage({
    from: fromAddress,
    to: toAddress,
    subject,
    body,
    messageId: buildRfcMessageId(row.id),
  })

  let providerResult: { id: string; threadId: string }
  try {
    providerResult = await transport.send({ fromAddress, raw })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gmail API hatası'
    const ambiguous = err instanceof GmailTransportError ? err.ambiguous : true
    if (ambiguous) {
      // Mail gitmiş OLABİLİR → unknown; kör retry yasak (audit bulgu #2).
      await markUnknown(sending, message)
      console.warn(`[email.send_unknown] outreach=${row.id} err=${redactForLog(message, 200)}`)
      return { ok: false, needsReconciliation: true, error: `Gönderim sonucu belirsiz: ${message}` }
    }
    // Kesin reddetme → failed (yeniden denenebilir).
    await markFailed(sending, message)
    return { ok: false, error: message }
  }

  // sending → sent (küçük CAS — provider id'leri hemen güvenceye alınır).
  const sentAttempt = await markSentProvider(sending, providerResult.id, providerResult.threadId, nowMs)
  const attemptForFinalize: SendAttempt =
    sentAttempt ??
    ({ ...sending, state: 'sent', provider_message_id: providerResult.id, provider_thread_id: providerResult.threadId } as SendAttempt)
  if (!sentAttempt) {
    // Provider GÖNDERDİ ama durum yazılamadı — asla yeniden gönderme;
    // finalize yine denenir (claim_token hâlâ bizde), olmazsa reconciliation.
    console.error(`[email.sent_state_write_failed] outreach=${row.id} providerMessageId=${providerResult.id}`)
  }

  // ── Tek-transaction kalıcı kayıt (outreach + thread + message + approval) ──
  const sentAtIso = new Date(nowMs).toISOString()
  const fin = await finalizeSend({
    attempt: attemptForFinalize,
    approvalId: opts.approvalId,
    gmailMessageId: providerResult.id,
    gmailThreadId: providerResult.threadId,
    fromAddress,
    toAddress,
    subject,
    body,
    sentAtIso,
  })
  if (!fin.ok) {
    // Provider gönderdi; kalıcı kayıt eksik. email.sent İZİ YOK — ayrı
    // reconciliation eventi düşülür; retry yalnız finalize'ı tekrarlar.
    console.error(`[email.finalize_pending] outreach=${row.id} providerMessageId=${providerResult.id} err=${fin.error}`)
    return {
      ok: true,
      dryRun,
      finalizePending: true,
      gmailMessageId: providerResult.id,
      gmailThreadId: providerResult.threadId,
      error: `Gönderildi ama kalıcı kayıt tamamlanamadı: ${fin.error}`,
    }
  }

  // email.sent event (05-event-contracts) — YALNIZ finalize başarılıysa.
  console.log(
    `[email.sent] outreach=${row.id} lead=${row.lead_id} domain=${extractDomain(toAddress)} dryRun=${dryRun} gmailMessageId=${providerResult.id} preview=${redactForLog(subject, 80)}`
  )

  return { ok: true, dryRun, gmailMessageId: providerResult.id, gmailThreadId: providerResult.threadId }
}

/** alreadySent yolunda finalize yarıda kalmışsa idempotent onarır (provider'a
 *  dokunmaz). */
async function repairFinalizeIfPending(
  attempt: SendAttempt,
  approvalId: string,
  content: { fromAddress: string; toAddress: string; subject: string; body: string }
): Promise<{ finalizePending?: boolean }> {
  if (attempt.finalized || !attempt.provider_message_id) return {}
  const fin = await finalizeSend({
    attempt,
    approvalId,
    gmailMessageId: attempt.provider_message_id,
    gmailThreadId: attempt.provider_thread_id ?? '',
    fromAddress: content.fromAddress,
    toAddress: content.toAddress,
    subject: content.subject,
    body: content.body,
    sentAtIso: attempt.sent_at ?? new Date().toISOString(),
  })
  if (!fin.ok) {
    console.error(`[email.finalize_pending] outreach=${attempt.outreach_message_id} repair err=${fin.error}`)
    return { finalizePending: true }
  }
  return {}
}

// ── Reconciliation (belirsiz sonuç çözümü — kör retry alternatifi) ───────────

export interface ReconcileOutcome {
  ok: boolean
  outcome?: string
  error?: string
}

/** 'unknown' ya da bayat 'sending' attempt'i çözer: Gmail'de deterministik
 *  Message-ID araması → bulunursa reconciled+finalize, bulunamazsa failed
 *  (yeniden claim edilebilir). Dry-run transport'ta arama her zaman boş →
 *  failed; gerçek arama OAuth (gmail.readonly) gerektirir. */
export async function reconcileOutreachSend(outreachMessageId: string): Promise<ReconcileOutcome> {
  const attempt = await getSendAttempt(outreachMessageId)
  if (!attempt) return { ok: false, error: 'Gönderim denemesi kaydı yok' }

  const row = await loadOutreachRow(outreachMessageId)
  if (!row?.lead_id) return { ok: false, error: 'Taslak/lead bulunamadı' }
  const lead = await loadLeadContact(row.lead_id)
  if (!lead?.email) return { ok: false, error: 'Lead e-posta adresi yok' }
  const { subject, body } = effectiveContent(row)

  const sendEnabled = isGmailSendEnabled()
  const account = sendEnabled ? await loadActiveGmailAccount() : null
  const transport =
    sendEnabled && account ? createGmailRestTransport(account) : createDryRunTransport(row.id, row.gmail_thread_id)

  const result = await reconcileSendAttempt({
    attempt,
    transport,
    approvalId: attempt.approval_id,
    fromAddress: account?.email_address ?? 'dry-run@local',
    toAddress: lead.email,
    subject,
    body,
  })
  if (result.outcome === 'error') return { ok: false, outcome: result.outcome, error: result.error }
  return { ok: true, outcome: result.outcome }
}

export { getSendAttempt }
