// ─────────────────────────────────────────────────────────────────────────────
// Recipient + Evidence ENRICHMENT orkestratörü (FINAL PILOT BLOCKERS Faz 4).
//
// Amaç: kullanıcının recipient/evidence'i ELLE tamamlamasını azaltmak. Günün
// yüksek-öncelikli, alıcısı/evidence'i EKSİK lead'lerini otomatik zenginleştirir.
//
// KESİN KURALLAR:
//  • HARD CAP: günlük lead sayısı + Apollo çağrısı sınırı (kredi/maliyet koruması).
//  • Kaynak sırası: önce site/public (ücretsiz), gerekirse Apollo (ücretli).
//  • UYDURMA YOK: yalnız GERÇEK bulunan e-posta/isim contact olur; kanıtsız
//    hiçbir alan yazılmaz. Bulunamayan lead HITL kalır (görünür).
//  • Primary OTOMATİK seçimi YALNIZ güven eşiği üstünde; aksi hâlde contact
//    non-primary yazılır ve HITL (operatör onayı) bekler.
//  • Duplicate e-posta/contact transaction'da engellenir (contactService dedup).
//  • Hata/limit/maliyet GÖRÜNÜR (summary → kokpit).
//
// Saf orkestrasyon: tüm I/O enjekte edilir (EnrichmentDeps) → birim test +
// fake-provider E2E gerçek web/Apollo/DB çağrısı OLMADAN kanıtlanır.
// ─────────────────────────────────────────────────────────────────────────────

/** Güven eşiği: bunun ÜSTÜNDE bulunan e-posta otomatik primary olur; altı HITL. */
export const CONFIDENCE_PRIMARY_THRESHOLD = 0.7

/** Kaynak güven skorları (sabit, açıklanabilir). */
export const SOURCE_CONFIDENCE = {
  apollo_verified: 0.85,
  apollo_unverified: 0.5,
  website: 0.6,
} as const

export interface EnrichmentCaps {
  /** Bir koşuda işlenecek azami lead. */
  maxLeads: number
  /** Bir koşuda yapılacak azami Apollo (ücretli) çağrısı. */
  maxApolloCalls: number
}

export interface CandidateLead {
  leadId: string
  businessName: string
  website: string | null
  city: string | null
  sector: string | null
  /** Halihazırda çözülebilir alıcı e-postası var mı (primary contact / lead.email). */
  hasRecipient: boolean
  /** Halihazırda en az bir evidence satırı var mı. */
  hasEvidence: boolean
  /** Öncelik skoru (yüksek = önce). */
  priority: number
}

/** Bulunan bir kişi adayı — kaynak + güven + fetched_at ZORUNLU (izlenebilirlik). */
export interface FoundContact {
  fullName: string
  role: string
  email: string
  source: 'apollo' | 'website'
  confidence: number
  fetchedAt: string
}

/** Bulunan bir kanıt — source URL/type/summary/fetched_at + doğrulanabilir alan. */
export interface FoundEvidence {
  kind: string
  source: string
  url: string | null
  summary: string
  verified: boolean
  confidence: number
  fetchedAt: string
}

export interface EnrichmentDeps {
  /** Yüksek öncelikli, recipient/evidence eksik lead'ler (öncelik desc, cap'li). */
  selectCandidates(maxLeads: number): Promise<CandidateLead[]>
  /** Web/public kaynaktan kişi ara (ücretsiz). Bulunamazsa boş dizi. */
  findContactsFromWeb(lead: CandidateLead): Promise<FoundContact[]>
  /** Apollo'dan kişi ara (ÜCRETLİ — cap'e tabi). Bulunamazsa boş dizi. */
  findContactsFromApollo(lead: CandidateLead): Promise<FoundContact[]>
  /** Kanıt topla (site/places/psi). Bulunamazsa boş dizi. */
  collectEvidenceFor(lead: CandidateLead): Promise<FoundEvidence[]>
  /** Contact'ı transaction'da yaz (dedup). duplicate → {duplicate:true}. */
  saveContact(input: {
    leadId: string
    contact: FoundContact
    isPrimary: boolean
  }): Promise<{ ok: boolean; duplicate?: boolean; error?: string }>
  /** Evidence satırlarını yaz. Kaç satır yazıldığını döndürür. */
  saveEvidence(leadId: string, items: FoundEvidence[]): Promise<{ saved: number; error?: string }>
  /** Koşu özetini kalıcılaştır (kokpit görünürlüğü). */
  recordRunSummary(summary: EnrichmentSummary): Promise<void>
}

export interface EnrichmentLeadResult {
  leadId: string
  businessName: string
  contactsAdded: number
  primarySet: boolean
  hitlPending: boolean
  evidenceAdded: number
  usedApollo: boolean
  errors: string[]
}

