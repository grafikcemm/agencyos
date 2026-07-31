// ─────────────────────────────────────────────────────────────────────────────
// email_pilot_v1 — VERİ OLARAK KOD. Üç temas: gün 0, 3, 7.
//
// NEDEN ÜÇ: dördüncü temasın cevap getirdiğine dair elimizde ölçüm YOK; olmayan
// bir ölçüme dayanarak temas eklemek, alıcının kutusunu bizim varsayımımızla
// doldurmak olur. Mevcut 6 temaslı çok kanallı matris (`channelMatrix.ts`)
// SİLİNMEDİ — o farklı bir akış; bu pilot yalnız e-posta kanalını ve yalnız
// ölçülebilir bir hipotezi test eder.
//
// SERT BİÇİM KURALLARI (hepsi tek bir amaca hizmet ediyor: mesaj bir insandan
// gelmiş gibi okunmalı, bir kampanyadan değil):
//   · düz metin, 60-100 kelime
//   · TEK gözlem, TEK hipotez, TEK çağrı
//   · link, takip pikseli, UTM, emoji, büyük imza YOK
//   · imza tam olarak "Ali Cem Bozma / Grafikcem"
//   · portföy/örnek iş YALNIZ olumlu cevaptan sonra ya da açık istek üzerine
//
// KANIT YOKSA MESAJ YOK. Gözlem uydurulamaz: `abstain` döner ve o lead diziye
// hiç girmez. Boş bir gözlemle gönderilen mail, alıcı için spam'dan farksızdır.
//
// DİL: TR lead'e yalnız Türkçe. Global lead'e İngilizce + operatörün okuyacağı
// TÜRKÇE geri çeviri. Geri çeviri MAKİNE ÇEVİRİSİ DEĞİLDİR — aynı yapılandırılmış
// kanıtın Türkçe alanından gelir. Operatörün onayladığı metin, gerçekten
// gönderilecek metnin karşılığı olmalı; model üretimi bir çeviri bunu garanti
// etmezdi.
// ─────────────────────────────────────────────────────────────────────────────

export type PilotLocale = 'tr' | 'en'

/** İki dilde taşınan metin. `en` yoksa global lead'e gönderim YAPILMAZ. */
export interface LocalizedText {
  tr: string
  en?: string | null
}

export interface PilotEvidence {
  /** ÖLÇÜLMÜŞ, siteye/işe özgü tek gözlem. Genel ifade kabul edilmez. */
  observation: LocalizedText
  /** Gözlemden çıkan tek hipotez — garanti değil, hipotez. */
  hypothesis: LocalizedText
  /** Tek çağrı. Soru işaretiyle biten, düşük taahhütlü. */
  cta: LocalizedText
}

export interface PilotStep {
  key: 'day0' | 'day3' | 'day7'
  dayOffset: number
  /** Bu temasın işi — iki temas aynı işi yapıyorsa biri fazladır. */
  purpose: string
  subject: LocalizedText
  opening: LocalizedText
}

/** Diziyi tanımlayan tek veri yapısı. Kod bunu OKUR, yeniden yazmaz. */
export const EMAIL_PILOT_V1: readonly PilotStep[] = Object.freeze([
  {
    key: 'day0',
    dayOffset: 0,
    purpose: 'Tek somut gözlemi paylaş ve düşük taahhütlü bir cevap iste',
    subject: { tr: 'Sitenizde bir detay', en: 'One detail on your site' },
    opening: { tr: 'Merhaba', en: 'Hello' },
  },
  {
    key: 'day3',
    dayOffset: 3,
    purpose: 'Aynı gözlemi tekrar etmeden hipotezi netleştir',
    subject: { tr: 'Kısa ek', en: 'Short follow-up' },
    opening: { tr: 'Merhaba tekrar', en: 'Hello again' },
  },
  {
    key: 'day7',
    dayOffset: 7,
    purpose: 'Döngüyü kapat; ilgi yoksa bir daha yazılmayacağını söyle',
    subject: { tr: 'Son not', en: 'Last note' },
    opening: { tr: 'Merhaba', en: 'Hello' },
  },
])

export const SIGNATURE = 'Ali Cem Bozma\nGrafikcem'
export const MIN_WORDS = 60
export const MAX_WORDS = 100

