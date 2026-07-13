// ─────────────────────────────────────────────────────────────────────────────
// Canonical outbound kalite/kanıt kapısı (Faz 1) — SERVER-ONLY.
//
// Tüm dış-müşteri metinleri (first_message, 30sn pitch, cold email, teklif
// WhatsApp/e-posta metni) TEK kapıdan geçer: deterministik lint (qualityLint)
// + Voice DNA yasak ifadeleri (settings) + SPESİFİK claim→evidence eşlemesi.
//
// Fail-closed yönü: banned-phrase/evidence okunamazsa sonuç DAHA SIKI olur
// (kanıt yokmuş gibi → iddialar bloklanır); kapı asla "okuma hatası → serbest"
// davranmaz. Kapıdan geçmeyen metin wa.me prefill'e giremez, kopyalanamaz,
// "gönderilebilir" gösterilemez.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { getBannedPhrases } from '@/lib/outreach/voiceDna'
import {
  lintOutreachDraft,
  type ClaimEvidenceEntry,
  type QualityViolation,
} from '@/lib/outreach/qualityLint'

export type OutboundKind =
  | 'first_message'
  | 'pitch'
  | 'cold_email'
  | 'proposal_whatsapp'
  | 'proposal_email'

const KIND_CHANNEL: Record<OutboundKind, 'email' | 'whatsapp'> = {
  first_message: 'whatsapp',
  pitch: 'whatsapp',
  cold_email: 'email',
  proposal_whatsapp: 'whatsapp',
  proposal_email: 'email',
}

/** Violation kodu → operatörün uygulayabileceği düzeltme aksiyonu. */
export const VIOLATION_FIX: Record<QualityViolation['code'], string> = {
  SUBJECT_MISSING: 'Konu satırı ekle',
  SUBJECT_TOO_LONG: 'Konuyu 78 karakter altına kısalt',
  NO_BUSINESS_CONTEXT: 'İşletme veya kişi adını metne ekle',
  GENERIC_CLICHE: 'Cliché cümleyi lead\'e özgü gözlemle değiştir',
  SPAM_RISK_LANGUAGE: 'Garanti/aciliyet dilini çıkar',
  MULTIPLE_CTA: 'Tek düşük-sürtünmeli CTA bırak',
  NO_CTA: 'Tek net CTA ekle (ör. "15 dakika uygun musunuz?")',
  CLAIM_WITHOUT_EVIDENCE: 'İddiayı sil veya kanıt (evidence) bağı olan taslağı kokpitten üret',
  MISSING_OPT_OUT: 'Opt-out/İYS cümlesi ekle',
  VOICE_BANNED_PHRASE: 'Yasaklı ifadeyi çıkar (Voice DNA)',
  BODY_TOO_LONG: 'Gövdeyi 1800 karakter altına indir',
}

export interface GateVerdict {
  ok: boolean
  violations: Array<QualityViolation & { fix: string }>
  /** Deterministik kalite dijesti — approval digest'ine bağlanır (Faz 1.3). */
  digest: string
}

export interface EvaluateDraftOpts {
  leadId: string | null
  businessName: string
  subject: string | null
  body: string
  kind: OutboundKind
  contactName?: string | null
  claimEvidence?: ClaimEvidenceEntry[]
}

/** Lead'in evidence id kümesini okur; hata → boş küme (iddialar bloklanır). */
async function loadEvidenceIds(leadId: string | null): Promise<string[]> {
  if (!leadId) return []
  try {
    const { data, error } = await supabaseAdmin
      .from('lead_evidence')
      .select('id')
      .eq('lead_id', leadId)
      .limit(50)
    if (error) return []
    return (data ?? []).map((e) => e.id as string)
  } catch {
    return []
  }
}

/**
 * TEK kapı. claimEvidence verildiyse id'ler lead_evidence'a karşı doğrulanır;
 * lead'e ait olmayan id'li eşlemeler DÜŞÜRÜLÜR (o iddia kanıtsız kalır).
 */
export async function evaluateOutboundText(opts: EvaluateDraftOpts): Promise<GateVerdict> {
  const validIds = new Set(await loadEvidenceIds(opts.leadId))
  const claimEvidence = (opts.claimEvidence ?? [])
    .map((e) => ({ claim: e.claim, evidenceIds: e.evidenceIds.filter((id) => validIds.has(id)) }))
    .filter((e) => e.evidenceIds.length > 0)

  const banned = await getBannedPhrases()
  const lint = lintOutreachDraft({
    subject: opts.subject,
    body: opts.body,
    businessName: opts.businessName,
    contactName: opts.contactName ?? null,
    evidenceIds: [...validIds],
    claimEvidence,
    bannedPhrases: banned,
    channel: KIND_CHANNEL[opts.kind],
  })

  const violations = lint.violations.map((v) => ({ ...v, fix: VIOLATION_FIX[v.code] }))
  const digest = createHash('sha256')
    .update(JSON.stringify({ ok: lint.ok, violations: lint.violations, banned, body: opts.body, subject: opts.subject }))
    .digest('hex')
  return { ok: lint.ok, violations, digest }
}
