// High Quality Lead Engine — which leads are worth pursuing right now?
// Pure rule-based, no LLM, deterministic and fast.

import { matchSectorProfile } from './sectorPriority'
import type { Lead } from './types'
import type { EvidenceSignals } from './evidenceEngine'

export type LeadTier = 'A' | 'B' | 'C' | 'D'
export type QualityLabel = 'Nokta Atışı' | 'Çok Güçlü' | 'Takip Edilebilir' | 'Zayıf' | 'Ele'
export type NextActionPriority = 'call_now' | 'send_audit' | 'warm_up' | 'wait' | 'discard'
export type BestChannel = 'phone' | 'whatsapp' | 'email' | 'instagram' | 'unknown'

export interface QualityResult {
  quality_score: number
  conversion_probability: number
  money_potential_score: number
  urgency_score: number
  pain_intensity_score: number
  contactability_score: number
  agency_fit_score: number
  confidence_score: number
  lead_tier: LeadTier
  quality_label: QualityLabel
  disqualification_reason: string | null
  qualification_reasons: string[]
  conversion_angle: string
  why_this_will_convert: string
  expected_offer_value_tl: number
  expected_monthly_value_tl: number
  best_channel: BestChannel
  first_30_seconds_pitch: string
  objection_risks: string[]
  next_action_priority: NextActionPriority
  normalized_sector: string
}

