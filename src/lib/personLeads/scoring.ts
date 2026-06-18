// Kişi-lead skorlama — leads V3'ten bağımsız, kişi/pozisyon bağlamına özel.
//
// Üç alt-skor (ekran görüntüsündeki CSV'nin Kolaylık/Market/Kazanç mantığı):
//   difficulty_score  → erişim/ikna zorluğu (YÜKSEK = daha zor)
//   market_score      → pazar/segment çekiciliği (sektör önceliği + amaç)
//   earning_score     → kazanç potansiyeli (şirket büyüklüğü + karar gücü)
// Kompozit: kazanç ve market yukarı, zorluk aşağı çeker.

import type { ApolloPerson } from './types'
import type { ApolloPreset } from './presets'

export interface PersonScoreResult {
  difficulty_score: number
  market_score: number
  earning_score: number
  person_score: number
  person_tier: 'A' | 'B' | 'C' | 'D'
  expected_monthly_value_tl: number
  why_now: string
  next_action: string
}

// Apollo seniority → karar gücü (0-100).
const SENIORITY_POWER: Record<string, number> = {
  owner: 95,
  founder: 95,
  c_suite: 90,
  partner: 85,
  vp: 75,
  head: 70,
  director: 65,
  manager: 50,
  senior: 35,
  entry: 15,
  intern: 5,
}

// Şirket çalışan sayısı → bütçe bandı (kişi seviyesinde değer tahmini için).
function employeeBucket(companySize: string | null): 'micro' | 'small' | 'mid' | 'large' {
  const n = parseInt((companySize ?? '').replace(/\D/g, ''), 10)
  if (!Number.isFinite(n) || n <= 0) return 'small'
  if (n <= 10) return 'micro'
  if (n <= 50) return 'small'
  if (n <= 200) return 'mid'
  return 'large'
}

// Ajans retainer tahmini (aylık ₺) — bütçe bandı × sektör bileti.
const MONTHLY_VALUE_BY_BUCKET: Record<string, number> = {
  micro: 8000,
  small: 14000,
  mid: 22000,
  large: 32000,
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function scorePersonLead(person: ApolloPerson, preset: ApolloPreset): PersonScoreResult {
  const seniority = (person.seniority ?? '').toLowerCase()
  const power = SENIORITY_POWER[seniority] ?? 40
  const bucket = employeeBucket(person.company_size)

  // ── earning: karar gücü + bütçe bandı ──
  const bucketEarning = { micro: 30, small: 55, mid: 75, large: 88 }[bucket]
  const earning_score = clamp(power * 0.5 + bucketEarning * 0.5)

  // ── market: pazar/segment çekiciliği. Bütçeli (orta/büyük) segment + karar gücü ──
  const bucketMarket = { micro: 55, small: 65, mid: 80, large: 85 }[bucket]
  const market_score = clamp(bucketMarket + (power >= 80 ? 8 : 0))

  // ── difficulty: küçük şirkette sahip/kurucu = kolay erişim; büyük kurumsal C-suite = zor ──
  const sizeFriction = { micro: 10, small: 20, mid: 45, large: 70 }[bucket]
  const emailKnown = !!person.email
  const difficulty_score = clamp(sizeFriction + (power > 80 && bucket === 'large' ? 15 : 0) - (emailKnown ? 10 : 0))

  // ── kompozit ──
  const person_score = clamp(earning_score * 0.45 + market_score * 0.35 + (100 - difficulty_score) * 0.2)

  const person_tier: PersonScoreResult['person_tier'] =
    person_score >= 75 ? 'A' : person_score >= 60 ? 'B' : person_score >= 45 ? 'C' : 'D'

  // İş başvurusu kişilerinde gelir tahmini anlamsız → 0.
  const expected_monthly_value_tl =
    preset.purpose === 'b2b_sell' ? MONTHLY_VALUE_BY_BUCKET[bucket] : 0

  const company = person.company_name ?? 'şirket'
  const why_now =
    preset.purpose === 'b2b_sell'
      ? `${person.title ?? 'Karar verici'} — ${company}. ${bucket === 'micro' || bucket === 'small' ? 'Küçük ekip, karar vericiye doğrudan erişim.' : 'Bütçeli orta/büyük işletme.'}`
      : `${company} ${person.title ?? 'işe alım'} — ajans/kreatif pozisyon hedefi.`

  const next_action =
    person_tier === 'A'
      ? emailKnown ? 'Bugün kişisel e-posta gönder' : 'LinkedIn üzerinden bağlan + email aç'
      : person_tier === 'B'
        ? 'Kısa değer mesajı + takip'
        : 'Havuzda beklet / zenginleştir'

  return {
    difficulty_score,
    market_score,
    earning_score,
    person_score,
    person_tier,
    expected_monthly_value_tl,
    why_now,
    next_action,
  }
}
