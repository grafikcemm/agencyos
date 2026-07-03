// Günlük seçim algoritması — "Bugünün 2 Fırsatı".
// 1) SERT TABAN (asla baypas edilmez): ≥2 doğrulanmış kanıt + max(design,ai) ≥ 70
//    + bilinen iletişim kanalı. Tabanı geçemeyen aday bonus GÖREMEDEN elenir.
// 2) Baz sıra: Chair'in ana hizmet eşleşme skoru.
// 3) 7-gün Tasarım/AI denge YUMUŞAK bonusu (çarpan tavanı 1.15): yalnız baş-başa
//    yarışları çevirir; zayıf aday kotaya GİREMEZ (taban zaten koştu).
// 4) İlk 2. Tabanı geçen <2 ise eksik döner — kota asla zorla doldurulmaz.

export const SELECTION_MIN_VERIFIED_EVIDENCE = 2
export const SELECTION_MIN_SERVICE_SCORE = 70
export const BALANCE_BONUS_CAP = 1.15
export const BALANCE_BONUS_STEP = 0.05
export const DAILY_OPPORTUNITY_TARGET = 2

export interface SelectionCandidate {
  key: string // place_id veya lead id
  businessName: string
  designScore: number
  aiScore: number
  verifiedEvidenceCount: number
  hasContactChannel: boolean // phone || found_email || has_whatsapp
  primaryDomain: 'tasarim' | 'ai_otomasyon' | 'hibrit'
  primaryMatchScore: number // Chair'in ana hizmet eşleşme skoru
  chairDecision: 'opportunity' | 'reject'
}

export interface DomainHistory {
  // Son 7 günde selected=true assessment'ların domain sayıları (hibrit her iki tarafa 0.5).
  designCount: number
  aiCount: number
}

export interface SelectionResult {
  selected: SelectionCandidate[]
  rejected: Array<{ candidate: SelectionCandidate; reason: string }>
  balanceApplied: { favoredDomain: 'tasarim' | 'ai_otomasyon' | null; multiplier: number }
}

export function passesHardFloor(c: SelectionCandidate): { pass: boolean; reason?: string } {
  if (c.chairDecision !== 'opportunity') return { pass: false, reason: 'Konsey kararı: reject' }
  if (c.verifiedEvidenceCount < SELECTION_MIN_VERIFIED_EVIDENCE) {
    return { pass: false, reason: `Doğrulanmış kanıt yetersiz (${c.verifiedEvidenceCount}/${SELECTION_MIN_VERIFIED_EVIDENCE})` }
  }
  if (Math.max(c.designScore, c.aiScore) < SELECTION_MIN_SERVICE_SCORE) {
    return { pass: false, reason: `Hizmet skoru tabanın altında (max ${Math.max(c.designScore, c.aiScore)} < ${SELECTION_MIN_SERVICE_SCORE})` }
  }
  if (!c.hasContactChannel) return { pass: false, reason: 'Bilinen iletişim kanalı yok' }
  return { pass: true }
}

export function computeBalanceMultiplier(history: DomainHistory): {
  favoredDomain: 'tasarim' | 'ai_otomasyon' | null
  multiplier: number
} {
  const deficit = Math.abs(history.designCount - history.aiCount)
  if (deficit === 0) return { favoredDomain: null, multiplier: 1 }
  const favoredDomain = history.designCount < history.aiCount ? 'tasarim' : 'ai_otomasyon'
  const multiplier = Math.min(BALANCE_BONUS_CAP, 1 + BALANCE_BONUS_STEP * deficit)
  return { favoredDomain, multiplier }
}

export function selectDailyOpportunities(
  candidates: SelectionCandidate[],
  history: DomainHistory,
  target: number = DAILY_OPPORTUNITY_TARGET
): SelectionResult {
  const rejected: SelectionResult['rejected'] = []
  const eligible: SelectionCandidate[] = []

  // 1) Sert taban ÖNCE — bonus zayıf adayı kurtaramaz.
  for (const c of candidates) {
    const floor = passesHardFloor(c)
    if (floor.pass) eligible.push(c)
    else rejected.push({ candidate: c, reason: floor.reason! })
  }

  // 2+3) Baz skor × denge çarpanı (yalnız az temsil edilen domain'e, tavan 1.15).
  const balance = computeBalanceMultiplier(history)
  const ranked = eligible
    .map((c) => {
      const applies = balance.favoredDomain !== null && c.primaryDomain === balance.favoredDomain
      return { c, effective: c.primaryMatchScore * (applies ? balance.multiplier : 1) }
    })
    .sort((a, b) => b.effective - a.effective)

  // 4) İlk `target`; eksikse eksik döner.
  const selected = ranked.slice(0, target).map((r) => r.c)
  for (const r of ranked.slice(target)) {
    rejected.push({ candidate: r.c, reason: 'Günlük kota doldu (daha güçlü adaylar seçildi)' })
  }

  return { selected, rejected, balanceApplied: balance }
}