export interface QualityInput {
  lead: Partial<Lead>
  evidence: EvidenceSignals
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

const SECTOR_MONEY_MULTIPLIERS: Record<string, number> = {
  health_clinic: 1.4, real_estate: 1.3, insurance: 1.2,
  automotive: 1.1, ecommerce: 1.15, accounting: 1.0,
  education: 0.9, beauty: 0.85, tourism: 0.9, logistics: 1.0,
}

const SECTOR_OFFER_VALUES: Record<string, { setup: number; monthly: number }> = {
  health_clinic: { setup: 9000, monthly: 12000 },
  real_estate:   { setup: 9000, monthly: 10000 },
  insurance:     { setup: 10000, monthly: 12000 },
  automotive:    { setup: 8000, monthly: 9000 },
  ecommerce:     { setup: 10000, monthly: 14000 },
  accounting:    { setup: 10000, monthly: 11000 },
  education:     { setup: 8000, monthly: 9000 },
  beauty:        { setup: 7000, monthly: 9000 },
  tourism:       { setup: 7000, monthly: 8000 },
  logistics:     { setup: 9000, monthly: 9000 },
}

const DISQUALIFY_KEYWORDS = [
  'devlet', 'kamu', 'belediye', 'üniversite', 'sağlık bakanlığı',
  'franchise', 'mcdonald', 'starbucks', 'migros', 'carrefour', 'bim ', 'a101',
  'türk telekom', 'ziraat bank', 'halk bank',
]

export function runQualityEngine({ lead, evidence }: QualityInput): QualityResult {
  const profile = matchSectorProfile(lead.sector)
  const nameLower = (lead.business_name ?? '').toLowerCase()
  const qualReasons: string[] = []
  let disqualReason: string | null = null

  // Disqualification
  if (!lead.phone) {
    disqualReason = 'Telefon yok — outbound iletişim imkânsız'
  } else if (DISQUALIFY_KEYWORDS.some(kw => nameLower.includes(kw))) {
    disqualReason = 'Kamu/zincir/franchise işletme — satış zorluğu yüksek'
  } else if (profile.id === 'other' && profile.wave === 3) {
    disqualReason = 'Sektör AI ajans hizmetleri için uygun değil'
  }

  // Contactability
  let contact = 0
  if (lead.phone) { contact += 50; qualReasons.push('Telefon mevcut') }
  if (evidence.has_whatsapp) { contact += 25; qualReasons.push('WhatsApp var') }
  if (evidence.has_real_website) contact += 15
  if (lead.email) contact += 10
  const contactability_score = clamp(contact)

  // Pain intensity
  let pain = 30
  if (!evidence.has_real_website || evidence.instagram_as_site) {
    pain += 30; qualReasons.push('Web sitesi yok / sadece Instagram')
  } else if (evidence.is_slow_or_dead) {
    pain += 18; qualReasons.push('Web sitesi erişilemiyor')
  }
  if (!evidence.has_whatsapp) { pain += 15; qualReasons.push('WhatsApp kanalı yok') }
  if (!evidence.has_form) pain += 8
  if (!evidence.has_online_booking && ['health_clinic', 'beauty'].includes(profile.id)) {
    pain += 15; qualReasons.push('Online randevu yok')
  }
  if ((lead.rating ?? 5) < 4.0) { pain += 12; qualReasons.push(`Google puanı düşük (${lead.rating})`) }
  if ((lead.review_count ?? 999) < 20) { pain += 10; qualReasons.push(`Az yorum (${lead.review_count ?? 0})`) }
  const pain_intensity_score = clamp(pain)

  // Agency fit
  const agency_fit_score = clamp(profile.priority)

  // Money potential
  const bandBase: Record<string, number> = { low: 40, mid: 60, high: 75, premium: 90 }
  const mult = SECTOR_MONEY_MULTIPLIERS[profile.id] ?? 1.0
  let money = Math.round((bandBase[profile.ticketBand] ?? 50) * mult)
  if ((lead.branch_count ?? 1) >= 3) money += 10
  const money_potential_score = clamp(money)

  // Urgency
  let urgency = 25
  if (evidence.has_ads_signal) { urgency += 35; qualReasons.push('Aktif reklam harcıyor') }
  if (['health_clinic', 'real_estate', 'automotive'].includes(profile.id)) urgency += 15
  if ((lead.review_count ?? 999) < 10) urgency += 10
  if (evidence.instagram_as_site) urgency += 10
  const urgency_score = clamp(urgency)

  // Confidence
  let conf = 20
  if (lead.website) conf += 20
  if (lead.rating !== null && lead.rating !== undefined) conf += 20
  if ((lead.review_count ?? 0) > 0) conf += 20
  if (lead.phone) conf += 20
  const confidence_score = clamp(conf)

  // Weighted quality score
  const quality_score = clamp(
    pain_intensity_score  * 0.28 +
    agency_fit_score      * 0.22 +
    money_potential_score * 0.20 +
    contactability_score  * 0.18 +
    urgency_score         * 0.12
  )

  // Conversion probability
  let conv = quality_score
  if (!lead.phone) conv = 0
  if (disqualReason) conv = Math.min(conv, 10)
  if (evidence.has_whatsapp) conv = clamp(conv + 8)
  if (profile.wave === 1) conv = clamp(conv + 5)
  const conversion_probability = clamp(conv)

  // A-Tier strict conditions — must have at least 1 verified pain
  const hasATierDigitalProblem =
    (!evidence.has_real_website || evidence.instagram_as_site) ||
    (!!evidence.is_slow_or_dead) ||
    ((lead.rating !== null && lead.rating !== undefined && lead.rating < 4.2) || (lead.review_count !== undefined && lead.review_count < 15)) ||
    ((!evidence.is_slow_or_dead) && (!evidence.has_online_booking || !evidence.has_form)) ||
    ((!evidence.is_slow_or_dead) && (!evidence.has_whatsapp)) ||
    (!!evidence.has_ads_signal)

  const isATierEligible =
    !!lead.phone &&
    !!lead.google_place_id &&
    !disqualReason &&
    profile.wave <= 2 &&
    hasATierDigitalProblem

  // Tier + label
  let lead_tier: LeadTier
  let quality_label: QualityLabel
  if (disqualReason) {
    lead_tier = 'D'; quality_label = 'Ele'
  } else if (quality_score >= 85 && isATierEligible) {
    lead_tier = 'A'; quality_label = 'Nokta Atışı'
  } else if (quality_score >= 70 && isATierEligible) {
    lead_tier = 'A'; quality_label = 'Çok Güçlü'
  } else if (quality_score >= 55) {
    lead_tier = 'B'; quality_label = 'Takip Edilebilir'
  } else if (quality_score >= 40) {
    lead_tier = 'C'; quality_label = 'Zayıf'
  } else {
    lead_tier = 'D'; quality_label = 'Ele'
  }

  // Next action — only A-tier gets call_now; B-tier gets send_audit/warm_up
  let next_action_priority: NextActionPriority
  if (disqualReason) {
    next_action_priority = 'discard'
  } else if (lead_tier === 'A' && lead.phone) {
    next_action_priority = 'call_now'
  } else if (lead_tier === 'B') {
    next_action_priority = 'send_audit'
  } else if (quality_score >= 40) {
    next_action_priority = 'warm_up'
  } else {
    next_action_priority = 'wait'
  }

  // Best channel
  const best_channel: BestChannel = evidence.has_whatsapp ? 'whatsapp' : lead.phone ? 'phone' : 'unknown'

  // Offer values
  const offerRef = SECTOR_OFFER_VALUES[profile.id] ?? { setup: 7000, monthly: 9000 }
  const expected_offer_value_tl = offerRef.setup
  const expected_monthly_value_tl = offerRef.monthly

  // Conversion angle
  const mainPain = !evidence.has_real_website || evidence.instagram_as_site
    ? 'dijital varlık eksikliği'
    : !evidence.has_whatsapp ? 'WhatsApp kanalı yokluğu'
    : !evidence.has_online_booking && profile.id === 'health_clinic' ? 'randevu sistemi eksikliği'
    : (lead.rating ?? 5) < 4.0 ? 'düşük Google puanı'
    : 'müşteri dönüşüm altyapısı boşluğu'

  const conversion_angle = `${profile.displayName} için ${mainPain} — AI ile hızlı ROI`

  const topReasons = qualReasons.slice(0, 3).join(', ')

  let roiConnection = ""
  if (!evidence.has_real_website || evidence.instagram_as_site) {
    roiConnection = "Web sitesi olmaması, Google aramalarından gelen yüksek değerli müşterileri doğrudan rakiplere kaybettiriyor ve markanın dijital güvenini sarsıyor."
  } else if (!evidence.has_online_booking && ['health_clinic', 'beauty'].includes(profile.id)) {
    roiConnection = "Online randevu sisteminin bulunmaması, mesai saatleri dışındaki (tüm randevuların %35'i) yüksek bütçeli müşteri rezervasyonlarının kaçırılmasına yol açıyor."
  } else if (!evidence.has_whatsapp) {
    roiConnection = "WhatsApp hızlı iletişim hattının bulunmaması, mobil ziyaretçilerin anlık sorularını siparişe dönüştürmesini engelleyerek satış dönüşümünü %40 düşürüyor."
  } else if (evidence.has_ads_signal) {
    roiConnection = "Aktif reklam harcaması yapılmasına rağmen dönüşüm altyapısının zayıf olması, bütçenin boşa harcanmasına ve müşteri edinim maliyetinin (CAC) çok yüksek kalmasına neden oluyor."
  } else if ((lead.rating ?? 5) < 4.2) {
    roiConnection = "Google puanının 4.2'nin altında olması, potansiyel müşterilerin güvenini sarsarak dönüşüm oranlarını %50'ye varan oranda düşürüyor."
  } else if ((lead.review_count ?? 0) < 15) {
    roiConnection = "Sosyal kanıt (Google yorumları) eksikliği, yeni müşterilerin güvenini kazanmayı zorlaştırıyor ve marka itibarını kısıtlıyor."
  } else {
    roiConnection = "Müşteri edinme potansiyeli yüksek bir sektörel yapıda olmasına rağmen dijital dönüşüm altyapısının geliştirilmesi gerekiyor."
  }

  const why_this_will_convert = topReasons
    ? `${lead.business_name ?? 'Bu işletme'}, ${topReasons} nedeniyle yüksek potansiyel taşıyor. ${roiConnection} AI entegrasyonu sayesinde bu eksikler giderildiğinde, doğrudan ciro artışı sağlanacaktır.`
    : `${profile.displayName} sektöründe ajans hizmetine açık bir işletme.`

  const first_30_seconds_pitch = buildPitch(lead, evidence, profile.displayName, mainPain)
  const objection_risks = buildObjectionRisks(lead, evidence, profile.ticketBand, profile.wave)
  const normalized_sector = profile.id !== 'other' ? profile.displayName : (lead.sector ?? '')

  return {
    quality_score, conversion_probability, money_potential_score,
    urgency_score, pain_intensity_score, contactability_score,
    agency_fit_score, confidence_score, lead_tier, quality_label,
    disqualification_reason: disqualReason, qualification_reasons: qualReasons,
    conversion_angle, why_this_will_convert, expected_offer_value_tl,
    expected_monthly_value_tl, best_channel, first_30_seconds_pitch,
    objection_risks, next_action_priority, normalized_sector,
  }
}

function buildPitch(
  lead: Partial<Lead>,
  evidence: EvidenceSignals,
  sectorName: string,
  mainPain: string,
): string {
  const name = lead.business_name ?? 'Merhaba'
  if (!evidence.has_real_website || evidence.instagram_as_site)
    return `${name}, merhaba — dijital varlığınız henüz çok sınırlı, sadece Instagram var. Biz ${sectorName} için web sitesi ve müşteri hattı kuruyoruz. 5 dakikanız var mı?`
  if (!evidence.has_whatsapp)
    return `${name}, merhaba — WhatsApp hattınız aktif değil. Müşteriler mesaj atıp dönüş alamıyor. Biz bunu 1 haftada çözüyoruz. 5 dakika konuşabilir miyiz?`
  if (!evidence.has_online_booking)
    return `${name}, merhaba — online randevu sisteminiz yok. Arayanlar kapanmış sanıp rakibe geçiyor. ${sectorName} için randevu otomasyonu kuruyoruz. Değerlendirme yapabilir miyim?`
  if ((lead.rating ?? 5) < 4.0)
    return `${name}, merhaba — Google puanınız ${lead.rating}. Bu müşterileri doğrudan etkiliyor. Yorum yönetimi sistemleri kuruyoruz. 5 dakika var mı?`
  return `${name}, merhaba — ${mainPain} konusunda çözümümüz var. ${sectorName} sektörüne özel, hızlı uygulama. Görüşebilir miyiz?`
}

function buildObjectionRisks(
  lead: Partial<Lead>,
  evidence: EvidenceSignals,
  ticketBand: string,
  wave: number,
): string[] {
  const risks: string[] = []
  if (wave >= 2) risks.push('"Bütçemiz yok" — orta bütçeli sektör')
  if ((lead.review_count ?? 0) < 5) risks.push('Az yorum — güven kurmak zorlaşabilir')
  if (evidence.is_slow_or_dead) risks.push('Web sitesi sorunlu — teknik itiraz olabilir')
  if (ticketBand === 'low') risks.push('"Çok pahalı" itirazı — düşük bilet sektörü')
  if (!lead.phone && !evidence.has_whatsapp) risks.push('Ulaşım zor — kanal yok')
  return risks
}

export function qualityScoreLabel(score: number): { label: QualityLabel; color: string } {
  if (score >= 85) return { label: 'Nokta Atışı', color: '#1D9E75' }
  if (score >= 70) return { label: 'Çok Güçlü', color: '#16A34A' }
  if (score >= 55) return { label: 'Takip Edilebilir', color: '#BA7517' }
  if (score >= 40) return { label: 'Zayıf', color: '#E8440A' }
  return { label: 'Ele', color: '#6B7280' }
}
