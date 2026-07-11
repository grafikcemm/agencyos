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
import { getApproval, markApprovalExecuted } from '@/lib/approvals/repo'
import { markMessageSent } from '@/lib/outreach/email'
import { auditCompliance, extractDomain } from '@/lib/outreach/auditCompliance'
import { isGmailSendEnabled } from '@/lib/outreach/flags'
import { redactForLog } from '@/lib/redact'

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

// Gerçek Gmail REST gönderimi — YALNIZ flag açık + aktif hesap + OAuth env
// hazırken yürür. Token akışı (refresh→access, Vault okuma) kullanıcı OAuth'u
// + bağımsız güvenlik incelemesi sonrası doldurulacak (19 §5). O zamana kadar
// açıklayıcı hata: sessiz düşüş YOK.
async function sendViaGmailRest(account: GmailAccountRow, raw: string): Promise<{ id: string; threadId: string }> {
  void account
  void raw // OAuth + güvenlik incelemesi sonrası gerçek REST çağrısında kullanılacak
  throw new Error(
    'Gerçek Gmail gönderimi henüz yapılandırılmadı: OAuth istemcisi (GMAIL_OAUTH_CLIENT_ID/GMAIL_OAUTH_CLIENT_SECRET) ' +
      've Vault token akışı güvenlik incelemesinden geçmeli. GMAIL_SEND_ENABLED=false yapın (dry-run) veya OAuth kurulumunu tamamlayın.'
  )
}