/** Diziyi sonlandıran olaylar. Biri geldiyse KALAN TEMAS GÖNDERİLMEZ. */
export const TERMINAL_EVENTS = Object.freeze(['reply', 'opt_out', 'bounce', 'complaint'] as const)
export type TerminalEvent = (typeof TERMINAL_EVENTS)[number]

export type AbstainReason =
  | 'missing_observation'
  | 'missing_hypothesis'
  | 'missing_cta'
  | 'missing_translation'
  | 'observation_too_generic'

export interface RenderedStep {
  stepKey: PilotStep['key']
  locale: PilotLocale
  subject: string
  body: string
  wordCount: number
  /** Global lead'de operatörün onaylayacağı Türkçe karşılık. TR'de `null`. */
  backTranslationTr: string | null
  /**
   * Biçim denetimi SONUCU — üretim anında.
   *
   * Üretici kendi kapısından geçmeyen bir taslak üretebiliyorsa (kanıt metni
   * çok kısa geldiğinde olur), bunu çağırana söylemesi gerekir. Yalnız
   * "üretildi" demek, gönderilemeyecek bir taslağı gönderilebilir göstermek
   * olurdu; `sendable` bu yüzden ayrı bir alan.
   */
  format: FormatCheck
  sendable: boolean
}

export type RenderResult =
  | { ok: true; step: RenderedStep }
  | { ok: false; abstain: true; reasons: AbstainReason[] }

/** Kelime sayımı — noktalama tek başına kelime sayılmaz. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/**
 * "Genel" gözlem tespiti.
 *
 * Bir gözlem işletmeye özgü değilse (herhangi bir siteye yazılabiliyorsa) o bir
 * gözlem değil, doldurma cümlesidir. Kapalı bir kalıp listesi kullanılıyor;
 * liste kısa ve yanlış-pozitifi düşük tutuluyor çünkü gerçek bir gözlemi
 * yanlışlıkla elemek, gönderilmeyecek bir maili gönderilmez yapmaktan daha
 * pahalı: lead sessizce kaybolur.
 */
const GENERIC_PATTERNS: RegExp[] = [
  /^siteniz(i)? (inceledim|gezdim)\.?$/i,
  /^harika bir (iş|site)/i,
  /^tebrikler/i,
  /^(i )?(saw|checked|visited) your (site|website)\.?$/i,
  /^great (job|website|site)/i,
  /^congrats/i,
]

export function isGenericObservation(text: string): boolean {
  const t = text.trim()
  if (t.length < 25) return true
  return GENERIC_PATTERNS.some((p) => p.test(t))
}

function pickLocale(v: LocalizedText, locale: PilotLocale): string | null {
  if (locale === 'tr') return v.tr?.trim() || null
  return v.en?.trim() || null
}

/**
 * Bir temasın metnini üretir ya da ÇEKİMSER KALIR.
 *
 * Çekimserlik bir hata değil, doğru sonuçtur: kanıtı olmayan bir mesaj
 * gönderilmemelidir. Sebepler tek tek döner ki operatör neyi tamamlaması
 * gerektiğini görsün.
 */
export function renderPilotStep(input: {
  step: PilotStep
  locale: PilotLocale
  recipientFirstName?: string | null
  evidence: PilotEvidence
  /** Portföyden söz edilmesine izin var mı (olumlu cevap ya da açık istek). */
  portfolioAllowed?: boolean
}): RenderResult {
  const { step, locale, evidence } = input
  const reasons: AbstainReason[] = []

  const observation = pickLocale(evidence.observation, locale)
  const hypothesis = pickLocale(evidence.hypothesis, locale)
  const cta = pickLocale(evidence.cta, locale)

  if (!evidence.observation.tr?.trim()) reasons.push('missing_observation')
  if (!evidence.hypothesis.tr?.trim()) reasons.push('missing_hypothesis')
  if (!evidence.cta.tr?.trim()) reasons.push('missing_cta')
  // Global lead: İngilizce karşılık YOKSA gönderim yok. Türkçeyi İngilizce
  // yerine göndermek, alıcının okuyamayacağı bir mail atmaktır.
  if (locale === 'en' && (!observation || !hypothesis || !cta)) reasons.push('missing_translation')
  if (evidence.observation.tr?.trim() && isGenericObservation(evidence.observation.tr)) {
    reasons.push('observation_too_generic')
  }
  if (reasons.length) return { ok: false, abstain: true, reasons: [...new Set(reasons)] }

  const opening = pickLocale(step.opening, locale) ?? step.opening.tr
  const name = input.recipientFirstName?.trim()
  const greeting = name ? `${opening} ${name},` : `${opening},`

  const build = (o: string, h: string, c: string, greetingLine: string) =>
    [greetingLine, '', o.trim(), '', h.trim(), '', c.trim(), '', SIGNATURE].join('\n')

  const body = build(observation!, hypothesis!, cta!, greeting)
  const backTranslationTr =
    locale === 'en'
      ? build(
          evidence.observation.tr,
          evidence.hypothesis.tr,
          evidence.cta.tr,
          name ? `${step.opening.tr} ${name},` : `${step.opening.tr},`,
        )
      : null

  const format = checkPilotFormat(body, { portfolioAllowed: input.portfolioAllowed })
  return {
    ok: true,
    step: {
      stepKey: step.key,
      locale,
      subject: pickLocale(step.subject, locale) ?? step.subject.tr,
      body,
      wordCount: format.wordCount,
      backTranslationTr,
      format,
      sendable: format.ok,
    },
  }
}

