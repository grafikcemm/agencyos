'use client'

import { createElement, useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, Check } from 'lucide-react'
import { setHabitValue } from '@/app/actions/habitActions'
import {
  groupForHabit,
  isCoreHabit,
  HABIT_GROUP_META,
  type HabitGroup,
  type HabitOverviewItem,
} from '@/lib/habits/config'
import { computeHabitScore, pointsForHabit } from '@/lib/habits/scoring'
import { cn } from '@/lib/utils'
import { iconFor, GROUP_VISUAL } from './habitVisuals'
import { HabitScoreHeader } from './HabitScoreHeader'
import { HabitDetailSheet } from './HabitDetailSheet'

const CADENCE_LABEL: Record<string, string> = {
  training_days: 'Antrenman günleri',
  english_days: 'İngilizce günleri',
}

export function HabitTracker({ items, today }: { items: HabitOverviewItem[]; today: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [local, setLocal] = useState(items)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Uçuşta tap sayısı. busyKey, router.refresh() ÇAĞRILDIĞI anda temizlenir (yeni
  // props henüz gelmemişken) — kullanıcı hemen ikinci habit'e dokunursa, ilkinin
  // gecikmiş refresh'i ikincinin optimistik durumunu ezerdi. Uçuşta işlem varken
  // server sync atlanır; son işlemin refresh'i zaten hepsini içerir.
  // State (ref değil): render sırasında okunuyor — react-hooks/refs kuralı ref
  // okumasını yasaklar; sayaç güncellemeleri functional-update ile yarışsız.
  const [pendingTaps, setPendingTaps] = useState(0)

  // server props referansı değişince (router.refresh sonrası) authoritative veriyi al
  const [lastItems, setLastItems] = useState(items)
  if (items !== lastItems) {
    setLastItems(items)
    if (pendingTaps === 0) setLocal(items)
  }

  const score = computeHabitScore(local, today)
  const selected = selectedKey ? local.find((h) => h.key === selectedKey) ?? null : null

  function tap(h: HabitOverviewItem) {
    if (busyKey) return
    const isCounter = h.target > 1
    const next = isCounter
      ? h.todayValue >= h.target
        ? 0
        : h.todayValue + 1
      : h.todayValue >= h.target
        ? 0
        : h.target
    // optimistik: bugünkü değeri + durumu güncelle
    setLocal((prev) =>
      prev.map((it) => {
        if (it.key !== h.key) return it
        const todayStatus =
          next >= it.target
            ? 'done'
            : next > 0
              ? 'partial'
              : it.computed.todayStatus === 'not_due'
                ? 'not_due'
                : 'due'
        const wasDone = it.todayValue >= it.target
        const nowDone = next >= it.target
        const streakDelta = nowDone && !wasDone ? 1 : !nowDone && wasDone ? -1 : 0
        return {
          ...it,
          todayValue: next,
          computed: {
            ...it.computed,
            todayStatus,
            atRisk: todayStatus !== 'not_due' && next < it.target,
            currentStreak: Math.max(0, it.computed.currentStreak + streakDelta),
          },
          cells: it.cells.map((c) => (c.date === today ? { ...c, value: next, done: nowDone } : c)),
        }
      }),
    )
    setBusyKey(h.key)
    setPendingTaps((n) => n + 1)
    startTransition(async () => {
      try {
        await setHabitValue(h.key, next, today)
        router.refresh()
      } finally {
        // Server action throw etse bile kartı kalıcı kilitleme.
        setPendingTaps((n) => n - 1)
        setBusyKey(null)
      }
    })
  }

  const closeSheet = useCallback(() => setSelectedKey(null), [])

  // Gruplara böl. O gün GEREKLİ OLMAYAN (not_due) alışkanlık gizlenir.
  const groups = (Object.keys(HABIT_GROUP_META) as HabitGroup[])
    .sort((a, b) => HABIT_GROUP_META[a].order - HABIT_GROUP_META[b].order)
    .map((g) => ({
      group: g,
      meta: HABIT_GROUP_META[g],
      habits: local.filter(
        (h) => groupForHabit(h.key) === g && h.computed.todayStatus !== 'not_due',
      ),
    }))
    .filter((s) => s.habits.length > 0)

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 flex flex-col gap-8 pb-20">
      <HabitScoreHeader score={score} />

      {groups.map((section) => {
        const due = section.habits.filter((h) => h.computed.todayStatus !== 'not_due')
        const done = due.filter((h) => h.computed.todayStatus === 'done')
        return (
          <section key={section.group} className="flex flex-col">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {section.meta.label}
              </h2>
              <span className="num text-[11px] font-medium text-[var(--text-muted)]">
                {done.length}/{due.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {section.habits.map((h) => (
                <HabitCard
                  key={h.key}
                  habit={h}
                  busy={busyKey === h.key}
                  onTap={() => tap(h)}
                  onOpen={() => setSelectedKey(h.key)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <HabitDetailSheet habit={selected} onClose={closeSheet} />
    </div>
  )
}

function HabitCard({
  habit,
  busy,
  onTap,
  onOpen,
}: {
  habit: HabitOverviewItem
  busy: boolean
  onTap: () => void
  onOpen: () => void
}) {
  const group = groupForHabit(habit.key)
  const visual = GROUP_VISUAL[group]
  const Icon = iconFor(habit.icon)
  const { computed } = habit
  const hasStreak = computed.currentStreak > 0
  const cadence = CADENCE_LABEL[habit.cadence_type]
  const isCounter = habit.target > 1
  const isDone = habit.computed.todayStatus === 'done'
  const points = pointsForHabit(habit.key)
  const core = isCoreHabit(habit.key)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      aria-label={`${habit.label} — detay`}
      className="group cursor-pointer rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-3 flex items-center gap-3 hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {/* İkon çipi */}
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: visual.bg }}
      >
        {createElement(Icon, { className: 'w-5 h-5', style: { color: visual.fg } })}
      </span>

      {/* Ad + zincir/puan */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{habit.label}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px]',
              hasStreak ? 'text-[var(--text-secondary)]' : 'text-[var(--text-quaternary)]',
            )}
          >
            <Flame
              className={cn('w-3 h-3', hasStreak ? 'text-[var(--fire,#fb923c)]' : 'text-[var(--text-quaternary)]')}
            />
            <span className="num">{computed.currentStreak}</span>
          </span>
          <span className="text-[var(--text-quaternary)]">·</span>
          <span className={cn('num text-[11px]', isDone ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')}>
            +{points}p
          </span>
          {core && (
            <>
              <span className="text-[var(--text-quaternary)]">·</span>
              <span
                className="text-[9px] uppercase tracking-wide font-bold text-[var(--success,#34d399)]"
                title="Çekirdek alışkanlık — bunları yapınca gün başarılı sayılır"
              >
                çekirdek
              </span>
            </>
          )}
          {cadence && (
            <>
              <span className="text-[var(--text-quaternary)]">·</span>
              <span className="text-[10px] text-[var(--text-muted)]">{cadence}</span>
            </>
          )}
        </div>
      </div>

      {/* Bugün tamamlama dairesi */}
      <TodayCircle
        isDone={isDone}
        isCounter={isCounter}
        value={habit.todayValue}
        target={habit.target}
        busy={busy}
        label={habit.label}
        onTap={onTap}
      />
    </div>
  )
}

function TodayCircle({
  isDone,
  isCounter,
  value,
  target,
  busy,
  label,
  onTap,
}: {
  isDone: boolean
  isCounter: boolean
  value: number
  target: number
  busy: boolean
  label: string
  onTap: () => void
}) {
  const partial = !isDone && value > 0
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onTap()
      }}
      disabled={busy}
      aria-label={`${label} · bugün işaretle`}
      aria-pressed={isDone}
      className={cn(
        'shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[12px] num font-semibold transition-all duration-150 active:scale-90 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]',
        isDone
          ? 'bg-[var(--success,#34d399)] text-black'
          : partial
            ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
            : 'border-2 border-[var(--border-strong,rgba(255,255,255,0.15))] text-[var(--text-quaternary)] hover:border-[var(--accent)] hover:text-[var(--accent)]',
      )}
    >
      {isDone ? (
        isCounter ? (
          <span>{Math.min(value || target, target)}</span>
        ) : (
          <Check className="w-5 h-5" strokeWidth={3} />
        )
      ) : isCounter ? (
        <span>
          {value}/{target}
        </span>
      ) : null}
    </button>
  )
}
