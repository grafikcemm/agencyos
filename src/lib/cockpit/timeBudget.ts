// ─────────────────────────────────────────────────────────────────────────────
// 30 DAKİKALIK kokpit zaman bütçesi (FINAL PILOT BLOCKERS Faz 7).
//
// Kullanıcı seçilebilir bir zaman bütçesi verir; hazır aksiyonlar DEĞER/SÜRE
// oranıyla sıralanır; bütçeyi aşanlar BACKLOG'a taşınır (sessiz kesme YOK —
// backlog görünür). Saf/deterministik: I/O yok.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_BUDGET_MIN = 30
export const BUDGET_OPTIONS_MIN = [15, 30, 45, 60] as const

export type ActionKind = 'call' | 'approve_send' | 'send' | 'followup' | 'proposal_decision' | 'reconcile'

/** Aksiyon başına tahmini süre (dk) — kaba ama tutarlı. */
export const ACTION_MINUTES: Record<ActionKind, number> = {
  call: 5,
  approve_send: 1,
  send: 1,
  followup: 3,
  proposal_decision: 2,
  reconcile: 2,
}

/** Aksiyon başına değer ağırlığı — yüksek = önce (kapanmaya yakınlık + gelir etkisi). */
export const ACTION_VALUE: Record<ActionKind, number> = {
  proposal_decision: 10, // teklif kararı = gelire en yakın
  send: 8,
  approve_send: 7,
  call: 6,
  followup: 4,
  reconcile: 3,
}

export interface BudgetAction {
  id: string
  kind: ActionKind
  label: string
  /** Kokpitte ilgili satıra tek tıkla gitmek için data-testid hedefi. */
  targetTestId?: string
  /** Opsiyonel ek değer (ör. hot lead / yüksek skor) — temel değere eklenir. */
  valueBoost?: number
}

export interface ScoredAction extends BudgetAction {
  minutes: number
  value: number
  /** değer/süre oranı — sıralama anahtarı. */
  ratio: number
}

export interface ActionPlan {
  budgetMin: number
  /** Bütçeye sığan, değer/süre oranıyla sıralı aksiyonlar. */
  planned: ScoredAction[]
  /** Bütçeyi aşan (görünür) backlog. */
  backlog: ScoredAction[]
  plannedMinutes: number
}

function score(a: BudgetAction): ScoredAction {
  const minutes = ACTION_MINUTES[a.kind]
  const value = ACTION_VALUE[a.kind] + (a.valueBoost ?? 0)
  return { ...a, minutes, value, ratio: value / minutes }
}

/**
 * Aksiyonları değer/süre oranıyla sırala, bütçeye greedy doldur, aşanları
 * backlog'a taşı. Eşit oranda: daha KISA süre önce (daha çok iş sığar).
 */
export function planTimeBudget(actions: BudgetAction[], budgetMin: number = DEFAULT_BUDGET_MIN): ActionPlan {
  const scored = actions
    .map(score)
    .sort((a, b) => (b.ratio !== a.ratio ? b.ratio - a.ratio : a.minutes - b.minutes))
  const planned: ScoredAction[] = []
  const backlog: ScoredAction[] = []
  let used = 0
  for (const a of scored) {
    if (used + a.minutes <= budgetMin) {
      planned.push(a)
      used += a.minutes
    } else {
      backlog.push(a)
    }
  }
  return { budgetMin, planned, backlog, plannedMinutes: used }
}
