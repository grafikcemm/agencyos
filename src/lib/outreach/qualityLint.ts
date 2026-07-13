// ─────────────────────────────────────────────────────────────────────────────
// Outreach kalite lint'i (Faz D3) — TAMAMEN DETERMİNİSTİK, LLM YOK.
//
// AI judge (agencyos-judge preset) tamamlayıcıdır; tek başına kabul kapısı
// OLAMAZ. Bu lint her taslakta koşar ve ihlaller taslağı 'revize gerekir'
// durumuna düşürür. Uydurma müşteri başarısı/sayı/gözlem: kanıt (evidence)
// referansı olmayan iddialar CLAIM_WITHOUT_EVIDENCE ile yakalanır.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimEvidenceEntry {
  /** İddianın metindeki (yaklaşık) hâli — eşleşme fold'lu substring iledir. */
  claim: string
  /** Bu iddiayı destekleyen SPESİFİK lead_evidence id'leri (≥1 zorunlu). */
  evidenceIds: string[]
}

export interface QualityLintInput {
  subject: string | null
  body: string
  businessName: string
  contactName?: string | null
  /** Taslağın dayandığı kanıt kimlikleri (lead_evidence). Boş → kanıt iddiası yasak. */
  evidenceIds: string[]
  /**
   * Faz 1.2: iddia → SPESİFİK kanıt eşlemesi. "Lead'in herhangi bir evidence
   * kaydı var" YETERLİ DEĞİLDİR — tespit edilen HER iddia burada ≥1 evidence
   * id ile eşlenmiş olmalı; eşlenmemiş iddia CLAIM_WITHOUT_EVIDENCE bloklar.
   */
  claimEvidence?: ClaimEvidenceEntry[]
  /** Voice DNA v0: operatör onaylı yasak ifadeler (settings.voice_banned_phrases). */
  bannedPhrases: string[]
  channel: 'email' | 'whatsapp' | 'instagram'
}

export interface QualityViolation {
  code:
    | 'SUBJECT_MISSING'
    | 'SUBJECT_TOO_LONG'
    | 'NO_BUSINESS_CONTEXT'
    | 'GENERIC_CLICHE'
    | 'SPAM_RISK_LANGUAGE'
    | 'MULTIPLE_CTA'
    | 'NO_CTA'
    | 'CLAIM_WITHOUT_EVIDENCE'
    | 'MISSING_OPT_OUT'
    | 'VOICE_BANNED_PHRASE'
    | 'BODY_TOO_LONG'
  detail: string
}

export interface QualityLintResult {
  ok: boolean
  violations: QualityViolation[]
}

const SUBJECT_MAX = 78 // RFC pratik sınırının altı; mobil önizleme ~60-78.
const BODY_MAX_CHARS = 1800 // Cold email kısa olmalı (~250 kelime).

/** Generic cliché'ler — kişiselleştirilmemiş şablon kokusu. */
const CLICHES = [
  'umarım bu e-posta sizi iyi bulur',
  'umarim bu e-posta sizi iyi bulur',
  'umarım bu mail sizi iyi bulur',
  'umarim bu mail sizi iyi bulur',
  'değerli müşterimiz',
  'degerli musterimiz',
  'değerli yetkili',
  'degerli yetkili',
  'sizinle çalışmak için sabırsızlanıyorum',
  'sektör lideri',
  'sektor lideri',
  'sektörünüzde lider',
  'sektorunuzde lider',
  // Sprint-3 Faz 3: prompt'ta yasaklanan kurumsal kalıplar lint'te de yakalanır.
  'çözüm ortağı',
  'cozum ortagi',
  'sinerji',
  'değer katmak',
  'deger katmak',
  'i hope this email finds you well',
  'to whom it may concern',
]

