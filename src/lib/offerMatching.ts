// Offer Match Engine — bir lead için 1-3 hizmet öner.
// Sektör profili, lead'in dijital sinyalleri ve hizmet uyumuna göre puanlar.

import { Lead, RecommendedOffer, Offer } from './types'
import { findOfferById } from './offers'
import { matchSectorProfile } from './sectorPriority'

interface ScoredOffer {
  offer: Offer
  score: number
  reasons: string[]
}

function scoreOfferForLead(offer: Offer, lead: Partial<Lead>, sectorId: string): ScoredOffer {
  let score = 0
  const reasons: string[] = []

  if (offer.targetSectors.includes(sectorId)) {
    score += 40
    reasons.push('Sektör hedeflemesinde bu sektör var')
  }

  if (offer.id === 'ai_lead_response' && (lead.has_whatsapp || lead.has_form || lead.has_ads_signal)) {
    score += 20
    reasons.push('Aktif kanallara sahip — hızlı dönüş yüksek değer üretir')
  }
  if (offer.id === 'review_engine' && (lead.review_count ?? 0) < 50) {
    score += 15
    reasons.push('Düşük yorum sayısı — review engine için ideal')
  }
  if (offer.id === 'review_engine' && lead.rating !== null && lead.rating !== undefined && lead.rating < 4.3) {
    score += 10
    reasons.push('Orta puan iyileştirme fırsatı')
  }
  if (offer.id === 'old_customer_reactivation' && (lead.branch_count ?? 1) >= 2) {
    score += 10
    reasons.push('Çok şubeli — eski müşteri havuzu büyük')
  }
  if (offer.id === 'ai_creative_lab' && lead.has_ads_signal) {
    score += 25
    reasons.push('Aktif reklam — kreatif optimizasyonu doğrudan ROAS\'a yansır')
  }
  if (offer.id === 'website' && lead.has_website === false) {
    score += 30
    reasons.push('Web sitesi yok — temel ihtiyaç')
  }
  if (offer.id === 'website' && lead.has_website === true) {
    score -= 30
  }
  if (offer.id === 'whatsapp_sales_assistant' && lead.has_whatsapp) {
    score += 15
    reasons.push('Aktif WhatsApp kanalı')
  }
  if (offer.id === 'appointment_recovery' && (lead.has_online_booking || lead.has_form)) {
    score += 12
    reasons.push('Randevu kanalı mevcut')
  }

  const profile = matchSectorProfile(lead.sector)
  if (profile.wave === 1 && offer.category === 'revenue') score += 5
  if (profile.wave === 2 && offer.category === 'operations') score += 5

  return { offer, score, reasons }
}

function annualValue(offer: Offer): number {
  return offer.setupPrice + offer.monthlyPrice * 12
}

function buildFirstMessage(offer: Offer, lead: Partial<Lead>): string {
  const name = lead.business_name || 'Merhaba'
  const sectorProfile = matchSectorProfile(lead.sector)

  switch (offer.id) {
    case 'ai_lead_response':
      return `Merhaba ${name}, reklamdan veya WhatsApp'tan gelen müşteri adaylarınız 5-10 dakika içinde dönüş alamazsa rakibe kayabiliyor. Mevcut akışınızı 5 dakikalık küçük bir analiz ile çıkarıp net bir iyileştirme önerisi verebiliriz.`
    case 'old_patient_reactivation':
    case 'old_customer_reactivation':
      return `${name}, geçmiş ${sectorProfile.id === 'health_clinic' ? 'hasta' : 'müşteri'} listenizdeki kişiler doğru zamanlama ve doğru teklifle ciddi gelir üretebiliyor. 30 günlük bir canlandırma kampanyasıyla nasıl çalıştığını gösterebilirim.`
    case 'review_engine':
      return `${name}, Google yorumları ${sectorProfile.id === 'health_clinic' ? 'klinikler' : 'işletmeler'} için ciddi güven ve dönüşüm farkı yaratıyor. Otomatik bir yorum toplama sistemi ile 90 günde yorum sayınızı 3 katına çıkarmak mümkün — kısa bir örnek paylaşayım mı?`
    case 'ai_creative_lab':
      return `${name}, reklam bütçesi harcanıyor ama kazanan kreatifleri sistematik takip etmek zor oluyor. AI destekli kreatif test ve kazanan raporu ile bunu ölçülebilir hale getirebiliriz.`
    case 'renewal_engine':
      return `${name}, poliçe yenileme tarihleri yaklaştığında müşterinin unutulması ciddi gelir kaybı yaratabiliyor. Yenileme + hatırlatma + çapraz satışı otomatikleştiren bir sistemle yenileme oranınızı %20-30 yukarı çekebiliriz.`
    case 'appointment_recovery':
      return `${name}, randevuya gelmeyen müşteri/hasta hem zaman hem gelir kaybı. Otomatik hatırlatma + yeniden randevulandırma akışı ile no-show oranınızı yarıya indirebiliriz.`
    case 'document_automation':
      return `${name}, belge işleme operasyonel yükünüzü ciddi kısıyor. Mevcut akışınız üzerinden 1-2 örnek belge tipiyle pilot yapabiliriz.`
    default:
      return `${name}, ${offer.salesPromise}`
  }
}

