'use client'

import { createElement, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Music,
  Salad,
  Droplet,
  Snowflake,
  Pill,
  Dumbbell,
  Languages,
  Phone,
  Flame,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { setHabitValue } from '@/app/actions/habitActions'
import {
  groupForHabit,
  HABIT_GROUP_META,
  type HabitGroup,
  type HabitOverviewItem,
} from '@/lib/habits/config'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  music: Music,
  salad: Salad,
  droplet: Droplet,
  snowflake: Snowflake,
  pill: Pill,
  dumbbell: Dumbbell,
  languages: Languages,
  phone: Phone,
}

function iconFor(key: string | null): LucideIcon {
  return (key && ICONS[key]) || Flame
}

const CADENCE_LABEL: Record<string, string> = {
  training_days: 'Antrenman günleri',
  english_days: 'İngilizce günleri',
}

// getDay 0=Pazar
const WEEKDAY_TR = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct']

function weekdayShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return WEEKDAY_TR[d.getDay()] ?? ''
}

export function HabitTracker({ items, today }: { items: HabitOverviewItem[]; today: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [local, setLocal] = useState(items)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // server props referansı değişince (router.refresh sonrası) authoritative veriyi al
  const [lastItems, setLastItems] = useState(items)
  if (items !== lastItems) {
    setLastItems(items)
    setLocal(items)
  }

  const dueToday = local.filter((h) => h.computed.todayStatus !== 'not_due')
  const doneToday = dueToday.filter((h) => h.computed.todayStatus === 'done')

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
      })
    )
    setBusyKey(h.key)
    startTransition(async () => {
      await setHabitValue(h.key, next, today)
      setBusyKey(null)
      router.refresh()
    })
  }

  // Gruplara böl, sıraya diz. Sistemsel: o gün GEREKLİ OLMAYAN (not_due) alışkanlık
  // gizlenir — antrenman yoksa antrenman, ingilizce günü değilse ingilizce görünmez.
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
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 flex flex-col gap-9 pb-20">
      {/* Başlık + sessiz özet */}
      <header className="flex items-end justify-between gap-4 pt-1">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-[var(--accent)]" />
            <h1 className="text-2xl sm:text-3xl font-semibold font-[family-name:var(--font-display)] tracking-tight text-[var(--text-primary)]">
              Alışkanlıklar
            </h1>
          </div>
          <p className="text-[13px] text-[var(--text-muted)]">
            Küçük tutarlılık → büyük kontrol.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-lg font-semibold text-[var(--text-primary)] leading-none">
            {doneToday.length}/{dueToday.length}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)] mt-1">
            Bugün
          </div>
        </div>
      </header>

      {/* Gruplar */}
      {groups.map((section) => {
        const due = section.habits.filter((h) => h.computed.todayStatus !== 'not_due')
        const done = due.filter((h) => h.computed.todayStatus === 'done')
        return (
          <section key={section.group} className="flex flex-col">
            <div className="flex items-baseline justify-between mb-1.5">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {section.meta.label}
              </h2>
              <span className="num text-[11px] font-medium text-[var(--text-muted)]">
                {done.length}/{due.length || section.habits.length}
              </span>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
              {section.habits.map((h) => (
                <HabitRow
                  key={h.key}
                  habit={h}
                  today={today}
                  busy={busyKey === h.key}
                  onTap={() => tap(h)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function HabitRow({
  habit,
  today,
  busy,
  onTap,
}: {
  habit: HabitOverviewItem
  today: string
  busy: boolean
  onTap: () => void
}) {
  const Icon = iconFor(habit.icon)
  const { computed } = habit
  const isCounter = habit.target > 1
  const hasStreak = computed.currentStreak > 0
  const cadence = CADENCE_LABEL[habit.cadence_type]
  const last7 = habit.cells.slice(-7)

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-card-hover)] transition-colors duration-200">
      {/* Sol: ikon + ad */}
      <div className="min-w-0 flex-1 flex items-center gap-2.5">
        {createElement(Icon, { className: 'w-4 h-4 text-[var(--text-muted)] shrink-0' })}
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--text-primary)] truncate">{habit.label}</div>
          {cadence && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{cadence}</div>}
        </div>
      </div>

      {/* Sağ: 7 gün-çemberi */}
      <div className="flex items-center gap-1 shrink-0">
        {last7.map((c) => {
          const isToday = c.date === today
          return (
            <DayCircle
              key={c.date}
              date={c.date}
              due={c.due}
              done={c.due && c.done}
              isToday={isToday}
              isCounter={isCounter}
              todayValue={isToday ? habit.todayValue : 0}
              target={habit.target}
              label={habit.label}
              busy={busy}
              onTap={isToday ? onTap : undefined}
            />
          )
        })}
      </div>

      {/* Streak */}
      <div className="flex items-center gap-1 shrink-0 w-9 justify-end" aria-label={`${computed.currentStreak} gün zincir`}>
        <Flame
          className={cn('w-3.5 h-3.5', hasStreak ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}
        />
        <span
          className={cn(
            'num text-sm font-semibold',
            hasStreak ? 'text-[var(--text-primary)]' : 'text-[var(--text-quaternary)]',
          )}
        >
          {computed.currentStreak}
        </span>
      </div>
    </div>
  )
}

function DayCircle({
  date,
  due,
  done,
  isToday,
  isCounter,
  todayValue,
  target,
  label,
  busy,
  onTap,
}: {
  date: string
  due: boolean
  done: boolean
  isToday: boolean
  isCounter: boolean
  todayValue: number
  target: number
  label: string
  busy: boolean
  onTap?: () => void
}) {
  // Görsel durum sınıfları (Framer dark, sakin):
  // done = yeşil dolu · bugün = mavi ring · kaçırılan = ince turuncu · boş = soluk
  const missed = due && !done && !isToday

  const circleCls = cn(
    'w-7 h-7 rounded-full flex items-center justify-center text-[9px] num font-semibold transition-all duration-150',
    done
      ? 'bg-[var(--success)] text-black'
      : isToday
        ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
        : missed
          ? 'border border-[var(--fire)]/45 text-[var(--fire)]/70'
          : due
            ? 'border border-[var(--border-strong)] text-transparent'
            : 'border border-[var(--border-subtle)]/60 text-transparent',
  )

  const inner = done ? (
    isCounter ? <span className="text-black">{Math.min(todayValue || target, target)}</span> : <Check className="w-3.5 h-3.5" strokeWidth={3} />
  ) : isToday && isCounter ? (
    <span>{todayValue}</span>
  ) : null

  const title = `${weekdayShort(date)} ${date}${
    due ? (done ? ' · yapıldı' : isToday ? ' · bugün' : ' · kaçırıldı') : ' · gerekli değil'
  }`

  const circle = (
    <div className={circleCls} title={title}>
      {inner}
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-1">
      {onTap ? (
        <button
          onClick={onTap}
          disabled={busy}
          aria-label={`${label} · bugün işaretle`}
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-card)] active:scale-90 transition-transform duration-150 disabled:opacity-60"
        >
          {circle}
        </button>
      ) : (
        circle
      )}
      <span
        className={cn(
          'text-[8px] font-semibold uppercase tracking-wide',
          isToday ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]',
        )}
      >
        {weekdayShort(date)}
      </span>
    </div>
  )
}
