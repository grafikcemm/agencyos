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
import { evaluateOutboundText, type GateVerdict } from '@/lib/outreach/outboundGate'
import {
  loadClaimEntriesForMessage,
  persistMessageVersion,
  remapClaims,
  type EvidenceMeta,
  type PersistedClaim,
} from '@/lib/outreach/claimEvidence'
import type { ClaimCategory, ClaimEvidenceEntry } from '@/lib/outreach/qualityLint'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'
import { recordVoiceDelta, recordStyleDelta, getBannedPhrases } from '@/lib/outreach/voiceDna'
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
import { createGmailRestTransport } from '@/lib/outreach/gmailRestTransport'

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

/** Faz 2.3: alıcı TEK resolver'dan çözülür (primary contact → lead.email).
 *  Gmail load/approval/send üçü de bu fonksiyonu kullanır — kopya kural yok. */
async function loadLeadContact(leadId: string): Promise<(LeadContact & {
  contactId: string | null
  contactName: string | null
}) | null> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, email, do_not_contact')
    .eq('id', leadId)
    .maybeSingle()
  if (!data) return null
  const recipient = await resolveCanonicalRecipient(leadId)
  return {
    id: data.id as string,
    business_name: (data.business_name as string) ?? null,
    do_not_contact: (data.do_not_contact as boolean) ?? null,
    email: recipient.email,
    contactId: recipient.contactId,
    contactName: recipient.contactName,
  }
}

function effectiveContent(row: OutreachRow): { subject: string; body: string } {
  return { subject: row.subject ?? '', body: (row.final_body ?? row.body ?? '').trim() }
}

// ONAYLANAN içerik dijesti — konu+gövde+alıcı (+Faz 1.3: kalite dijesti);
// onaydan sonra içerik VEYA kalite girdileri (yasaklı ifadeler/kanıt) değişirse
// yürütme anındaki digest eşleşmez ve gönderim yürümez (§13 bütünlük).
export function computeSendArgs(
  outreachMessageId: string,
  to: string,
  subject: string,
  body: string,
  qualityDigest?: string,
  /** Faz 2.3: alıcı snapshot bağı — primary contact id (yoksa lead.email fallback işareti). */
  recipientContactId?: string | null,
) {
  const recipientRef = recipientContactId ?? 'lead-email'
  const contentDigest = createHash('sha256')
    .update(`${subject}\n\n${body}${qualityDigest ? `\n\nq:${qualityDigest}` : ''}\n\nr:${recipientRef}`)
    .digest('hex')
  return { action: SEND_GMAIL_ACTION, outreachMessageId, to: to.toLowerCase(), contentDigest }
}

/** Faz 1.3: gönderim yolundaki TEK kalite değerlendirmesi. Hata fırlatırsa
 *  çağıran fail-closed davranır (onay doğmaz / gönderim yürümez).
 *  FINALIZATION Faz 1: iddia→kanıt eşlemesi CLIENT'TAN ALINMAZ — mesajın
 *  kayıtlı (versiyonlu) iddia bağları okunur ve güncel gövdeye deterministik
 *  remap edilir. Kayıt yoksa/şema canlı değilse eşleme boş kalır → tespit
 *  edilen iddialar bloklanır (fail-closed). */
async function evaluateDraftQuality(
  outreachMessageId: string,
  leadId: string,
  businessName: string | null,
  subject: string,
  body: string,
): Promise<GateVerdict> {
  const loaded = await loadClaimEntriesForMessage(outreachMessageId)
  const entries = loaded.schemaMissing ? [] : remapClaims(body, loaded.claims).entries
  return evaluateOutboundText({
    leadId,
    businessName: businessName ?? '',
    subject,
    body,
    kind: 'cold_email',
    claimEvidence: entries,
  })
}

// ── Onay isteği (HITL) ───────────────────────────────────────────────────────