function buildSalesAngle(offer: Offer, lead: Partial<Lead>): string {
  const profile = matchSectorProfile(lead.sector)
  return `${profile.displayName} için: ${offer.salesPromise}`
}

export function recommendOffersForLead(lead: Partial<Lead>, max: number = 3): RecommendedOffer[] {
  const profile = matchSectorProfile(lead.sector)
  const seen = new Set<string>()
  const candidates: Offer[] = []

  for (const id of profile.recommendedOfferIds) {
    const o = findOfferById(id)
    if (o && !seen.has(o.id)) {
      candidates.push(o)
      seen.add(o.id)
    }
  }
  if (lead.has_website === false) {
    const website = findOfferById('website')
    if (website && !seen.has('website')) { candidates.push(website); seen.add('website') }
  }
  if (lead.has_ads_signal) {
    const adsOpt = findOfferById('ads_optimization')
    if (adsOpt && !seen.has('ads_optimization')) { candidates.push(adsOpt); seen.add('ads_optimization') }
  }

  const scored = candidates.map(o => scoreOfferForLead(o, lead, profile.id))
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, max).map<RecommendedOffer>(({ offer, reasons }) => ({
    offerId: offer.id,
    offerName: offer.name,
    reason: reasons.length ? reasons.join(' · ') : `${profile.displayName} için uygun hizmet`,
    setupPrice: offer.setupPrice,
    monthlyPrice: offer.monthlyPrice,
    annualValue: annualValue(offer),
    difficulty: offer.difficulty,
    salesAngle: buildSalesAngle(offer, lead),
    firstMessage: buildFirstMessage(offer, lead),
    antiPattern: offer.antiPatterns[0],
  }))
}

// Build a single RecommendedOffer from an offer id (used to reconcile DB offer with UI)
export function buildRecommendedOffer(offerId: string, lead: Partial<Lead>): RecommendedOffer | undefined {
  const offer = findOfferById(offerId)
  if (!offer) return undefined
  const profile = matchSectorProfile(lead.sector)
  const { reasons } = scoreOfferForLead(offer, lead, profile.id)
  return {
    offerId: offer.id,
    offerName: offer.name,
    reason: reasons.length ? reasons.join(' · ') : `${profile.displayName} için uygun hizmet`,
    setupPrice: offer.setupPrice,
    monthlyPrice: offer.monthlyPrice,
    annualValue: annualValue(offer),
    difficulty: offer.difficulty,
    salesAngle: buildSalesAngle(offer, lead),
    firstMessage: buildFirstMessage(offer, lead),
    antiPattern: offer.antiPatterns[0],
  }
}

// Reconcile: ensure the DB-selected offer is the primary (first) recommendation.
export function reconcileOffers(
  recommended: RecommendedOffer[],
  preferredOfferId: string | null | undefined,
  lead: Partial<Lead>,
): RecommendedOffer[] {
  if (!preferredOfferId) return recommended
  const existing = recommended.find(o => o.offerId === preferredOfferId)
  if (existing) {
    return [existing, ...recommended.filter(o => o.offerId !== preferredOfferId)]
  }
  const built = buildRecommendedOffer(preferredOfferId, lead)
  if (!built) return recommended
  return [built, ...recommended.filter(o => o.offerId !== preferredOfferId)].slice(0, 3)
}

export function estimateLeadValue(lead: Partial<Lead>): { setup: number; monthly: number; annual: number } {
  const offers = recommendOffersForLead(lead, 3)
  const setup = offers.reduce((s, o) => s + o.setupPrice, 0)
  const monthly = offers.reduce((s, o) => s + o.monthlyPrice, 0)
  return { setup, monthly, annual: setup + monthly * 12 }
}
