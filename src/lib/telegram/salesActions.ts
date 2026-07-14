// ─────────────────────────────────────────────────────────────────────────────
// İMZALI Telegram satış aksiyonları (FINAL PILOT BLOCKERS Faz 6) — web parity.
//
// Kural: mutasyon YAPAN her Telegram komutu ÖNCE bir imzalı (tek-kullanımlık
// kodlu, TTL'li, digest'li) bekleyen aksiyon KURAR ve alıcı/domain + ne
// yapılacağını gösterir. Kullanıcı AYRI bir "onayla <kod>" ile teyit edince
// GERÇEK uygulama servisi çağrılır (web ile AYNI: decideApproval /
// sendGmailMessage / decideProposalApproval / reconcileOutreachSend).
//
//  • "Onayla" (HITL kararı) ile "Gönder" (fiili gönderim) AYRI aksiyon tipleri.
//  • Stale/replay/tampered: yanlış kod → mismatch (tüketilmez); TTL → expired;
//    tüketilen aksiyon bir daha çalışmaz (tek-kullanımlık).
//  • Tüm send'ler sendMachine + suppression + digest-lock + at-most-once'tan geçer.
//  • Otomatik/onaysız gönderim YOK — her adım açık kullanıcı teyidi.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'
import { decideApproval } from '@/lib/approvals/repo'
import { sendGmailMessage, findSendApproval, reconcileOutreachSend } from '@/lib/outreach/gmail'
import { decideProposalApproval, listProposalsForLead } from '@/lib/proposals/proposalService'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'
import { extractDomain } from '@/lib/outreach/auditCompliance'
import {
  setPendingAction,
  consumeSignedAction,
  makeConfirmCode,
  type PendingActionType,
  type PendingAction,
} from './pendingActions'

export interface ActionCard {
  ok: boolean
  text: string
}

function card(text: string): ActionCard {
  return { ok: true, text }
}
function fail(text: string): ActionCard {
  return { ok: false, text }
}

/** En son e-posta taslağı (lead için). */
async function latestEmailDraft(
  leadId: string,
): Promise<{ id: string; subject: string | null; status: string } | { error: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, subject, status')
    .eq('lead_id', leadId)
    .eq('channel', 'email')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return null
  return { id: data.id as string, subject: (data.subject as string) ?? null, status: data.status as string }
}

function recipientLine(email: string | null): string {
  if (!email) return 'Alıcı: (yok — recipient_missing)'
  return `Alıcı: ${email} · Domain: ${extractDomain(email) ?? '?'}`
}

async function stage(
  chatKey: string,
  type: PendingActionType,
  payload: Record<string, unknown>,
  headline: string,
  nowMs: number,
  rng?: () => number,
): Promise<ActionCard> {
  const code = makeConfirmCode(rng)
  const { digest, mode } = await setPendingAction(chatKey, type, payload, nowMs, code)
  const modeNote = mode === 'memory' ? '\n⚠ dayanıklı kayıt yok (LIFE 006 uygulanmamış) — kod bu instance ile sınırlı.' : ''
  return card(
    `${headline}\n` +
      `Digest: <code>${digest}</code>\n` +
      `Teyit için: <b>onayla ${code}</b> (10 dk geçerli, tek kullanımlık).${modeNote}`,
  )
}

// ── Kart üreticileri (mutasyon YAPMAZ; yalnız imzalı aksiyon kurar) ───────────