export type FormatViolation =
  | 'too_short'
  | 'too_long'
  | 'contains_link'
  | 'contains_tracking'
  | 'contains_emoji'
  | 'multiple_questions'
  | 'wrong_signature'
  | 'contains_html'
  | 'portfolio_without_consent'

export interface FormatCheck {
  ok: boolean
  violations: FormatViolation[]
  wordCount: number
}

const LINK_RE = /(https?:\/\/|www\.)/i
const TRACKING_RE = /(utm_|\?ref=|pixel|open\.gif|click\.|mailtrack)/i
const EMOJI_RE = /\p{Extended_Pictographic}/u
const HTML_RE = /<[a-z/][^>]*>/i
const PORTFOLIO_RE = /(portföy|portfolio|örnek çalışma|case study|behance|dribbble)/i

/**
 * Biçim denetimi — gönderim yolunun ÖNÜNDE durur.
 *
 * Bu kurallar üretim tarafında değil burada yaşıyor çünkü metin nereden gelirse
 * gelsin (şablon, operatör düzenlemesi, gelecekte bir model) aynı kapıdan
 * geçmeli. Tek kapı, atlanamayan kapıdır.
 */
export function checkPilotFormat(body: string, opts: { portfolioAllowed?: boolean } = {}): FormatCheck {
  const violations: FormatViolation[] = []
  const wordCount = countWords(body)

  if (wordCount < MIN_WORDS) violations.push('too_short')
  if (wordCount > MAX_WORDS) violations.push('too_long')
  if (LINK_RE.test(body)) violations.push('contains_link')
  if (TRACKING_RE.test(body)) violations.push('contains_tracking')
  if (EMOJI_RE.test(body)) violations.push('contains_emoji')
  if (HTML_RE.test(body)) violations.push('contains_html')
  // TEK çağrı: iki soru işareti iki ayrı talep demektir ve cevap oranını
  // ölçülemez hâle getirir (hangi soruya cevap geldi?).
  if ((body.match(/\?/g) ?? []).length > 1) violations.push('multiple_questions')
  if (!body.trimEnd().endsWith(SIGNATURE)) violations.push('wrong_signature')
  if (!opts.portfolioAllowed && PORTFOLIO_RE.test(body)) violations.push('portfolio_without_consent')

  return { ok: violations.length === 0, violations, wordCount }
}

/**
 * Olaylardan sonra GÖNDERİLECEK temaslar.
 *
 * Sonlandırıcı olaylardan biri geldiyse KALAN HER TEMAS iptal edilir. Cevap
 * verene "takip" atmak, olumsuz cevap verene ısrar etmek ve bounce alan adrese
 * yazmaya devam etmek — üçü de gönderen itibarını ve alıcı güvenini bitirir.
 */
export function remainingSteps(input: {
  completedStepKeys: readonly string[]
  events: readonly { eventType: string }[]
}): PilotStep[] {
  const terminal = input.events.some((e) => (TERMINAL_EVENTS as readonly string[]).includes(e.eventType))
  if (terminal) return []
  const done = new Set(input.completedStepKeys)
  return EMAIL_PILOT_V1.filter((s) => !done.has(s.key))
}

/** Bir temasın planlanan gönderim anı (İstanbul iş saatine göre değil, gün ofseti). */
export function stepDueAt(step: PilotStep, startedAt: Date): Date {
  return new Date(startedAt.getTime() + step.dayOffset * 24 * 60 * 60 * 1000)
}
