'use client'

// 30 DAKİKALIK kokpit zaman bütçesi (Faz 7) — client: seçilebilir bütçe →
// değer/süre sıralı plan + backlog (görünür). Saf planTimeBudget kullanır.

import { useState } from 'react'
import { Timer } from 'lucide-react'
import { planTimeBudget, BUDGET_OPTIONS_MIN, DEFAULT_BUDGET_MIN, type BudgetAction } from '@/lib/cockpit/timeBudget'

export function TimeBudgetPlanner({ actions }: { actions: BudgetAction[] }) {
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET_MIN)
  const plan = planTimeBudget(actions, budget)

  function goTo(action: BudgetAction) {
    if (!action.targetTestId) return
    const target = document.querySelector<HTMLElement>(`[data-testid="${action.targetTestId}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target?.focus({ preventScroll: true })
  }

  return (
    <section
      data-testid="time-budget"
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 mb-5"
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Timer className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-[12px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">Zaman Bütçesi</h2>
        <div className="flex gap-1 ml-auto">
          {BUDGET_OPTIONS_MIN.map((m) => (
            <button
              key={m}
              onClick={() => setBudget(m)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                budget === m
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
              }`}
            >
              {m} dk
            </button>
          ))}
        </div>
      </div>

      {actions.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">Şu an hazır aksiyon yok — gece enrichment sonrası dolar.</p>
      ) : (
        <>
          <p className="text-[11px] text-[var(--text-muted)] mb-2">
            {budget} dk için {plan.planned.length} aksiyon (~{plan.plannedMinutes} dk), değer/süre sıralı.
            {plan.backlog.length > 0 && ` ${plan.backlog.length} aksiyon backlog'a taşındı.`}
          </p>
          <ol className="space-y-1.5">
            {plan.planned.map((a, i) => (
              <li key={a.id} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span className="text-[var(--accent)] font-bold w-5">{i + 1}.</span>
                <button
                  type="button"
                  onClick={() => goTo(a)}
                  disabled={!a.targetTestId}
                  className="truncate flex-1 text-left hover:text-[var(--accent)] disabled:hover:text-inherit"
                >
                  {a.label}
                </button>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">~{a.minutes} dk</span>
              </li>
            ))}
          </ol>
          {plan.backlog.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-[var(--text-muted)] cursor-pointer">Backlog ({plan.backlog.length}) — bugünkü bütçeye sığmadı</summary>
              <ol className="mt-1.5 space-y-1 pl-2">
                {plan.backlog.map((a) => (
                  <li key={a.id} className="text-[11px] text-[var(--text-muted)] truncate">{a.label} (~{a.minutes} dk)</li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  )
}
