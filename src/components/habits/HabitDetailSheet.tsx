'use client'

import { createElement, useEffect, type ReactNode } from 'react'
import { X, Lightbulb, Dumbbell, UtensilsCrossed, Waves, Pill } from 'lucide-react'
import type { HabitOverviewItem } from '@/lib/habits/config'
import { groupForHabit } from '@/lib/habits/config'
import { getHabitDetail } from '@/data/habitDetails'
import { NUTRITION_PLAN } from '@/data/nutritionPlan'
import { VITAMIN_PLAN } from '@/data/vitaminPlan'
import { getRhythmVariantForDay, type RhythmVariant } from '@/data/rhythmSchedule'
import { iconFor, GROUP_VISUAL } from './habitVisuals'

const pct = (n: number) => Math.round(n * 100)

export function HabitDetailSheet({
  habit,
  onClose,
}: {
  habit: HabitOverviewItem | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!habit) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [habit, onClose])

  if (!habit) return null

  const group = groupForHabit(habit.key)
  const visual = GROUP_VISUAL[group]
  const Icon = iconFor(habit.icon)
  const detail = getHabitDetail(habit.key)
  const { computed } = habit

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={habit.label}
    >
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none"
      />
      <div className="relative w-full sm:max-w-[480px] max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-out motion-reduce:animate-none">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-[var(--bg-card)]/95 backdrop-blur border-b border-[var(--border-subtle)]">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: visual.bg }}
          >
            {createElement(Icon, { className: 'w-5 h-5', style: { color: visual.fg } })}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--text-primary)] leading-tight">{habit.label}</h2>
            {detail?.summary && (
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 line-clamp-2">{detail.summary}</p>
            )}
          </div>
          <button
            aria-label="Kapat"
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-6">
          {/* İstatistik */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Zincir" value={`${computed.currentStreak}`} suffix="gün" />
            <Stat label="En uzun" value={`${computed.longestStreak}`} suffix="gün" />
            <Stat label="Son 30g" value={`%${pct(computed.completionRate30)}`} />
          </div>

          {/* Neden + adımlar + ipuçları */}
          {detail?.why && (
            <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{detail.why}</p>
          )}

          {detail?.steps && detail.steps.length > 0 && (
            <Section title="Nasıl">
              <ol className="flex flex-col gap-2">
                {detail.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-[var(--text-secondary)]">
                    <span className="num shrink-0 w-5 h-5 rounded-full bg-[var(--bg-elevated,rgba(255,255,255,0.06))] text-[var(--text-muted)] text-[11px] font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="leading-snug pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* Dinamik: beslenme → antrenman + öğünler */}
          {habit.key === 'beslenme' && <NutritionWorkoutBlock />}

          {/* Dinamik: ingilizce → günün dersi */}
          {habit.key === 'ingilizce' && <EnglishBlock />}

          {/* Dinamik: vitamin → supplement programı */}
          {habit.key === 'vitamin' && <VitaminBlock />}

          {detail?.tips && detail.tips.length > 0 && (
            <div className="flex flex-col gap-2">
              {detail.tips.map((t, i) => (
                <div
                  key={i}
                  className="flex gap-2.5 items-start rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] px-3 py-2.5"
                >
                  <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--accent)]" />
                  <span className="text-[12px] leading-snug text-[var(--text-secondary)]">{t}</span>
                </div>
              ))}
            </div>
          )}

          {/* 30 gün heatmap */}
          <Section title="Son 30 gün">
            <div className="flex flex-wrap gap-1">
              {habit.cells.map((c) => (
                <span
                  key={c.date}
                  title={`${c.date}${c.due ? (c.done ? ' · yapıldı' : ' · kaçırıldı') : ' · gerekli değil'}`}
                  className="w-3.5 h-3.5 rounded-[3px]"
                  style={{
                    backgroundColor: !c.due
                      ? 'var(--border-subtle,rgba(255,255,255,0.05))'
                      : c.done
                        ? 'var(--success,#34d399)'
                        : 'var(--fire,rgba(251,146,60,0.35))',
                    opacity: !c.due ? 0.5 : 1,
                  }}
                />
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] px-3 py-2.5 flex flex-col items-center">
      <span className="num text-lg font-semibold text-[var(--text-primary)] leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mt-1">
        {label}
        {suffix ? ` · ${suffix}` : ''}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">{title}</h3>
      {children}
    </div>
  )
}

function NutritionWorkoutBlock() {
  const workout = getRhythmVariantForDay('sport')
  return (
    <>
      <Section title="Bugünün Antrenmanı">
        {workout ? <WorkoutView v={workout} /> : (
          <p className="text-[13px] text-[var(--text-muted)]">Bugün dinlenme günü — antrenman yok. Beslenme ve su devam.</p>
        )}
      </Section>

      <Section title="Beslenme Planı">
        <div className="flex flex-col gap-3">
          {NUTRITION_PLAN.map((block) => (
            <div key={block.key} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] p-3">
              <div className="flex items-center gap-2 mb-2">
                <UtensilsCrossed className="w-3.5 h-3.5 text-[var(--success,#34d399)]" />
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">{block.label}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {block.items.map((it, i) => (
                  <li key={i} className="text-[12px] text-[var(--text-secondary)] flex justify-between gap-3">
                    <span>{it.name}</span>
                    {it.amount && <span className="num text-[var(--text-muted)] shrink-0">{it.amount}</span>}
                  </li>
                ))}
              </ul>
              {block.carbOptions && (
                <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Karbonhidrat (biri)</span>
                  <ul className="flex flex-col gap-1 mt-1">
                    {block.carbOptions.map((it, i) => (
                      <li key={i} className="text-[12px] text-[var(--text-secondary)] flex justify-between gap-3">
                        <span>{it.name}</span>
                        {it.amount && <span className="num text-[var(--text-muted)] shrink-0">{it.amount}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {block.note && <p className="text-[11px] text-[var(--text-muted)] mt-2">{block.note}</p>}
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function WorkoutView({ v }: { v: RhythmVariant }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Dumbbell className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{v.label}</span>
        {v.duration && <span className="text-[11px] text-[var(--text-muted)]">· {v.duration}</span>}
      </div>
      {v.warmup && v.warmup.length > 0 && (
        <ExList title="Isınma" items={v.warmup.map((e) => `${e.name}${e.reps ? ` — ${e.reps}` : ''}`)} />
      )}
      {v.exercises && v.exercises.length > 0 && (
        <ExList
          title="Hareketler"
          items={v.exercises.map((e) => {
            const sr = e.sets && e.reps ? `${e.sets} set × ${e.reps}` : e.reps ?? ''
            return `${e.name}${sr ? ` — ${sr}` : ''}${e.note ? ` (${e.note})` : ''}`
          })}
        />
      )}
      {v.cardio && v.cardio.length > 0 && (
        <ExList title="Kardiyo" items={v.cardio.map((e) => `${e.name}${e.reps ? ` — ${e.reps}` : ''}`)} />
      )}
      {(v.pool || v.sauna) && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] pt-1">
          <Waves className="w-3.5 h-3.5 text-[var(--accent)]" />
          {v.pool && <span>Havuz {v.pool}</span>}
          {v.pool && v.sauna && <span className="text-[var(--text-muted)]">·</span>}
          {v.sauna && <span>Sauna {v.sauna}</span>}
        </div>
      )}
    </div>
  )
}

function ExList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{title}</span>
      <ul className="flex flex-col gap-0.5 mt-1">
        {items.map((it, i) => (
          <li key={i} className="text-[12px] text-[var(--text-secondary)] leading-snug">
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

function VitaminBlock() {
  return (
    <Section title="Vitamin / Supplement Programı">
      <div className="flex flex-col gap-3">
        {VITAMIN_PLAN.map((block) => (
          <div
            key={block.key}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <Pill className="w-3.5 h-3.5 text-[var(--success,#34d399)]" />
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{block.label}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {block.items.map((it, i) => (
                <li key={i} className="text-[12px] text-[var(--text-secondary)] flex justify-between gap-3">
                  <span>
                    {it.name}
                    {it.note && <span className="text-[var(--text-muted)]"> · {it.note}</span>}
                  </span>
                  {it.amount && <span className="num text-[var(--text-muted)] shrink-0">{it.amount}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

function EnglishBlock() {
  const v = getRhythmVariantForDay('english')
  if (!v) return null
  return (
    <Section title="Bugünün Dersi">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,rgba(255,255,255,0.03))] p-3 flex flex-col gap-2">
        {v.description && <p className="text-[12px] text-[var(--text-secondary)] leading-snug">{v.description}</p>}
        {v.steps && v.steps.length > 0 && (
          <ul className="flex flex-col gap-1 mt-1">
            {v.steps.map((s, i) => (
              <li key={i} className="text-[12px] text-[var(--text-secondary)] flex gap-2">
                <span className="text-[var(--accent)]">·</span>
                <span className="leading-snug">{s.label}</span>
              </li>
            ))}
          </ul>
        )}
        {v.minimumVersion && (
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Taban gün: {v.minimumVersion}</p>
        )}
      </div>
    </Section>
  )
}