/** HITL onay KARARI (approve/reject) — send DEĞİL. */
export async function stageApprovalDecision(
  chatKey: string, leadId: string, businessName: string,
  decision: 'approved' | 'rejected', nowMs: number = Date.now(), rng?: () => number,
): Promise<ActionCard> {
  const draft = await latestEmailDraft(leadId)
  if (draft && 'error' in draft) return fail(`Taslak sorgusu hata: ${draft.error}`)
  if (!draft) return fail(`${businessName} için e-posta taslağı yok.`)
  let approval: { id: string; status: string } | null
  try {
    approval = await findSendApproval(draft.id)
  } catch (err) {
    return fail(`Onay durumu okunamadı: ${err instanceof Error ? err.message : 'hata'}`)
  }
  if (!approval) return fail(`${businessName}: bekleyen onay isteği yok. Önce "onaya al".`)
  if (approval.status !== 'pending') return fail(`${businessName}: onay zaten '${approval.status}'.`)
  const recipient = await resolveCanonicalRecipient(leadId)
  const verb = decision === 'approved' ? 'ONAYLA' : 'REDDET'
  return stage(
    chatKey, 'sales_approval_decision',
    { approvalId: approval.id, decision, businessName },
    `🟡 <b>${businessName}</b> onay kararı: <b>${verb}</b>\n${recipientLine(recipient.email)}\n` +
      `Not: bu yalnız HITL kararıdır — GÖNDERİM ayrı "gönder" adımıyla yapılır.`,
    nowMs, rng,
  )
}

/** Onaylı taslağı GÖNDER (ayrı açık teyit; at-most-once dry-run/gerçek). */
export async function stageSend(
  chatKey: string, leadId: string, businessName: string,
  nowMs: number = Date.now(), rng?: () => number,
): Promise<ActionCard> {
  const draft = await latestEmailDraft(leadId)
  if (draft && 'error' in draft) return fail(`Taslak sorgusu hata: ${draft.error}`)
  if (!draft) return fail(`${businessName} için e-posta taslağı yok.`)
  let approval: { id: string; status: string } | null
  try {
    approval = await findSendApproval(draft.id)
  } catch (err) {
    return fail(`Onay durumu okunamadı: ${err instanceof Error ? err.message : 'hata'}`)
  }
  if (!approval) return fail(`${businessName}: onay yok — önce "onaya al" sonra onayla.`)
  if (approval.status !== 'approved') {
    return fail(`${businessName}: onay '${approval.status}' — GÖNDERİM yalnız 'approved' onayla mümkün.`)
  }
  const recipient = await resolveCanonicalRecipient(leadId)
  if (!recipient.email) return fail(`${businessName}: alıcı yok (recipient_missing) — gönderilemez.`)
  return stage(
    chatKey, 'sales_send',
    { draftId: draft.id, approvalId: approval.id, businessName },
    `📤 <b>${businessName}</b> — ONAYLI taslağı GÖNDER\n${recipientLine(recipient.email)}\n` +
      `Not: sendMachine + suppression + at-most-once kapılarından geçer; GMAIL_SEND_ENABLED=false ise dry-run.`,
    nowMs, rng,
  )
}

/** Teklif approve/reject. */
export async function stageProposalDecision(
  chatKey: string, leadId: string, businessName: string,
  decision: 'approved' | 'rejected', nowMs: number = Date.now(), rng?: () => number,
): Promise<ActionCard> {
  const list = await listProposalsForLead(leadId)
  if (!list.ok) return fail(`${businessName}: teklifler okunamadı — ${list.error ?? 'hata'}.`)
  const pending = list.proposals.find((p) => p.pendingApprovalVersion != null)
  if (!pending || pending.pendingApprovalVersion == null) {
    return fail(`${businessName}: onay bekleyen teklif yok.`)
  }
  const verb = decision === 'approved' ? 'ONAYLA' : 'REDDET'
  return stage(
    chatKey, 'sales_proposal_decision',
    { proposalId: pending.id, version: pending.pendingApprovalVersion, decision, businessName },
    `🟡 <b>${businessName}</b> teklif kararı: <b>${verb}</b> (v${pending.pendingApprovalVersion})`,
    nowMs, rng,
  )
}