export interface RequestSendResult {
  ok: boolean
  approvalId?: string
  status?: string
  blockedReasons?: string[]
  error?: string
  /** Faz 1.3: blocking kalite kararı (onay kartında/UI'da görünür). */
  quality?: { ok: boolean; violations: Array<{ code: string; detail: string; fix: string }> }
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
  const hasEdits = Boolean(edits && (edits.subject !== undefined || edits.finalBody !== undefined))
  if (edits && hasEdits) {
    // Voice DNA v0: operatör gövdeyi düzenlediyse silinenleri öğren (aday
    // sayacı; otomatik yasaklama yok — onay operatörde). Best-effort.
    const originalBody = (row.final_body ?? row.body ?? '') as string
    if (edits.finalBody && edits.finalBody !== originalBody) {
      await recordVoiceDelta(originalBody, edits.finalBody).catch(() => {})
      // Faz 4.1: yapısal stil gözlemi (açılış/resmiyet/cümle/CTA/kanıt) — aday
      // kural üretir; otomatik aktivasyon YOK (operatör onayı gerekir).
      await recordStyleDelta(originalBody, edits.finalBody).catch(() => {})
    }
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

  // Faz 1.3: BLOCKING kalite kapısı — approval yaratılmadan ÖNCE.
  // Değerlendirme hatası → FAIL-CLOSED (onay kartı doğmaz).
  let quality: GateVerdict
  let editorClaims: PersistedClaim[] = []
  try {
    const loaded = await loadClaimEntriesForMessage(outreachMessageId)
    const remap = loaded.schemaMissing
      ? { entries: [], unmatched: [], matchedPrior: [] as PersistedClaim[] }
      : remapClaims(body, loaded.claims)
    editorClaims = remap.matchedPrior
    quality = await evaluateOutboundText({
      leadId: row.lead_id,
      businessName: lead.business_name ?? '',
      subject,
      body,
      kind: 'cold_email',
      claimEvidence: remap.entries,
    })
  } catch {
    return { ok: false, error: 'Kalite kapısı değerlendirilemedi — onay isteği oluşturulmadı (fail-closed)' }
  }

  // FINALIZATION Faz 1: düzenleme yeni IMMUTABLE versiyon üretir — kanıt bağları
  // deterministik remap ile taşınır; taşınamayan iddia kapıda bloklanır. Versiyon
  // gate SONUCUYLA birlikte yazılır (bloke edilen düzenlemenin de izi kalır).
  // Şema canlı değilse (mig 062 onay bekliyor) iz atlanır; yazım HATASI fail-closed.
  if (hasEdits) {
    try {
      await persistMessageVersion({
        outreachMessageId,
        channel: 'email',
        recipient: {
          kind: lead.contactId ? 'primary_contact' : 'lead_email',
          contactId: lead.contactId,
          email: lead.email,
        },
        subject,
        body,
        voiceDigest: null,
        gate: { ok: quality.ok, digest: quality.digest, violations: quality.violations.map((v) => ({ code: v.code, detail: v.detail })) },
        source: 'editor',
        claims: editorClaims.map((c) => ({
          text: c.claim_text,
          category: (c.claim_category as ClaimCategory | null) ?? null,
          evidenceId: c.evidence_id,
          evidenceType: c.evidence_type ?? null,
          evidenceSource: c.evidence_source ?? null,
        })),
        createdBy: 'operator:editor',
      })
    } catch (err) {
      return { ok: false, error: `Taslak versiyonu yazılamadı: ${err instanceof Error ? err.message : 'bilinmeyen hata'}` }
    }
  }

  if (!quality.ok) {
    const codes = quality.violations.map((v) => v.code)
    console.warn(`[outreach.blocked] stage=quality outreach=${outreachMessageId} reasons=${codes.join(',')}`)
    return {
      ok: false,
      blockedReasons: codes,
      quality: { ok: false, violations: quality.violations },
    }
  }

  // Kalite dijesti + alıcı snapshot'ı (contact id) approval digest'ine bağlanır:
  // onaydan sonra kalite girdisi, alıcı e-postası VEYA primary contact değişirse
  // send-anı digest'i eşleşmez → onay geçersizleşir (Faz 1.3 + 2.3).
  const args = computeSendArgs(outreachMessageId, lead.email, subject, body, quality.digest, lead.contactId)
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
  if (existing) {
    return { ok: true, approvalId: existing.id as string, status: existing.status as string, quality: { ok: true, violations: [] } }
  }

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

  return { ok: true, approvalId: inserted.id as string, status: 'pending', quality: { ok: true, violations: [] } }
}

/** Mevcut içerik için onay durumunu bulur (idempotency_key ile — FK kolonu yok).
 *  Kalite dijesti digest'e dahil (Faz 1.3): kalite girdileri değiştiyse eski
 *  onay bulunamaz → UI yeniden onay ister (istenen davranış). */
export async function findSendApproval(outreachMessageId: string): Promise<{ id: string; status: string; expires_at: string } | null> {
  const row = await loadOutreachRow(outreachMessageId)
  if (!row || !row.lead_id) return null
  const lead = await loadLeadContact(row.lead_id)
  if (!lead?.email) return null
  const { subject, body } = effectiveContent(row)
  let quality: GateVerdict
  try {
    quality = await evaluateDraftQuality(outreachMessageId, row.lead_id, lead.business_name, subject, body)
  } catch {
    return null // fail-closed: kalite değerlendirilemedi → onay "yok" görünür.
  }
  const args = computeSendArgs(outreachMessageId, lead.email, subject, body, quality.digest, lead.contactId)
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

// ── Toplu onay durumu (Faz 2.4 — kokpit) ─────────────────────────────────────

export interface DraftApprovalLookupItem {
  draftId: string
  leadId: string
  businessName: string | null
  /** Canonical resolver çıktısı (primary contact → lead.email). */
  email: string | null
  contactId: string | null
  subject: string
  body: string
}

/**
 * findSendApproval'ın TOPLU hâli: banned-phrase 1 sorgu + evidence 1 sorgu +
 * approvals 1 sorgu (draft başına ayrı DB turu YOK). Digest formülü tekil
 * yol ile birebir aynı (içerik + kalite + alıcı) — sapma olursa onay
 * 'bulunamaz' görünür ve UI yeniden onay ister (güvenli yön).
 */
export async function findSendApprovalsBatch(
  items: DraftApprovalLookupItem[],
): Promise<Map<string, { id: string; status: string; expires_at: string }>> {
  const out = new Map<string, { id: string; status: string; expires_at: string }>()
  const candidates = items.filter((i) => i.email)
  if (candidates.length === 0) return out

  let banned: string[]
  try {
    banned = await getBannedPhrases()
  } catch {
    return out // fail-closed: kalite girdisi yok → onay "yok" görünür.
  }
  const leadIds = [...new Set(candidates.map((i) => i.leadId))]
  const { data: evidence } = await supabaseAdmin
    .from('lead_evidence')
    .select('id, lead_id, kind, source, summary, payload, verified')
    .in('lead_id', leadIds)
  const evidenceByLead = new Map<string, EvidenceMeta[]>()
  for (const e of evidence ?? []) {
    const arr = evidenceByLead.get(e.lead_id as string) ?? []
    arr.push(e as unknown as EvidenceMeta)
    evidenceByLead.set(e.lead_id as string, arr)
  }

  const keyToDraft = new Map<string, string>()
  for (const item of candidates) {
    // Digest, request-anındaki formülle BİREBİR aynı olmalı → iddia eşlemesi
    // burada da server-side yüklenip remap edilir (client'a güven yok).
    let claimEntries: ClaimEvidenceEntry[] = []
    try {
      const loaded = await loadClaimEntriesForMessage(item.draftId)
      if (!loaded.schemaMissing) claimEntries = remapClaims(item.body, loaded.claims).entries
    } catch {
      continue // fail-closed: iddia kayıtları okunamıyorsa onay "yok" görünür.
    }
    const quality = await evaluateOutboundText(
      {
        leadId: item.leadId,
        businessName: item.businessName ?? '',
        subject: item.subject,
        body: item.body,
        kind: 'cold_email',
        claimEvidence: claimEntries,
      },
      { bannedPhrases: banned, evidenceMeta: evidenceByLead.get(item.leadId) ?? [] },
    )
    const args = computeSendArgs(item.draftId, item.email!, item.subject, item.body, quality.digest, item.contactId)
    const draft = buildApprovalDraft({
      runId: `outreach:${item.draftId}`,
      stepId: SEND_GMAIL_ACTION,
      action: SEND_GMAIL_ACTION,
      args,
      previewText: '-',
      permissionScopes: ['email:send'],
      riskLevel: 'high',
      dataSensitivity: 'confidential',
      nowMs: Date.now(),
    })
    keyToDraft.set(draft.idempotencyKey, item.draftId)
  }

  const { data: approvals } = await supabaseAdmin
    .from('approval_requests')
    .select('id, status, expires_at, idempotency_key')
    .in('idempotency_key', [...keyToDraft.keys()])
  for (const a of approvals ?? []) {
    const draftId = keyToDraft.get(a.idempotency_key as string)
    if (draftId) out.set(draftId, { id: a.id as string, status: a.status as string, expires_at: a.expires_at as string })
  }
  return out
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
  // mig 055 tek-aktif-hesap partial UNIQUE index'i sayesinde en fazla bir satır
  // döner; order yine de deterministik seçim garantisi için (belt+braces).
  const { data } = await supabaseAdmin
    .from('gmail_accounts')
    .select('id, email_address, vault_secret_id, active')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as GmailAccountRow) ?? null
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
  /** Onay anındakiyle AYNI formülle (içerik+kalite+alıcı) hesaplanan digest. */
  actionDigest: string
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
  // Faz 1.3: kalite kapısı yürütme anında da BLOCKING — değerlendirilemezse
  // veya geçmezse gönderim yürümez (fail-closed); digest kalite dijestiyle
  // hesaplanır → onaydan sonra kalite girdisi değiştiyse eşleşmez.
  let sendQuality: GateVerdict
  try {
    sendQuality = await evaluateDraftQuality(row.id, row.lead_id, lead.business_name, subject, body)
  } catch {
    return { ok: false, outcome: { ok: false, error: 'Kalite kapısı değerlendirilemedi — gönderim yürütülmedi (fail-closed)' } }
  }
  if (!sendQuality.ok) {
    return { ok: false, outcome: { ok: false, blockedReasons: sendQuality.violations.map((v) => v.code) } }
  }
  const expectedDigest = computeActionDigest(
    SEND_GMAIL_ACTION,
    computeSendArgs(row.id, lead.email, subject, body, sendQuality.digest, lead.contactId),
  )
  if (approval.approved_digest !== expectedDigest) {
    return {
      ok: false,
      outcome: { ok: false, error: 'Digest uyuşmazlığı: onaylanan içerik/alıcı ile gönderilecek farklı — yeniden onay isteyin' },
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

  return { ok: true, ctx: { row, toAddress: lead.email, subject, body, actionDigest: expectedDigest } }
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
  const { row, toAddress, subject, body, actionDigest } = pre.ctx

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
  // Digest, precondition'da onay anındakiyle AYNI formülle hesaplandı.
  const claim = await claimSendAttempt({
    outreachMessageId: row.id,
    approvalId: opts.approvalId,
    actionDigest,
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
 *  Message-ID araması → bulunursa reconciled+finalize; bulunamazsa karar
 *  KADEMELİ (grace period + min arama sayısı + AÇIK operatör onayı —
 *  sendMachine.reconcileSendAttempt). GÜVENLİK KURALI: GMAIL_SEND_ENABLED=false
 *  iken dry-run transport'un boş araması GERÇEK bir attempt'i failed
 *  YAPAMAZ — arama gerektiren yol flag kapalıyken bloke edilir (yalnız
 *  finalize-onarımı, aramasız olduğu için, her modda çalışır). */
export async function reconcileOutreachSend(
  outreachMessageId: string,
  opts?: { confirmNotFound?: boolean; nowMs?: number; transport?: GmailTransport }
): Promise<ReconcileOutcome> {
  const attempt = await getSendAttempt(outreachMessageId)
  if (!attempt) return { ok: false, error: 'Gönderim denemesi kaydı yok' }

  const row = await loadOutreachRow(outreachMessageId)
  if (!row?.lead_id) return { ok: false, error: 'Taslak/lead bulunamadı' }
  const lead = await loadLeadContact(row.lead_id)
  if (!lead?.email) return { ok: false, error: 'Lead e-posta adresi yok' }
  const { subject, body } = effectiveContent(row)

  const sendEnabled = isGmailSendEnabled()
  const needsSearch = attempt.state === 'unknown' || attempt.state === 'sending'

  let transport: GmailTransport
  if (opts?.transport) {
    // Test dikişi — enjekte transport çağıranın sorumluluğunda.
    transport = opts.transport
  } else if (needsSearch) {
    if (!sendEnabled) {
      return {
        ok: false,
        error:
          'GMAIL_SEND_ENABLED=false — dry-run transport ile gerçek gönderim araması yapılamaz; ' +
          "attempt 'failed' kararı için flag + OAuth (gmail.readonly) gerekir",
      }
    }
    const account = await loadActiveGmailAccount()
    if (!account) return { ok: false, error: 'Aktif gmail_accounts kaydı yok — arama yapılamaz' }
    transport = createGmailRestTransport(account)
  } else {
    // Aramasız yol (sent+finalize onarımı) — transport fiilen kullanılmaz.
    transport = createDryRunTransport(row.id, row.gmail_thread_id)
  }

  const account = sendEnabled ? await loadActiveGmailAccount() : null
  const result = await reconcileSendAttempt({
    attempt,
    transport,
    approvalId: attempt.approval_id,
    fromAddress: account?.email_address ?? 'dry-run@local',
    toAddress: lead.email,
    subject,
    body,
    nowMs: opts?.nowMs,
    confirmNotFound: opts?.confirmNotFound,
  })
  if (result.outcome === 'error') return { ok: false, outcome: result.outcome, error: result.error }
  return { ok: true, outcome: result.outcome }
}

export { getSendAttempt }
