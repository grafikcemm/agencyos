import { describe, it, expect } from 'vitest'
import {
  planTimeBudget,
  DEFAULT_BUDGET_MIN,
  ACTION_MINUTES,
  type BudgetAction,
} from './timeBudget'

// Faz 7 — 30dk bütçe: değer/süre sıralama + bütçe aşımı BACKLOG (sessiz kesme yok).

function act(id: string, kind: BudgetAction['kind'], valueBoost = 0): BudgetAction {
  return { id, kind, label: id, valueBoost }
}

describe('planTimeBudget', () => {
  it('değer/süre oranıyla sıralar; bütçeye sığar; aşan backlog’a gider', () => {
    // proposal_decision (10/2=5) > send (8/1=8?) — aslında send ratio 8 > proposal 5.
    const actions = [act('call', 'call'), act('send', 'send'), act('followup', 'followup')]
    const plan = planTimeBudget(actions, DEFAULT_BUDGET_MIN)
    // send ratio 8 en yüksek → ilk.
    expect(plan.planned[0].id).toBe('send')
    expect(plan.plannedMinutes).toBeLessThanOrEqual(DEFAULT_BUDGET_MIN)
    expect(plan.backlog).toHaveLength(0) // hepsi sığar
  })

  it('bütçe aşımı → fazlası backlog (görünür, sessiz kesme yok)', () => {
    // 15 dk bütçe; her call 5 dk → en çok 3 call sığar.
    const actions = Array.from({ length: 6 }, (_, i) => act(`call-${i}`, 'call'))
    const plan = planTimeBudget(actions, 15)
    expect(plan.planned).toHaveLength(3)
    expect(plan.backlog).toHaveLength(3)
    expect(plan.plannedMinutes).toBe(15)
  })

  it('eşit oranda daha KISA süre önce (daha çok iş sığar)', () => {
    // İki aksiyon aynı ratio: approve_send (7/1=7) vs ... yapay eşitlik boost'la.
    const a = act('a', 'send') // 8/1 = 8
    const b = { id: 'b', kind: 'call' as const, label: 'b', valueBoost: 34 } // (6+34)/5 = 8, ama 5 dk
    const plan = planTimeBudget([b, a], 30)
    // Aynı ratio 8 → daha kısa süre (send, 1dk) önce.
    expect(plan.planned[0].id).toBe('a')
  })

  it('boş liste → boş plan', () => {
    const plan = planTimeBudget([], 30)
    expect(plan.planned).toHaveLength(0)
    expect(plan.backlog).toHaveLength(0)
    expect(plan.plannedMinutes).toBe(0)
  })

  it('valueBoost değeri artırır (hot lead önceliklenir)', () => {
    const normal = act('n', 'followup')
    const hot = act('h', 'followup', 20)
    const plan = planTimeBudget([normal, hot], 30)
    expect(plan.planned[0].id).toBe('h') // boost'lu önce
  })

  it('süre haritası tüm kind’ler için tanımlı', () => {
    for (const k of Object.keys(ACTION_MINUTES)) {
      expect(ACTION_MINUTES[k as keyof typeof ACTION_MINUTES]).toBeGreaterThan(0)
    }
  })
})
