// Streak motoru — saf, cadence-aware. "Zinciri kırma" mantığı.
// isDue enjekte edilir (test edilebilirlik için). Due-olmayan günler zinciri KIRMAZ ve SAYMAZ.
// Bugün henüz tamamlanmadıysa gün bitmediği için zincir kırılmaz (grace).

import { format, subDays } from 'date-fns'
import type { HabitComputed, HabitDayCell, TodayStatus } from './config'

export interface ComputeHabitOpts {
  isDue: (d: Date) => boolean
  target: number
  logs: Record<string, number> // date (yyyy-MM-dd) -> value
  today: Date
  windowDays?: number // heatmap penceresi (default 30)
  scanDays?: number // current/longest tarama sınırı (default 365)
}

export interface ComputeHabitResult {
  computed: HabitComputed
  cells: HabitDayCell[] // eski→yeni
  todayValue: number
}

export function computeHabit(opts: ComputeHabitOpts): ComputeHabitResult {
  const { isDue, target, logs, today } = opts
  const windowDays = opts.windowDays ?? 30
  const scanDays = opts.scanDays ?? 365
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  const todayStr = fmt(today)
  const val = (ds: string) => logs[ds] ?? 0
  const isDone = (ds: string) => val(ds) >= target

  // ── Bugünün durumu ──
  const todayDue = isDue(today)
  const todayValue = val(todayStr)
  let todayStatus: TodayStatus
  if (!todayDue) todayStatus = 'not_due'
  else if (todayValue >= target) todayStatus = 'done'
  else if (todayValue > 0) todayStatus = 'partial'
  else todayStatus = 'due'
  const atRisk = todayDue && todayValue < target

  // ── Mevcut streak: bugünden geriye; bugün eksikse grace (kırma) ──
  let currentStreak = 0
  for (let i = 0; i < scanDays; i++) {
    const d = subDays(today, i)
    const ds = fmt(d)
    if (!isDue(d)) continue
    if (isDone(ds)) {
      currentStreak++
    } else {
      if (ds === todayStr) continue // bugün henüz bitmedi
      break
    }
  }

  // ── En uzun streak (scan penceresi, eski→yeni) ──
  let longestStreak = 0
  let run = 0
  for (let i = scanDays - 1; i >= 0; i--) {
    const d = subDays(today, i)
    const ds = fmt(d)
    if (!isDue(d)) continue
    if (isDone(ds)) {
      run++
      if (run > longestStreak) longestStreak = run
    } else {
      if (ds === todayStr) continue // bugünü tamamlanmadıysa kırma
      run = 0
    }
  }
  if (currentStreak > longestStreak) longestStreak = currentStreak

  // ── Son 30 günde tamamlama oranı (yalnız due günler) ──
  let dueCount = 0
  let doneCount = 0
  for (let i = 0; i < 30; i++) {
    const d = subDays(today, i)
    if (!isDue(d)) continue
    const ds = fmt(d)
    if (ds === todayStr && val(ds) < target) continue // bugün tamamlanmadıysa orana dahil etme (adil)
    dueCount++
    if (isDone(ds)) doneCount++
  }
  const completionRate30 = dueCount > 0 ? doneCount / dueCount : 0

  // ── Heatmap hücreleri (eski→yeni) ──
  const cells: HabitDayCell[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = subDays(today, i)
    const ds = fmt(d)
    const due = isDue(d)
    const value = val(ds)
    cells.push({ date: ds, due, value, done: due && value >= target })
  }

  return {
    computed: { currentStreak, longestStreak, completionRate30, todayStatus, atRisk },
    cells,
    todayValue,
  }
}
