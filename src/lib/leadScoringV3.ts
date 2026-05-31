// Lead Scoring V3 — single source of truth, replaces both nicheScoring and leadScoring.
// Five sub-scores aligned to evidence engine signals.

import { matchSectorProfile } from './sectorPriority'
import type { EvidenceSignals } from './evidenceEngine'

export interface V3ScoreInput {
  sector: string
  city: string
  rating: number | null
  reviewCount: number
  phone: string | null
  evidence: EvidenceSignals
  branchCount?: number
}

export interface V3ScoreResult {
  evidence_score: number
  fit_score: number
  urgency_score: number
  money_score: number
  contactability_score: number
  potential_score: number  // weighted total 0-100
  priority: 'low' | 'normal' | 'high'
  score_reasons: { reason: string; points: number }[]
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

const CITY_BONUS: Record<string, number> = {
  'istanbul': 15, 'ankara': 10, 'izmir': 10,
  'bursa': 5, 'antalya': 5, 'kocaeli': 5, 'gaziantep': 3,
}

function getCityBonus(city: string): number {
  const lower = city.toLowerCase()
    .replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ğ/g, 'ğ')
    .replace(/Ş/g, 'ş').replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç')
  for (const [key, bonus] of Object.entries(CITY_BONUS)) {
    if (lower.includes(key)) return bonus
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
  if (['health_clinic', 'real_estate', 'automotive'].includes(profile.id)) {
    urgency += 15; reasons.push({ reason: 'Hızlı lead dönüşü kritik sektör', points: 15 })
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

  const potential_score = clamp(
    evidence_score      * 0.25 +
    fit_score           * 0.25 +
    urgency_score       * 0.10 +
    money_score         * 0.20 +
    contactability_score * 0.20
  )

  const priority: 'low' | 'normal' | 'high' =
    potential_score >= 70 ? 'high' : potential_score < 45 ? 'low' : 'normal'

  return {
    evidence_score,
    fit_score,
    urgency_score,
    money_score,
    contactability_score,
    potential_score,
    priority,
    score_reasons: reasons,
  }
}
