import { Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_RULES } from './taskRules'

// Görev listesinin üstünde her zaman görünür "guardrail" kartı. Sürüklenme/dağılma
// anını yakalamak için değişmez ilkeleri gözün önünde tutar. Saf presentational —
// state yok, statik içerik (taskRules.ts).
export function TaskRulesPanel() {
  return (
    <section
      aria-label="Kurallar"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="label-eyebrow text-[var(--text-secondary)]">Kurallar</span>
      </div>
      <ul className="flex flex-col">
        {TASK_RULES.map((rule) => (
          <li
            key={rule.n}
            className={cn(
              'flex gap-3 px-4 py-2.5 border-t border-[var(--border-subtle)]',
              rule.emphasis && 'bg-[var(--accent-muted)]',
            )}
          >
            <span
              className={cn(
                'num shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold',
                rule.emphasis
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated,rgba(255,255,255,0.06))] text-[var(--text-muted)]',
              )}
            >
              {rule.n}
            </span>
            <span
              className={cn(
                'text-[12.5px] leading-snug pt-0.5',
                rule.emphasis
                  ? 'text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)]',
              )}
            >
              {rule.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