export interface EnrichmentSummary {
  scanned: number
  contactsAdded: number
  evidenceAdded: number
  primaryAutoSet: number
  hitlPending: number
  apolloCalls: number
  duplicatesSkipped: number
  errors: string[]
  leads: EnrichmentLeadResult[]
  /** Cap'ler nedeniyle işlenmeyen aday sayısı (görünür — sessiz kesme yok). */
  cappedOut: number
}

function emptySummary(): EnrichmentSummary {
  return {
    scanned: 0, contactsAdded: 0, evidenceAdded: 0, primaryAutoSet: 0, hitlPending: 0,
    apolloCalls: 0, duplicatesSkipped: 0, errors: [], leads: [], cappedOut: 0,
  }
}

/** E-posta normalize + geçerlilik (uydurma/bozuk reddi). */
function isValidEmail(email: string): boolean {
  const e = email.trim().toLowerCase()
  return e.length > 3 && e.includes('@') && !/\s/.test(e) && e.split('@')[1]?.includes('.') === true
}

/**
 * Enrichment koşusu. Deps üzerinden çalışır (I/O yok); caps HARD.
 * Her lead için: recipient eksikse web→(cap'liyse)Apollo; evidence eksikse
 * collectEvidence. En güvenli GERÇEK e-posta primary eşiğini geçerse primary,
 * yoksa HITL. UYDURMA YOK.
 */
export async function runEnrichment(
  deps: EnrichmentDeps,
  caps: EnrichmentCaps,
): Promise<EnrichmentSummary> {
  const summary = emptySummary()
  const candidates = await deps.selectCandidates(caps.maxLeads)
  summary.scanned = Math.min(candidates.length, caps.maxLeads)
  // selectCandidates cap'i aşarsa (savunma) fazlası görünür şekilde bırakılır.
  if (candidates.length > caps.maxLeads) summary.cappedOut += candidates.length - caps.maxLeads

  for (const lead of candidates.slice(0, caps.maxLeads)) {
    const result: EnrichmentLeadResult = {
      leadId: lead.leadId, businessName: lead.businessName,
      contactsAdded: 0, primarySet: false, hitlPending: false, evidenceAdded: 0,
      usedApollo: false, errors: [],
    }

    // ── RECIPIENT ─────────────────────────────────────────────────────────
    if (!lead.hasRecipient) {
      try {
        // 1) Ücretsiz kaynak önce.
        let found = await deps.findContactsFromWeb(lead)
        // 2) Web bulamadıysa VE Apollo cap'i doldmadıysa → Apollo (ücretli).
        if (found.length === 0 && summary.apolloCalls < caps.maxApolloCalls) {
          summary.apolloCalls += 1
          result.usedApollo = true
          found = await deps.findContactsFromApollo(lead)
        }
        // UYDURMA YOK: yalnız GERÇEK e-postalı adaylar.
        const valid = found.filter((c) => c.email && isValidEmail(c.email) && c.fullName.trim())
        // En güvenli aday primary adayı.
        valid.sort((a, b) => b.confidence - a.confidence)
        let primaryAssigned = false
        for (const c of valid) {
          const eligible = !primaryAssigned && c.confidence >= CONFIDENCE_PRIMARY_THRESHOLD
          const saved = await deps.saveContact({ leadId: lead.leadId, contact: c, isPrimary: eligible })
          if (saved.duplicate) { summary.duplicatesSkipped += 1; continue }
          if (!saved.ok) { result.errors.push(saved.error ?? 'contact yazılamadı'); continue }
          result.contactsAdded += 1
          summary.contactsAdded += 1
          if (eligible) {
            primaryAssigned = true
            result.primarySet = true
            summary.primaryAutoSet += 1
          }
        }
        // Kişi bulundu ama hiçbiri eşiği geçmedi → HITL (operatör primary seçsin).
        if (valid.length > 0 && !primaryAssigned) {
          result.hitlPending = true
          summary.hitlPending += 1
        }
        // Hiç GERÇEK kişi yok → HITL (uydurma yerine görünür boşluk).
        if (valid.length === 0) {
          result.hitlPending = true
          summary.hitlPending += 1
        }
      } catch (err) {
        result.errors.push(`recipient enrichment: ${err instanceof Error ? err.message : 'hata'}`)
      }
    }

    // ── EVIDENCE ──────────────────────────────────────────────────────────
    if (!lead.hasEvidence) {
      try {
        const items = await deps.collectEvidenceFor(lead)
        // Yalnız doğrulanabilir/summary'li kanıt (uydurma yok).
        const usable = items.filter((e) => e.summary.trim() && (e.url || e.verified))
        if (usable.length > 0) {
          const res = await deps.saveEvidence(lead.leadId, usable)
          if (res.error) result.errors.push(`evidence: ${res.error}`)
          result.evidenceAdded += res.saved
          summary.evidenceAdded += res.saved
        }
      } catch (err) {
        result.errors.push(`evidence enrichment: ${err instanceof Error ? err.message : 'hata'}`)
      }
    }

    summary.errors.push(...result.errors)
    summary.leads.push(result)
  }

  await deps.recordRunSummary(summary)
  return summary
}
