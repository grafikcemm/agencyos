// Lead Scoring V3 — single source of truth, replaces both nicheScoring and leadScoring.
// Five sub-scores aligned to evidence engine signals.

import { matchSectorProfile } from './sectorPriority'
import { slugify } from './geo'
import type { EvidenceSignals } from './evidenceEngine'

// Davranışsal risk bayrakları — operatör outreach/yanıt sürecinde işaretler
// (LeadModal). MERSİS/Findeks YOK; tamamen gözlemlenen davranıştan beslenir.
export interface BehavioralFlags {
  free_sample?: boolean // ücretsiz bitmiş iş/örnek istedi
  no_company_record?: boolean // tüzel kişilik teyit edilemedi (operatör notu)
  payment_term_long?: boolean // ilk işte uzun ödeme vadesi dayatıyor
  scope_creep?: boolean // kapsam belirsiz / sürekli ekleme eğilimi
  bargaining?: boolean // sürekli fiyat pazarlığı
}

export type LeadRoute =
  | 'manual_hyper_personalization'
  | 'personalized_sequence'
  | 'nurture'
  | 'skip'

export interface V3ScoreInput {
  sector: string
  city: string
  rating: number | null
  reviewCount: number
  phone: string | null
  evidence: EvidenceSignals
  branchCount?: number
  /** Tespit edilen e-posta — sadece freemail bulunması hafif risk sinyalidir. */
  email?: string | null
  /** Operatör-işaretli davranışsal risk bayrakları (varsa). */
  behavioralFlags?: BehavioralFlags
}

export interface V3ScoreResult {
  evidence_score: number
  fit_score: number
  urgency_score: number
  money_score: number
  contactability_score: number
  /** Risk düşülmeden önceki ham ağırlıklı skor (0-100). */
  base_score: number
  /** Davranışsal/iletişim risk skoru (0-100, tipik 0-30). */
  risk_score: number
  potential_score: number  // base_score - risk_score, clamp 0-100
  priority: 'low' | 'normal' | 'high'
  /** Skora göre önerilen yönlendirme (hot-lead kapısı). */
  route: LeadRoute
  score_reasons: { reason: string; points: number }[]
  risk_reasons: { reason: string; points: number }[]
}

const FREEMAIL_DOMAINS = ['gmail.', 'hotmail.', 'yahoo.', 'outlook.', 'icloud.', 'yandex.', 'mynet.']

function isFreemail(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  return FREEMAIL_DOMAINS.some((d) => lower.includes(d))
}

export interface RiskInput {
  email?: string | null
  hasRealWebsite?: boolean | null
  behavioralFlags?: BehavioralFlags
}

/** Davranışsal + iletişim sinyallerinden risk skoru. RISK=0 → potential_score değişmez. */
function computeRisk(input: RiskInput): { risk: number; reasons: { reason: string; points: number }[] } {
  const reasons: { reason: string; points: number }[] = []
  let risk = 0
  const f = input.behavioralFlags ?? {}

  if (isFreemail(input.email)) {
    risk += 6; reasons.push({ reason: 'Sadece ücretsiz e-posta (kurumsal alan adı yok)', points: 6 })
  }
  if (input.email == null && !input.hasRealWebsite) {
    risk += 5; reasons.push({ reason: 'Kurumsal e-posta/site yok — doğrulama zor', points: 5 })
  }
  if (f.free_sample) {
    risk += 10; reasons.push({ reason: 'Ücretsiz bitmiş iş/örnek istedi', points: 10 })
  }
  if (f.no_company_record) {
    risk += 8; reasons.push({ reason: 'Tüzel kişilik teyit edilemedi (operatör notu)', points: 8 })
  }
  if (f.payment_term_long) {
    risk += 8; reasons.push({ reason: 'İlk işte uzun ödeme vadesi dayatıyor', points: 8 })
  }
  if (f.scope_creep) {
    risk += 6; reasons.push({ reason: 'Kapsam belirsiz / scope creep eğilimi', points: 6 })
  }
  if (f.bargaining) {
    risk += 5; reasons.push({ reason: 'Sürekli fiyat pazarlığı sinyali', points: 5 })
  }

  return { risk: clamp(risk), reasons }
}

