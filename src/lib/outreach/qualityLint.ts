// ─────────────────────────────────────────────────────────────────────────────
// Outreach kalite lint'i (Faz D3) — TAMAMEN DETERMİNİSTİK, LLM YOK.
//
// AI judge (agencyos-judge preset) tamamlayıcıdır; tek başına kabul kapısı
// OLAMAZ. Bu lint her taslakta koşar ve ihlaller taslağı 'revize gerekir'
// durumuna düşürür. Uydurma müşteri başarısı/sayı/gözlem: kanıt (evidence)
// referansı olmayan iddialar CLAIM_WITHOUT_EVIDENCE ile yakalanır.
// ─────────────────────────────────────────────────────────────────────────────

export interface QualityLintInput {
  subject: string | null
  body: string
  businessName: string
  contactName?: string | null
  /** Taslağın dayandığı kanıt kimlikleri (lead_evidence). Boş → kanıt iddiası yasak. */
  evidenceIds: string[]
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
  'değerli müşterimiz',
  'degerli musterimiz',
  'sizinle çalışmak için sabırsızlanıyorum',
  'sektör lideri',
  'sektor lideri',
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
]

/** Kanıt gerektiren iddia kalıpları: sayı/başarı/gözlem cümleleri. */
const CLAIM_PATTERNS = [
  /%\s?\d{1,3}/g, // yüzde iddiası
  /\d+\s*(kat|misli)\b/gi, // "3 kat artış"
  /\d+\s*(yeni\s+)?müşteri/gi,
  /\d+\s*(yeni\s+)?musteri/gi,
  /(gördüm|gordum|fark ettim|inceledim|baktım|baktim)/gi, // gözlem iddiası
]

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

  // Kanıtsız iddia: sayı/başarı/gözlem VAR ama evidence referansı YOK.
  const hasClaims = CLAIM_PATTERNS.some((p) => {
    p.lastIndex = 0
    return p.test(body)
  })
  if (hasClaims && input.evidenceIds.length === 0) {
    violations.push({
      code: 'CLAIM_WITHOUT_EVIDENCE',
      detail: 'Sayı/başarı/gözlem iddiası var ama evidence_id bağlanmamış — uydurma riski',
    })
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