/** Spam/risk dili — deliverability ve güven zedeleyici. */
const SPAM_WORDS = [
  'garanti ed', // ediyoruz / edebilirim / ederiz
  '%100 garanti',
  'ücretsiz!!!',
  'hemen tıklayın',
  'hemen tiklayin',
  'kaçırmayın',
  'kacirmayin',
  'son şans',
  'son sans',
  'sınırlı süre',
  'sinirli sure',
  'bedava',
  'act now',
  'limited time',
]

/** CTA kalıpları — tek net düşük-sürtünmeli CTA istenir. */
const CTA_PATTERNS = [
  /15\s*dakika/gi,
  /kısa bir görüşme/gi,
  /kisa bir gorusme/gi,
  /uygun musunuz/gi,
  /uygun olur mu/gi,
  /takvim(imden|den)? .{0,20}seç/gi,
  /cevaplaman[ıi]z yeterli/gi,
  /görüşelim mi/gi,
  /goruselim mi/gi,
  /arayabilir miyim/gi,
  // Sprint-3 Faz 2.7/3: üretim şablonlarının kullandığı düşük-sürtünmeli CTA
  // biçimleri de "tanınan CTA" sayılır (NO_CTA yanlış-pozitifleri kapanır).
  /g[öo]stereyim mi/gi,
  /payla[şs]abilir miyim/gi,
  /payla[şs]ay[ıi]m m[ıi]/gi,
  /yazay[ıi]m m[ıi]/gi,
  /["']?sonra["']? yazman[ıi]z yeterli/gi,
  /["']?1["']? yazman[ıi]z yeterli/gi,
  /de[ğg]erlendirelim mi/gi,
  /[üu]zerinden ge[çc]elim mi/gi,
  /inceleyelim mi/gi,
]

/** Kanıt gerektiren iddia kalıpları: sayı/süre/yüzde/performans/sonuç/gözlem. */
const CLAIM_PATTERNS = [
  /%\s?\d{1,3}/g, // yüzde iddiası ("%35")
  /\d+\s*(kat|misli)\b/gi, // "3 kat artış"
  /\d+\s*[xX]\b/g, // "3X"
  /\d+\s*(yeni\s+)?müşteri/gi,
  /\d+\s*(yeni\s+)?musteri/gi,
  /\b\d+\s*(hafta|gün|gun|ay)(da|de|ta|te|\s*içinde|\s*icinde)\b/gi, // süre vaadi ("1 haftada", "90 günde")
  /(ciro|gelir|sat[ıi]ş|satis)\s*art[ıi]ş/gi, // sonuç vaadi ("doğrudan ciro artışı")
  /cevap\s*(alam[ıi]yor|veremiyor|alm[ıi]yor)/gi, // müşteri-davranışı gözlemi
  /(rakibe|rakiplere)\s*geç/gi, // davranış iddiası ("rakibe geçiyor") — canlı T1 şablonu
  /yar[ıi]ya\s*(indir|düşür|dusur)/gi, // performans vaadi ("no-show'u yarıya indiren") — canlı T5
  /(gördüm|gordum|fark ettim|inceledim|baktım|baktim)/gi, // gözlem iddiası
]

/** Metindeki iddia parçalarını (snippet) toplar — kapsam kontrolü parça bazında. */
export function detectClaims(body: string): string[] {
  const found: string[] = []
  for (const p of CLAIM_PATTERNS) {
    p.lastIndex = 0
    for (const m of body.matchAll(new RegExp(p.source, p.flags))) {
      if (m[0]) found.push(m[0])
    }
  }
  return [...new Set(found)]
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
}

export function lintOutreachDraft(input: QualityLintInput): QualityLintResult {
  const violations: QualityViolation[] = []
  const body = input.body ?? ''
  const foldedBody = fold(body)

  // Subject (yalnız email).
  if (input.channel === 'email') {
    const subject = (input.subject ?? '').trim()
    if (!subject) violations.push({ code: 'SUBJECT_MISSING', detail: 'Konu satırı boş' })
    else if (subject.length > SUBJECT_MAX) {
      violations.push({ code: 'SUBJECT_TOO_LONG', detail: `Konu ${subject.length} karakter (>${SUBJECT_MAX})` })
    }
  }

  // İşletme VE/VEYA kişi bağlamı — en az biri metinde geçmeli.
  const hasBusiness = input.businessName.trim().length > 1 && foldedBody.includes(fold(input.businessName))
  const hasContact = Boolean(input.contactName && foldedBody.includes(fold(input.contactName)))
  if (!hasBusiness && !hasContact) {
    violations.push({
      code: 'NO_BUSINESS_CONTEXT',
      detail: `Gövde ne işletme adını (${input.businessName}) ne kişi adını içeriyor — generic şablon`,
    })
  }

  // Cliché + spam.
  for (const c of CLICHES) {
    if (foldedBody.includes(fold(c))) {
      violations.push({ code: 'GENERIC_CLICHE', detail: `Cliché: "${c}"` })
    }
  }
  for (const w of SPAM_WORDS) {
    if (foldedBody.includes(fold(w))) {
      violations.push({ code: 'SPAM_RISK_LANGUAGE', detail: `Spam/risk dili: "${w}"` })
    }
  }

  // Tek CTA — CÜMLE bazında sayılır ("15 dakika uygun musunuz?" tek CTA'dır;
  // iki ayrı istek cümlesi iki CTA'dır).
  const sentences = body.split(/[.!?\n]+/)
  const ctaCount = sentences.filter((s) =>
    CTA_PATTERNS.some((p) => {
      p.lastIndex = 0
      return p.test(s)
    }),
  ).length
  if (ctaCount === 0) violations.push({ code: 'NO_CTA', detail: 'Net bir CTA yok' })
  if (ctaCount > 1) violations.push({ code: 'MULTIPLE_CTA', detail: `${ctaCount} CTA — tek olmalı` })

  // Kanıtsız iddia (Faz 1.2): tespit edilen HER iddia SPESİFİK evidence
  // eşlemesi ister. Lead'de "herhangi bir evidence var" YETERLİ DEĞİL.
  const claims = detectClaims(body)
  if (claims.length > 0) {
    const map = input.claimEvidence ?? []
    const uncovered = claims.filter((snippet) => {
      const fs = fold(snippet)
      return !map.some(
        (e) =>
          e.evidenceIds.length > 0 &&
          e.claim.trim().length > 0 &&
          (fold(e.claim).includes(fs) || fs.includes(fold(e.claim))),
      )
    })
    for (const snippet of uncovered) {
      violations.push({
        code: 'CLAIM_WITHOUT_EVIDENCE',
        detail: `İddia "${snippet}" spesifik evidence_id ile eşlenmemiş — uydurma riski`,
      })
    }
  }

  // Opt-out / compliance (email zorunlu).
  if (input.channel === 'email') {
    const hasOptOut = /(listeden ç[ıi]k|listeden cik|abonelikten|unsubscribe|yan[ıi]tlaman[ıi]z yeterli.*ç[ıi]kar|istemiyorsan[ıi]z)/i.test(body)
    if (!hasOptOut) {
      violations.push({ code: 'MISSING_OPT_OUT', detail: 'Opt-out/İYS uyum cümlesi yok' })
    }
  }

  // Voice DNA yasak ifadeleri.
  for (const phrase of input.bannedPhrases) {
    if (phrase.trim() && foldedBody.includes(fold(phrase))) {
      violations.push({ code: 'VOICE_BANNED_PHRASE', detail: `Yasak ifade: "${phrase}"` })
    }
  }

  if (body.length > BODY_MAX_CHARS) {
    violations.push({ code: 'BODY_TOO_LONG', detail: `Gövde ${body.length} karakter (>${BODY_MAX_CHARS})` })
  }

  return { ok: violations.length === 0, violations }
}