// RFC 2822 düz-metin mesaj → base64url (Gmail API raw formatı).
export function buildRawMessage(opts: { from: string; to: string; subject: string; body: string }): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`
  const message = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    opts.body,
  ].join('\r\n')
  return Buffer.from(message, 'utf8').toString('base64url')
}

async function upsertThreadAndMessage(opts: {
  row: OutreachRow
  toAddress: string
  fromAddress: string
  subject: string
  body: string
  gmailMessageId: string
  gmailThreadId: string
  sentAtIso: string
}): Promise<{ ok: boolean; error?: string }> {
  // Thread: gmail_thread_id ile bul/oluştur (dry-run'da mock id de tekil).
  const { data: thread, error: threadErr } = await supabaseAdmin
    .from('email_threads')
    .upsert(
      {
        lead_id: opts.row.lead_id,
        gmail_thread_id: opts.gmailThreadId,
        subject: opts.subject || null,
        updated_at: opts.sentAtIso,
      },
      { onConflict: 'gmail_thread_id' }
    )
    .select('id')
    .maybeSingle()
  if (threadErr || !thread) return { ok: false, error: `email_threads yazılamadı: ${threadErr?.message ?? '?'}` }

  const { error: msgErr } = await supabaseAdmin.from('email_messages').insert({
    thread_id: thread.id,
    outreach_message_id: opts.row.id,
    gmail_message_id: opts.gmailMessageId,
    direction: 'outbound',
    from_address: opts.fromAddress,
    to_address: opts.toAddress,
    subject: opts.subject || null,
    body: opts.body,
    sent_at: opts.sentAtIso,
  })
  // UNIQUE ihlali (23505) = mesaj zaten kayıtlı → idempotent no-op (T6).
  if (msgErr && !/duplicate key|23505/i.test(msgErr.message)) {
    return { ok: false, error: `email_messages yazılamadı: ${msgErr.message}` }
  }
  return { ok: true }
}

/** TEK gönderim yolu (T5). Onaysız/digest-uyuşmasız/suppress'li gönderim
 *  YAPISAL olarak yürümez. GMAIL_SEND_ENABLED=false → dry-run (send mock,
 *  kalan her adım gerçek). */
export async function sendGmailMessage(opts: {
  outreachMessageId: string
  approvalId: string
  nowMs?: number
}): Promise<SendGmailOutcome> {
  const nowMs = opts.nowMs ?? Date.now()
  const row = await loadOutreachRow(opts.outreachMessageId)
  if (!row) return { ok: false, error: 'Taslak bulunamadı' }

  // İdempotency katman 1: zaten gönderilmiş → no-op (T6).
  if (row.sent_at || row.status === 'sent') {
    return { ok: true, alreadySent: true, gmailMessageId: row.gmail_message_id, gmailThreadId: row.gmail_thread_id }
  }
  if (!row.lead_id) return { ok: false, error: 'Taslağın lead bağı yok' }

  const lead = await loadLeadContact(row.lead_id)
  if (!lead?.email) return { ok: false, error: 'Lead e-posta adresi yok' }
  const { subject, body } = effectiveContent(row)

  // HITL kapısı (T5): approved + süresi geçmemiş + digest birebir.
  const approval = await getApproval(opts.approvalId)
  if (!approval) return { ok: false, error: 'Onay kaydı bulunamadı — onaysız gönderim yapılamaz' }
  if (approval.action !== SEND_GMAIL_ACTION) return { ok: false, error: 'Onay farklı bir eyleme ait' }
  if (approval.status === 'executed') {
    return { ok: false, error: 'Bu onay zaten yürütüldü (çift gönderim engellendi)' }
  }
  if (approval.status !== 'approved') {
    return { ok: false, error: `Onay durumu '${approval.status}' — gönderim için 'approved' gerekir` }
  }
  if (Date.parse(approval.expires_at) < nowMs) {
    return { ok: false, error: 'Onay süresi dolmuş — yeniden onay isteyin' }
  }
  const expectedDigest = computeActionDigest(SEND_GMAIL_ACTION, computeSendArgs(row.id, lead.email, subject, body))
  if (approval.approved_digest !== expectedDigest) {
    return { ok: false, error: 'Digest uyuşmazlığı: onaylanan içerik ile gönderilecek içerik farklı — yeniden onay isteyin' }
  }

  // Deterministik kapı yürütme anında TEKRAR (suppression onaydan sonra
  // eklenmiş olabilir — pre-send kapısı atlanamaz, T8).
  const audit = await auditCompliance({ toAddress: lead.email, body, doNotContact: lead.do_not_contact })
  if (!audit.ok) {
    await supabaseAdmin
      .from('outreach_messages')
      .update({ error: `audit-compliance bloke (send): ${audit.failures.join(', ')}` })
      .eq('id', row.id)
    console.warn(`[outreach.blocked] stage=send outreach=${row.id} reasons=${audit.failures.join(',')}`)
    return { ok: false, blockedReasons: audit.failures }
  }

  // Send: gerçek (flag + aktif hesap) veya dry-run mock.
  const sendEnabled = isGmailSendEnabled()
  const account = sendEnabled ? await loadActiveGmailAccount() : null
  let gmailMessageId: string
  let gmailThreadId: string
  let dryRun: boolean

  if (sendEnabled) {
    if (!account) {
      return { ok: false, error: 'GMAIL_SEND_ENABLED=true ama aktif gmail_accounts kaydı yok — OAuth kurulumunu tamamlayın' }
    }
    const raw = buildRawMessage({ from: account.email_address, to: lead.email, subject, body })
    try {
      const sent = await sendViaGmailRest(account, raw)
      gmailMessageId = sent.id
      gmailThreadId = sent.threadId
      dryRun = false
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gmail API hatası'
      return { ok: false, error: msg }
    }
  } else {
    // DRY-RUN: send mock'lanır; kayıt/idempotency/audit akışı GERÇEK.
    gmailMessageId = `dryrun-${row.id}`
    gmailThreadId = row.gmail_thread_id ?? `dryrun-thread-${row.id}`
    dryRun = true
  }

  const sentAtIso = new Date(nowMs).toISOString()
  const fromAddress = account?.email_address ?? 'dry-run@local'

  // Kayıt sırası: gmail id'leri + final_body → markMessageSent (mevcut
  // idempotent DB-kayıt rolü, E3) → thread/message → approval executed.
  const { error: updateErr } = await supabaseAdmin
    .from('outreach_messages')
    .update({
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
      final_body: body,
      error: null,
      updated_at: sentAtIso,
    })
    .eq('id', row.id)
  if (updateErr) return { ok: false, error: `outreach_messages güncellenemedi: ${updateErr.message}` }

  const marked = await markMessageSent(row.id)
  if (!marked.ok) return { ok: false, error: marked.error ?? 'markMessageSent başarısız' }

  const persisted = await upsertThreadAndMessage({
    row, toAddress: lead.email, fromAddress, subject, body, gmailMessageId, gmailThreadId, sentAtIso,
  })
  if (!persisted.ok) {
    console.error('[outreach.persist] thread/message kaydı başarısız:', persisted.error)
    // Gönderim gerçekleşti; kayıt hatası gönderimi geri alamaz — hata raporlanır.
  }

  await markApprovalExecuted(opts.approvalId)

  // email.sent event (05-event-contracts) — adres maskeli, domain açık.
  console.log(
    `[email.sent] outreach=${row.id} lead=${row.lead_id} domain=${extractDomain(lead.email)} dryRun=${dryRun} gmailMessageId=${gmailMessageId} preview=${redactForLog(subject, 80)}`
  )

  return { ok: true, dryRun, gmailMessageId, gmailThreadId }
}