function routeForScore(potential: number): LeadRoute {
  if (potential >= 75) return 'manual_hyper_personalization'
  if (potential >= 60) return 'personalized_sequence'
  if (potential >= 45) return 'nurture'
  return 'skip'
}

export interface RescoreResult {
  risk_score: number
  risk_reasons: { reason: string; points: number }[]
  potential_score: number
  priority: 'low' | 'normal' | 'high'
  route: LeadRoute
}

/**
 * Mevcut base_score'u koruyarak yalnız riski yeniden hesaplar — operatör LeadModal'da
 * davranışsal bayrak değiştirdiğinde tam yeniden tarama gerektirmez.
 */
export function rescoreWithRisk(baseScore: number, riskInput: RiskInput): RescoreResult {
  const base = clamp(baseScore)
  const { risk, reasons } = computeRisk(riskInput)
  const potential_score = clamp(base - risk)
  const priority: 'low' | 'normal' | 'high' =
    potential_score >= 70 ? 'high' : potential_score < 45 ? 'low' : 'normal'
  return {
    risk_score: risk,
    risk_reasons: reasons,
    potential_score,
    priority,
    route: routeForScore(potential_score),
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

// Şehir fit bonusu — deep-research (TÜİK GSYH + SGK işyeri + ödeme gücü) sentezi.
// 20 şehir. NOT: cityTargeting.ts SCAN_CITIES.cityBonus ile birebir aynı tutulmalı
// (cityBonusSync.test.ts bunu doğrular). Anahtarlar lowercase ASCII (getCityBonus normalize eder).
const CITY_BONUS: Record<string, number> = {
  'istanbul': 15, 'ankara': 12, 'izmir': 12, 'antalya': 11,
  'bursa': 9, 'kocaeli': 8, 'mugla': 8, 'konya': 7, 'gaziantep': 7,
  'mersin': 6, 'adana': 6, 'denizli': 5, 'kayseri': 5, 'sakarya': 5,
  'tekirdag': 5, 'eskisehir': 4, 'manisa': 4, 'samsun': 4,
  'trabzon': 3, 'sanliurfa': 2,
}

export function getCityBonus(city: string): number {
  // geo.slugify TR_MAP'i İ→i, ı→i, Ş→s vb. DOĞRU çevirir. (Eski .toLowerCase() yolu
  // 'İstanbul'.toLowerCase() = 'i̇stanbul' combining-dot üretip includes('istanbul')'u
  // bozuyordu → İstanbul/İzmir hiç bonus almıyordu.) CITY_BONUS anahtarları zaten slug.
  const slug = slugify(city)
  for (const [key, bonus] of Object.entries(CITY_BONUS)) {
    if (slug.includes(key)) return bonus
  }
  return 0
}

export function calculateLeadScoreV3(input: V3ScoreInput): V3ScoreResult {
  const reasons: { reason: string; points: number }[] = []
  const profile = matchSectorProfile(input.sector)
  const ev = input.evidence

  // evidence_score: pain intensity / missing digital infra
  let evidence = 40
  if (ev.instagram_as_site) {
    evidence += 25; reasons.push({ reason: 'Web sitesi yok (Instagram linki)', points: 25 })
  } else if (!ev.has_real_website) {
    evidence += 20; reasons.push({ reason: 'Web sitesi yok', points: 20 })
  }
  if (!ev.has_whatsapp) {
    evidence += 10; reasons.push({ reason: 'WhatsApp yok — lead kaçışı', points: 10 })
  }
  if (!ev.has_form) {
    evidence += 8; reasons.push({ reason: 'İletişim formu yok', points: 8 })
  }
  if (!ev.has_online_booking && (profile.id === 'health_clinic' || profile.id === 'beauty')) {
    evidence += 12; reasons.push({ reason: 'Online randevu yok (sektör için kritik)', points: 12 })
  }
  if (ev.is_slow_or_dead) {
    evidence += 8; reasons.push({ reason: 'Web sitesi yavaş/erişilemiyor', points: 8 })
  }
  if (input.rating !== null && input.rating < 4.0) {
    evidence += 10; reasons.push({ reason: `Düşük Google puanı (${input.rating})`, points: 10 })
  }
  if (input.reviewCount < 10) {
    evidence += 8; reasons.push({ reason: 'Çok az yorum (<10)', points: 8 })
  } else if (input.reviewCount < 50) {
    evidence += 4; reasons.push({ reason: 'Kısıtlı yorum (<50)', points: 4 })
  }
  const evidence_score = clamp(evidence)

  // fit_score: sector + city alignment
  let fit = profile.priority
  const cityBonus = getCityBonus(input.city)
  if (cityBonus > 0) {
    fit += cityBonus; reasons.push({ reason: `Büyükşehir bonusu (+${cityBonus})`, points: cityBonus })
  }
  reasons.push({ reason: `${profile.wave}. Dalga sektör: ${profile.displayName}`, points: profile.priority })
  const fit_score = clamp(fit)

  // urgency_score: how urgent is the sale
  let urgency = 30
  if (ev.has_ads_signal) {
    urgency += 30; reasons.push({ reason: 'Aktif reklam — hızlı dönüş gerekli', points: 30 })
  }
  if (ev.has_job_signal) {
    urgency += 20; reasons.push({ reason: 'Kariyer/işe-alım sinyali — büyüme + kreatif ihtiyacı', points: 20 })
  }
  if (['health_clinic', 'real_estate', 'automotive', 'medical_tourism', 'luxury_real_estate'].includes(profile.id)) {
    urgency += 15; reasons.push({ reason: 'Hızlı lead dönüşü kritik sektör', points: 15 })
  }
  // Sektörel dijital olgunluk açığı (deep-research painLevel 0-100) — açık ne kadar
  // büyükse satış o kadar acil/kolay. Küçük additive (max +15).
  if (profile.painLevel && profile.painLevel > 0) {
    const painBonus = Math.round(profile.painLevel * 0.15)
    urgency += painBonus
    reasons.push({ reason: `Sektör dijital açığı yüksek (+${painBonus})`, points: painBonus })
  }
  const urgency_score = clamp(urgency)

  // money_score: estimated budget
  const bandBase: Record<string, number> = { low: 25, mid: 50, high: 70, premium: 88 }
  let money = bandBase[profile.ticketBand] ?? 35
  if ((input.branchCount ?? 1) >= 3) {
    money += 10; reasons.push({ reason: 'Çok şubeli işletme (+10)', points: 10 })
  }
  const money_score = clamp(money)

  // contactability_score
  let contact = 20
  if (input.phone) {
    contact += 40; reasons.push({ reason: 'Telefon mevcut (+40)', points: 40 })
  } else {
    reasons.push({ reason: 'Telefon yok — outbound zorlaşır', points: -40 })
    contact -= 40
  }
  if (ev.has_real_website && !ev.is_slow_or_dead) {
    contact += 15; reasons.push({ reason: 'Çalışan web sitesi (+15)', points: 15 })
  }
  if (ev.has_whatsapp) {
    contact += 15; reasons.push({ reason: 'WhatsApp ulaşılabilir (+15)', points: 15 })
  }
  const contactability_score = clamp(contact)

  const base_score = clamp(
    evidence_score      * 0.25 +
    fit_score           * 0.25 +
    urgency_score       * 0.10 +
    money_score         * 0.20 +
    contactability_score * 0.20
  )

  const { risk: risk_score, reasons: risk_reasons } = computeRisk({
    email: input.email,
    hasRealWebsite: input.evidence.has_real_website,
    behavioralFlags: input.behavioralFlags,
  })
  const potential_score = clamp(base_score - risk_score)

  const priority: 'low' | 'normal' | 'high' =
    potential_score >= 70 ? 'high' : potential_score < 45 ? 'low' : 'normal'

  return {
    evidence_score,
    fit_score,
    urgency_score,
    money_score,
    contactability_score,
    base_score,
    risk_score,
    potential_score,
    priority,
    route: routeForScore(potential_score),
    score_reasons: reasons,
    risk_reasons,
  }
}