/** Reconcile kararı: assume_delivered (found) / confirm_not_found. */
export async function stageReconcileDecision(
  chatKey: string, leadId: string, businessName: string,
  confirmNotFound: boolean, nowMs: number = Date.now(), rng?: () => number,
): Promise<ActionCard> {
  const draft = await latestEmailDraft(leadId)
  if (draft && 'error' in draft) return fail(`Taslak sorgusu hata: ${draft.error}`)
  if (!draft) return fail(`${businessName} için e-posta taslağı yok.`)
  const verb = confirmNotFound ? 'GÖNDERİLMEDİ olarak işaretle (failed)' : 'aramayı çalıştır (assume/kontrol)'
  return stage(
    chatKey, 'sales_reconcile_decision',
    { outreachMessageId: draft.id, confirmNotFound, businessName },
    `🔧 <b>${businessName}</b> reconcile: <b>${verb}</b>\nNot: otomatik resend YOK — yalnız durum çözümü.`,
    nowMs, rng,
  )
}

// ── Teyit yürütücü (kod eşleşince GERÇEK uygulama servisini çağırır) ──────────

export interface ExecuteResult {
  text: string
}

export async function confirmAndExecute(chatKey: string, code: string, nowMs: number = Date.now()): Promise<ExecuteResult> {
  const result = await consumeSignedAction(chatKey, code.trim().toUpperCase(), nowMs)
  if (result.status === 'missing') return { text: 'Bekleyen imzalı aksiyon yok — önce ilgili komutu ver.' }
  if (result.status === 'expired') return { text: '⏳ Aksiyon süresi doldu (10 dk) — komutu yeniden ver.' }
  if (result.status === 'mismatch') return { text: '⛔ Kod uyuşmadı — kartındaki kodu aynen gir (aksiyon tüketilmedi).' }
  return { text: await executeAction(result.action, nowMs) }
}

async function executeAction(action: PendingAction, nowMs: number): Promise<string> {
  const p = action.payload
  const name = String(p.businessName ?? 'lead')
  switch (action.type) {
    case 'sales_approval_decision': {
      const ok = await decideApproval(String(p.approvalId), p.decision as 'approved' | 'rejected', 'telegram')
      if (!ok) return `⛔ ${name}: karar uygulanamadı (bulunamadı ya da artık pending değil).`
      return `✅ ${name}: onay ${p.decision === 'approved' ? 'ONAYLANDI' : 'REDDEDİLDİ'}.`
    }
    case 'sales_send': {
      const r = await sendGmailMessage({ outreachMessageId: String(p.draftId), approvalId: String(p.approvalId), nowMs })
      if (r.alreadySent) return `✅ ${name}: zaten gönderilmiş (idempotent).`
      if (r.needsReconciliation) return `⚠ ${name}: gönderim sonucu belirsiz — otomatik tekrar YOK; reconcile gerekli.`
      if (r.inProgress) return `⏳ ${name}: gönderim başka istekte yürütülüyor.`
      if (!r.ok) return `⛔ ${name}: gönderilemedi — ${r.blockedReasons?.join(', ') ?? r.error ?? 'hata'}.`
      return `📤 ${name}: ${r.dryRun ? 'DRY-RUN' : 'GERÇEK'} gönderim tamam (at-most-once).`
    }
    case 'sales_proposal_decision': {
      const r = await decideProposalApproval({
        proposalId: String(p.proposalId), version: Number(p.version),
        decision: p.decision as 'approved' | 'rejected', nowMs,
      })
      if (!r.ok) return `⛔ ${name}: teklif kararı uygulanamadı — ${r.error ?? 'hata'}.`
      return `✅ ${name}: teklif ${p.decision === 'approved' ? 'ONAYLANDI' : 'REDDEDİLDİ'}.`
    }
    case 'sales_reconcile_decision': {
      const r = await reconcileOutreachSend(String(p.outreachMessageId), {
        confirmNotFound: Boolean(p.confirmNotFound), nowMs,
      })
      if (!r.ok) return `⛔ ${name}: reconcile hatası — ${r.error ?? 'hata'}.`
      return `🔧 ${name}: reconcile sonucu — ${r.outcome}.`
    }
    default:
      return 'Bu aksiyon tipi Telegram’dan yürütülemiyor.'
  }
}
