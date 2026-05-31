// Lead Scoring v2 — 8 alt skor, ağırlıklı toplam, kategorize edilmiş gerekçeler.
//
// Ağırlıklar (toplam 1.00):
//   sectorFit         0.20
//   budgetPotential   0.18
//   painIntensity     0.18
//   digitalMaturity   0.12
//   offerFit          0.15
//   urgency           0.07
//   accessibility     0.05
//   trustSignals      0.05

import {
  Lead,
  LeadScoreBreakdown,
  Priority,
  ScoreReason,
} from './types'
import { matchSectorProfile } from './sectorPriority'

export interface ScoreResult {
  scores: LeadScoreBreakdown
  reasons: ScoreReason[]
  priority: Priority
}

const WEIGHTS = {
  sectorFit: 0.20,
  budgetPotential: 0.18,
  painIntensity: 0.18,
  digitalMaturity: 0.12,
  offerFit: 0.15,
  urgency: 0.07,
  accessibility: 0.05,
  trustSignals: 0.05,
} as const

type Signals = Partial<Lead>

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}

function scoreSectorFit(s: Signals, reasons: ScoreReason[]): number {
  const profile = matchSectorProfile(s.sector)
  reasons.push({
    label: `Sektör uyumu: ${profile.displayName} (öncelik ${profile.priority})`,
    delta: profile.priority,
    category: 'sectorFit',
  })
  return profile.priority
}

function scoreBudgetPotential(s: Signals, reasons: ScoreReason[]): number {
  const profile = matchSectorProfile(s.sector)
  const bandBase: Record<string, number> = { low: 25, mid: 50, high: 75, premium: 90 }
  const band = s.estimated_ticket_size || profile.ticketBand
  let score = bandBase[band] ?? 30
  reasons.push({
    label: `Tahmini bilet bandı: ${band} (+${score})`,
    delta: score,
    category: 'budgetPotential',
  })
  const branches = s.branch_count ?? 1
  if (branches >= 3) {
    score = clamp(score + 10)
    reasons.push({ label: 'Çok şubeli işletme (+10)', delta: 10, category: 'budgetPotential' })
  } else if (branches >= 2) {
    score = clamp(score + 5)
    reasons.push({ label: 'İki şube (+5)', delta: 5, category: 'budgetPotential' })
  }
  if (s.has_ecommerce) {
    score = clamp(score + 5)
    reasons.push({ label: 'Aktif e-ticaret (+5)', delta: 5, category: 'budgetPotential' })
  }
  return clamp(score)
}

function scorePainIntensity(s: Signals, reasons: ScoreReason[]): number {
  let score = 40
  if (s.rating !== null && s.rating !== undefined) {
    if (s.rating < 4.0) {
      score += 20
      reasons.push({ label: `Düşük puan (${s.rating}) → itibar yönetimi fırsatı (+20)`, delta: 20, category: 'painIntensity' })
    } else if (s.rating < 4.5) {
      score += 8
      reasons.push({ label: `Orta puan (${s.rating}) → review iyileştirme (+8)`, delta: 8, category: 'painIntensity' })
    }
  }
  if ((s.review_count ?? 0) < 20) {
    score += 12
    reasons.push({ label: 'Az yorum sayısı → sosyal kanıt zayıf (+12)', delta: 12, category: 'painIntensity' })
  }
  if (s.has_ads_signal) {
    score += 10
    reasons.push({ label: 'Aktif reklam → hızlı dönüş ihtiyacı (+10)', delta: 10, category: 'painIntensity' })
  }
  if (!s.has_whatsapp && !s.has_form) {
    score += 8
    reasons.push({ label: 'WhatsApp/form yok → lead kaçağı (+8)', delta: 8, category: 'painIntensity' })
  }
  return clamp(score)
}

function scoreDigitalMaturity(s: Signals, reasons: ScoreReason[]): number {
  let score = 20
  if (s.has_website) { score += 15; reasons.push({ label: 'Web sitesi var (+15)', delta: 15, category: 'digitalMaturity' }) }
  if (s.has_whatsapp) { score += 10; reasons.push({ label: 'WhatsApp kanalı (+10)', delta: 10, category: 'digitalMaturity' }) }
  if (s.has_form) { score += 8; reasons.push({ label: 'İletişim formu (+8)', delta: 8, category: 'digitalMaturity' }) }
  if (s.has_online_booking) { score += 12; reasons.push({ label: 'Online randevu sistemi (+12)', delta: 12, category: 'digitalMaturity' }) }
  if (s.has_ecommerce) { score += 15; reasons.push({ label: 'E-ticaret aktif (+15)', delta: 15, category: 'digitalMaturity' }) }
  if (s.has_ads_signal) { score += 10; reasons.push({ label: 'Reklam sinyali (+10)', delta: 10, category: 'digitalMaturity' }) }
  return clamp(score)
}

