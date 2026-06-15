'use client'

import { createElement, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
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
  AlertTriangle,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { setHabitValue } from '@/app/actions/habitActions'
import {
  groupForHabit,
  HABIT_GROUP_META,
  type HabitGroup,
  type HabitOverviewItem,
} from '@/lib/habits/config'

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
  daily: 'Her gün',
  training_days: 'Antrenman günleri',
  english_days: 'İngilizce günleri',
}

const WEEKDAY_TR = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'] // getDay 0=Pazar

function weekdayShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return WEEKDAY_TR[d.getDay()] ?? ''
}

function milestone(streak: number): string | null {
  if (streak >= 100) return '100+ gün'
  if (streak >= 30) return '30 gün'
  if (streak >= 7) return '7 gün'
  return null
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
  const atRisk = local.filter((h) => h.computed.atRisk)
  const activeChains = local.filter((h) => h.computed.currentStreak > 0).length

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
    <div className="max-w-[1080px] mx-auto px-4 sm:px-6 flex flex-col gap-8 pb-20">
      {/* Başlık + özet */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <Flame className="w-6 h-6 text-[var(--accent-yellow)]" />
          <h1 className="text-2xl sm:text-3xl font-bold font-[family-name:var(--font-inter-tight)] tracking-tight text-[var(--text-primary)]">
            Alışkanlık Zinciri
          </h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-prose">
          Küçük tutarlılık → büyük kontrol.{' '}
          <span className="text-[var(--text-primary)] font-semibold">Zinciri kırma.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Stat label="Bugün" value={`${doneToday.length}/${dueToday.length}`} />
          <Stat label="Aktif zincir" value={String(activeChains)} />
          {atRisk.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/25 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {atRisk.length} zincir risk altında
            </span>
          )}
        </div>
      </header>

      {/* Gruplar */}
      {groups.map((section) => {
        const due = section.habits.filter((h) => h.computed.todayStatus !== 'not_due')
        const done = due.filter((h) => h.computed.todayStatus === 'done')
        return (
          <section key={section.group} className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-2">
              <h2 className="text-base font-bold font-[family-name:var(--font-inter-tight)] tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-yellow)]" />
                {section.meta.label}
              </h2>
              <span className="num text-[11px] font-bold tracking-wide text-[var(--text-muted)]">
                {done.length}/{due.length || section.habits.length}
              </span>
            </div>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            >
              {section.habits.map((h) => (
                <HabitWatchCard
                  key={h.key}
                  habit={h}
                  today={today}
                  busy={busyKey === h.key}
                  onTap={() => tap(h)}
                />
              ))}
            </motion.div>
          </section>
        )
      })}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-4 py-2">
      <div className="text-[9px] font-bold tracking-widest uppercase text-[var(--text-muted)]">{label}</div>
      <div className="num text-lg font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

const RING_R = 34
const RING_C = 2 * Math.PI * RING_R

function HabitWatchCard({
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
  const reduce = useReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const Icon = iconFor(habit.icon)
  const { computed } = habit
  const ms = milestone(computed.currentStreak)
  const isCounter = habit.target > 1
  const isBusiness = habit.category === 'business'
  const isDone = computed.todayStatus === 'done'
  const notDue = computed.todayStatus === 'not_due'

  const frac = Math.max(0, Math.min(1, habit.todayValue / habit.target))
  const dashoffset = RING_C * (1 - frac)
  const last7 = habit.cells.slice(-7)
  const hasStreak = computed.currentStreak > 0

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={`relative overflow-hidden bg-[var(--bg-card)] border rounded-2xl p-5 flex gap-5 ${
        computed.atRisk ? 'border-[var(--warning)]/40' : 'border-[var(--border-subtle)]'
      }`}
    >
      {/* Watch face — tappable ring */}
      <button
        onClick={onTap}
        disabled={busy}
        aria-label={`${habit.label} işaretle`}
        className="relative shrink-0 w-[88px] h-[88px] flex items-center justify-center disabled:opacity-60 focus:outline-none"
      >
        {/* Alev-glow (streak varsa pulse) */}
        {hasStreak && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(164, 22, 26, 0.35) 0%, rgba(122, 17, 21, 0.18) 45%, transparent 70%)',
            }}
            animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.55, 0.9, 0.55] }}
            transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <motion.circle
            cx="40"
            cy="40"
            r={RING_R}
            fill="none"
            stroke={notDue ? 'rgba(255,255,255,0.18)' : 'var(--accent-yellow)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            initial={false}
            animate={{ strokeDashoffset: notDue ? RING_C : dashoffset }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </svg>
        {/* Merkez: streak + alev / done check */}
        <motion.div
          key={isDone ? 'done' : 'open'}
          initial={reduce ? false : { scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="relative flex flex-col items-center justify-center"
        >
          {isDone && !isCounter ? (
            <Check className="w-7 h-7 text-[var(--accent-yellow)]" />
          ) : isCounter ? (
            <>
              <span className="num text-lg font-bold leading-none text-[var(--text-primary)]">
                {habit.todayValue}
              </span>
              <span className="num text-[10px] text-[var(--text-muted)] leading-none mt-0.5">
                /{habit.target}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-0.5">
              <Flame
                className={`w-3.5 h-3.5 ${hasStreak ? 'text-[var(--accent-yellow)]' : 'text-[var(--text-muted)]'}`}
              />
              <span className="num text-xl font-bold leading-none text-[var(--text-primary)]">
                {computed.currentStreak}
              </span>
            </div>
          )}
        </motion.div>
      </button>

      {/* Sağ taraf: bilgi */}
      <div className="min-w-0 flex-1 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {createElement(Icon, { className: 'w-4 h-4 text-[var(--text-secondary)] shrink-0' })}
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{habit.label}</span>
              {isBusiness && (
                <span className="text-[8px] font-black tracking-wider uppercase text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/30 rounded px-1.5 py-0.5 shrink-0">
                  İŞ
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] font-medium mt-1">
              {CADENCE_LABEL[habit.cadence_type] ?? 'Her gün'}
            </div>
          </div>
          {/* Streak rozeti (counter/done için sağda da göster) */}
          {(isCounter || isDone) && (
            <div className="flex items-center gap-1 shrink-0">
              <Flame
                className={`w-4 h-4 ${hasStreak ? 'text-[var(--accent-yellow)]' : 'text-[var(--text-muted)]'}`}
              />
              <span className="num text-base font-bold text-[var(--text-primary)]">{computed.currentStreak}</span>
            </div>
          )}
        </div>

        {/* Haftalık 7-dot */}
        <div className="flex items-center gap-1.5">
          {last7.map((c) => {
            const isToday = c.date === today
            let cls = 'bg-white/[0.06] border border-transparent'
            if (c.due && c.done) cls = 'bg-[var(--accent-yellow)] border border-transparent'
            else if (isToday) cls = 'bg-transparent border-2 border-[var(--accent-yellow)]/70'
            else if (c.due && !c.done) cls = 'bg-[var(--danger)]/25 border border-transparent'
            return (
              <div key={c.date} className="flex flex-col items-center gap-1">
                <div
                  title={`${c.date}${c.due ? (c.done ? ' · yapıldı' : ' · kaçırıldı') : ' · gerekli değil'}`}
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${cls}`}
                >
                  {c.due && c.done && <Check className="w-3 h-3 text-black" />}
                </div>
                <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase">
                  {weekdayShort(c.date)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Meta + genişlet */}
        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-medium">
          <span>
            En uzun {computed.longestStreak}g · %{Math.round(computed.completionRate30 * 100)} (30g)
            {ms && <span className="text-[var(--accent-yellow)] font-bold"> · {ms}</span>}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 hover:text-[var(--text-secondary)] transition-colors"
          >
            30g
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Genişlet: 30-gün tam zincir */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-end gap-[3px] pt-1">
                {habit.cells.map((c) => {
                  const isToday = c.date === today
                  let cls = 'bg-white/5'
                  if (c.due && c.done) cls = 'bg-[var(--accent-yellow)]'
                  else if (c.due && !c.done) cls = isToday ? 'bg-[var(--warning)]/40' : 'bg-[var(--danger)]/25'
                  else if (!c.due) cls = 'bg-white/[0.03]'
                  return (
                    <div
                      key={c.date}
                      title={`${c.date}${c.due ? (c.done ? ' · yapıldı' : ' · kaçırıldı') : ' · gerekli değil'}`}
                      className={`h-5 flex-1 min-w-[4px] rounded-[2px] ${cls} ${
                        isToday ? 'ring-1 ring-[var(--accent-yellow)]' : ''
                      }`}
                    />
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {computed.atRisk && hasStreak && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--warning)]/50" />
      )}
    </motion.div>
  )
}
