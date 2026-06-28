'use client'

import { nextExam, examTypeLabel, type AkademiExam } from '@/lib/akademi/dates'

interface ExamHeroProps {
  exams: AkademiExam[]
}

function countdownLabel(daysLeft: number): string {
  if (daysLeft === 0) return 'BUGÜN'
  if (daysLeft === 1) return 'YARIN'
  return `${daysLeft} gün kaldı`
}

export function ExamHero({ exams }: ExamHeroProps) {
  const next = nextExam(exams)

  if (!next) {
    return (
      <section
        className="rounded-card border bg-[var(--bg-surface)] shadow-soft p-6"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Sıradaki Sınav
        </p>
        <p className="mt-2 text-lg font-display font-semibold text-[var(--text-secondary)]">
          Planlı sınav yok
        </p>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Aşağıdan manuel sınav ekleyebilirsin.
        </p>
      </section>
    )
  }

  const urgent = next.daysLeft <= 3
  const glow = urgent ? '#ff5d6c' : '#0099ff'

  return (
    <section
      className="relative overflow-hidden rounded-card border bg-[var(--bg-surface)] p-6 lg:p-8"
      style={{
        borderColor: 'var(--border-subtle)',
        boxShadow: `0 0 32px -10px ${glow}, 0 12px 48px -20px ${glow}`,
      }}
      aria-label="Sıradaki sınav"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.10]"
        style={{ background: `radial-gradient(120% 120% at 0% 0%, ${glow}, transparent 60%)` }}
      />
      <div className="relative">
        <p className="text-[10px] font-mono uppercase tracking-[0.14em]" style={{ color: glow }}>
          ● Sıradaki Sınav
        </p>
        <div className="mt-3 flex flex-col lg:flex-row lg:items-end gap-2 lg:gap-6">
          <h1 className="hero-title font-display font-bold text-[var(--text-primary)] leading-tight">
            {next.course_name ?? 'Sınav'}
          </h1>
          <span className="text-sm font-mono uppercase text-[var(--text-muted)] lg:pb-1.5">
            {examTypeLabel(next.exam_type)}
            {next.exam_time ? ` · ${next.exam_time}` : ''}
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="display-title font-display font-bold tabular-nums" style={{ color: glow }}>
            {countdownLabel(next.daysLeft)}
          </span>
          <span className="text-sm font-mono text-[var(--text-muted)] tabular-nums">{next.exam_date}</span>
        </div>
      </div>
    </section>
  )
}