function scoreOfferFit(s: Signals, reasons: ScoreReason[]): number {
  const profile = matchSectorProfile(s.sector)
  const offerCount = profile.recommendedOfferIds.length
  let score: number
  if (profile.wave === 1) score = 85
  else if (profile.wave === 2) score = 65
  else score = 30
  score = clamp(score + (offerCount >= 4 ? 10 : offerCount >= 3 ? 5 : 0))
  reasons.push({
    label: `Hizmet eşleşmesi: ${offerCount} uygun hizmet (wave ${profile.wave})`,
    delta: score,
    category: 'offerFit',
  })
  return score
}

function scoreUrgency(s: Signals, reasons: ScoreReason[]): number {
  let score = 30
  if (s.has_ads_signal) {
    score += 30
    reasons.push({ label: 'Aktif reklam — para harcıyor (+30)', delta: 30, category: 'urgency' })
  }
  const profile = matchSectorProfile(s.sector)
  if (['health_clinic', 'real_estate', 'automotive'].includes(profile.id)) {
    score += 15
    reasons.push({ label: 'Hızlı lead dönüşü kritik sektör (+15)', delta: 15, category: 'urgency' })
  }
  return clamp(score)
}

function scoreAccessibility(s: Signals, reasons: ScoreReason[]): number {
  let score = 20
  if (s.phone) { score += 40; reasons.push({ label: 'Telefon mevcut (+40)', delta: 40, category: 'accessibility' }) }
  if (s.website) { score += 15; reasons.push({ label: 'Web sitesi mevcut (+15)', delta: 15, category: 'accessibility' }) }
  if (s.has_whatsapp) { score += 15; reasons.push({ label: 'WhatsApp ulaşılabilir (+15)', delta: 15, category: 'accessibility' }) }
  return clamp(score)
}

function scoreTrustSignals(s: Signals, reasons: ScoreReason[]): number {
  let score = 30
  const rc = s.review_count ?? 0
  if (rc >= 200) { score += 35; reasons.push({ label: `${rc} yorum — güçlü sosyal kanıt (+35)`, delta: 35, category: 'trustSignals' }) }
  else if (rc >= 80) { score += 20; reasons.push({ label: `${rc} yorum (+20)`, delta: 20, category: 'trustSignals' }) }
  else if (rc >= 30) { score += 10; reasons.push({ label: `${rc} yorum (+10)`, delta: 10, category: 'trustSignals' }) }
  if (s.rating !== null && s.rating !== undefined && s.rating >= 4.5) {
    score += 15
    reasons.push({ label: `Yüksek puan (${s.rating}) (+15)`, delta: 15, category: 'trustSignals' })
  }
  if ((s.branch_count ?? 1) >= 2) {
    score += 10
    reasons.push({ label: 'Birden fazla şube (+10)', delta: 10, category: 'trustSignals' })
  }
  return clamp(score)
}

export function calculateLeadScore(lead: Partial<Lead>): ScoreResult {
  const reasons: ScoreReason[] = []
  const sectorFit = scoreSectorFit(lead, reasons)
  const budgetPotential = scoreBudgetPotential(lead, reasons)
  const painIntensity = scorePainIntensity(lead, reasons)
  const digitalMaturity = scoreDigitalMaturity(lead, reasons)
  const offerFit = scoreOfferFit(lead, reasons)
  const urgency = scoreUrgency(lead, reasons)
  const accessibility = scoreAccessibility(lead, reasons)
  const trustSignals = scoreTrustSignals(lead, reasons)

  const total = Math.round(
    sectorFit * WEIGHTS.sectorFit +
    budgetPotential * WEIGHTS.budgetPotential +
    painIntensity * WEIGHTS.painIntensity +
    digitalMaturity * WEIGHTS.digitalMaturity +
    offerFit * WEIGHTS.offerFit +
    urgency * WEIGHTS.urgency +
    accessibility * WEIGHTS.accessibility +
    trustSignals * WEIGHTS.trustSignals
  )

  let priority: Priority = 'normal'
  if (total >= 80) priority = 'high'
  else if (total < 50) priority = 'low'

  return {
    scores: {
      sectorFit,
      budgetPotential,
      painIntensity,
      digitalMaturity,
      offerFit,
      urgency,
      accessibility,
      trustSignals,
      total,
    },
    reasons,
    priority,
  }
}

export function scoreBandLabel(total: number): { label: string; color: string } {
  if (total >= 80) return { label: 'YÜKSEK ÖNCELİK', color: '#1D9E75' }
  if (total >= 65) return { label: 'ORTA-YÜKSEK', color: '#BA7517' }
  if (total >= 50) return { label: 'DÜŞÜK ÖNCELİK', color: '#E8440A' }
  return { label: 'BEKLEME / UYGUN DEĞİL', color: '#6B7280' }
}
