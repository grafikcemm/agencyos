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
import { getBannedPhrases } from '@/lib/outreach/voiceDna'
import {
  detectClaimsDetailed,
  fold,
  lintOutreachDraft,
  type ClaimEvidenceEntry,
  type QualityViolation,
} from '@/lib/outreach/qualityLint'
import {
  checkClaimEvidenceCompat,
  loadEvidenceMeta,
  type EvidenceMeta,
} from '@/lib/outreach/claimEvidence'

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
  CLAIM_EVIDENCE_MISMATCH: 'İddia bağlandığı kanıtla doğrulanamıyor — iddiayı sil veya uygun türde doğrulanmış kanıt ekle',
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

/** Lead'in evidence META'sını okur; hata → boş küme (iddialar bloklanır). */
async function loadEvidenceMetaSafe(leadId: string | null): Promise<EvidenceMeta[]> {
  try {
    return await loadEvidenceMeta(leadId)
  } catch {
    return []
  }
}

/**
 * TEK kapı. claimEvidence verildiyse id'ler lead_evidence'a karşı doğrulanır;
 * lead'e ait olmayan id'li eşlemeler DÜŞÜRÜLÜR (o iddia kanıtsız kalır).
 * FINALIZATION Faz 1: kanıt sahipliği yetmez — iddia KATEGORİSİ kanıt TÜRÜ
 * ve (sayısal iddialarda) değeriyle deterministik uyumlu olmalı; uyumsuz bağ
 * CLAIM_EVIDENCE_MISMATCH üretir (alakasız kanıta bağlama GEÇEMEZ).
 */
/** Faz 2.4: toplu çağıranlar (kokpit) DB turlarını bir kez yapıp buraya verir. */
export interface GatePreloaded {
  bannedPhrases: string[]
  evidenceMeta: EvidenceMeta[]
}

export async function evaluateOutboundText(opts: EvaluateDraftOpts, preloaded?: GatePreloaded): Promise<GateVerdict> {
  const evidenceMeta = preloaded ? preloaded.evidenceMeta : await loadEvidenceMetaSafe(opts.leadId)
  const metaById = new Map(evidenceMeta.map((m) => [m.id, m]))
  const claimEvidence = (opts.claimEvidence ?? [])
    .map((e) => ({ claim: e.claim, evidenceIds: e.evidenceIds.filter((id) => metaById.has(id)) }))
    .filter((e) => e.evidenceIds.length > 0)

  // Semantik uyum: gövdede tespit edilen HER iddia için, onu kapsayan eşleme
  // varsa bağlı kanıtlardan EN AZ BİRİ kategori/değer uyumlu olmalı.
  const mismatchViolations: QualityViolation[] = []
  for (const detected of detectClaimsDetailed(opts.body)) {
    const fs = fold(detected.snippet)
    const covering = claimEvidence.filter((e) => {
      const fc = fold(e.claim)
      return e.claim.trim().length > 0 && (fc.includes(fs) || fs.includes(fc))
    })
    if (covering.length === 0) continue // kapsanmayan iddiayı lint CLAIM_WITHOUT_EVIDENCE ile bloklar
    let anyCompatible = false
    let firstReason: string | null = null
    for (const entry of covering) {
      for (const id of entry.evidenceIds) {
        const verdict = checkClaimEvidenceCompat(detected, metaById.get(id)!)
        if (verdict.ok) {
          anyCompatible = true
          break
        }
        firstReason = firstReason ?? verdict.reason
      }
      if (anyCompatible) break
    }
    if (!anyCompatible) {
      mismatchViolations.push({
        code: 'CLAIM_EVIDENCE_MISMATCH',
        detail: `İddia "${detected.snippet}" bağlı kanıtla doğrulanamıyor: ${firstReason ?? 'uyumsuz kanıt türü'}`,
      })
    }
  }

  const banned = preloaded ? preloaded.bannedPhrases : await getBannedPhrases()
  const lint = lintOutreachDraft({
    subject: opts.subject,
    body: opts.body,
    businessName: opts.businessName,
    contactName: opts.contactName ?? null,
    evidenceIds: [...metaById.keys()],
    claimEvidence,
    bannedPhrases: banned,
    channel: KIND_CHANNEL[opts.kind],
  })

  const allViolations = [...lint.violations, ...mismatchViolations]
  const ok = allViolations.length === 0
  const violations = allViolations.map((v) => ({ ...v, fix: VIOLATION_FIX[v.code] }))
  const digest = createHash('sha256')
    .update(JSON.stringify({ ok, violations: allViolations, banned, body: opts.body, subject: opts.subject }))
    .digest('hex')
  return { ok, violations, digest }
}
