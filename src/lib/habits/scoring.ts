// Alışkanlık oyunlaştırma — saf skor motoru.
// HabitOverviewItem[] (server'dan, cells dahil) alır; puan/seviye/XP/zincir döner.
// Yeni tablo YOK — her şey yüklü cells'ten (son 30 gün) türetilir.

import { isCoreHabit } from './config'
import type { HabitOverviewItem } from './config'

/** Alışkanlık başına temel puan. İleride key bazlı ağırlık eklenebilir. */
export const DEFAULT_HABIT_POINTS = 10

const HABIT_POINTS: Record<string, number> = {
  // hepsi varsayılan; gelecekte ağırlıklandırma için yer
}

export function pointsForHabit(key: string): number {
  return HABIT_POINTS[key] ?? DEFAULT_HABIT_POINTS
}

export interface HabitScore {
  /** Bugün kazanılan puan (tamamlanan due alışkanlıklar). */
  todayPoints: number
  /** Bugün mümkün olan toplam puan (due alışkanlıklar). */
  todayPossible: number
  todayDone: number
  todayDue: number
  /** Çekirdek (ADHD-koruyucu) alışkanlıklar — bugün. */
  coreDone: number
  coreDue: number
  /** Çekirdeklerin hepsi bugün yapıldıysa GÜN TAM BAŞARILI. */
  coreComplete: boolean
  /** Kümülatif XP (30 gün penceresi momentum'u). */
  xp: number
  level: number
  /** Mevcut seviye içinde ilerleme 0..1. */
  levelProgress: number
  xpToNext: number
  /** Tüm due alışkanlıkların tamamlandığı ardışık gün (bugün grace). */
  globalStreak: number
  /** Son 7 günde tamamlanan/gereken oranı 0..1. */
  weeklyConsistency: number
}

/** Seviye L için gereken kümülatif XP eşiği (L1 = 0, kuadratik büyüme). */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.floor(level))
  return 25 * (L - 1) * (L - 1)
}

/** Verilen XP için seviye (>=1). */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1
  return Math.floor(Math.sqrt(xp / 25)) + 1
}

interface DayAgg {
  date: string
  due: number
  done: number
}

/** Tarihe göre due/done toplamı (tüm alışkanlıklar, puan ağırlıklı done değil — gün-perfect için sayım). */
function aggregateByDate(items: HabitOverviewItem[]): DayAgg[] {
  const map = new Map<string, { due: number; done: number }>()
  for (const it of items) {
    for (const c of it.cells) {
      if (!c.due) continue
      const cur = map.get(c.date) ?? { due: 0, done: 0 }
      cur.due += 1
      if (c.done) cur.done += 1
      map.set(c.date, cur)
    }
  }
  return [...map.entries()]
    .map(([date, v]) => ({ date, due: v.due, done: v.done }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) // eski→yeni
}

export function computeHabitScore(items: HabitOverviewItem[], todayStr: string): HabitScore {
  // ── Bugün ──
  let todayPoints = 0
  let todayPossible = 0
  let todayDone = 0
  let todayDue = 0
  let coreDone = 0
  let coreDue = 0
  for (const it of items) {
    if (it.computed.todayStatus === 'not_due') continue
    todayDue += 1
    todayPossible += pointsForHabit(it.key)
    const done = it.computed.todayStatus === 'done'
    if (done) {
      todayDone += 1
      todayPoints += pointsForHabit(it.key)
    }
    if (isCoreHabit(it.key)) {
      coreDue += 1
      if (done) coreDone += 1
    }
  }
  const coreComplete = coreDue > 0 && coreDone === coreDue

  // ── XP (30 gün penceresindeki tüm tamamlamalar × puan) ──
  let xp = 0
  for (const it of items) {
    const pts = pointsForHabit(it.key)
    for (const c of it.cells) {
      if (c.due && c.done) xp += pts
    }
  }
  const level = levelFromXp(xp)
  const base = xpForLevel(level)
  const next = xpForLevel(level + 1)
  const span = next - base
  const levelProgress = span > 0 ? Math.min(1, Math.max(0, (xp - base) / span)) : 0
  const xpToNext = Math.max(0, next - xp)

  // ── Global zincir + haftalık tutarlılık (ÇEKİRDEK bazlı) ──
  // "Başarılı gün" = o günün çekirdek alışkanlıkları tamam. Çekirdek yoksa tüm alışkanlıklara düş.
  const coreItems = items.filter((it) => isCoreHabit(it.key))
  const agg = aggregateByDate(coreItems.length > 0 ? coreItems : items)
  let globalStreak = 0
  for (let i = agg.length - 1; i >= 0; i--) {
    const a = agg[i]
    if (a.due === 0) continue // o gün due alışkanlık yok — nötr
    const perfect = a.done === a.due
    if (perfect) {
      globalStreak += 1
    } else {
      if (a.date === todayStr) continue // bugün henüz bitmedi — grace
      break
    }
  }

  const last7 = agg.slice(-7)
  const weekDue = last7.reduce((s, a) => s + a.due, 0)
  const weekDone = last7.reduce((s, a) => s + a.done, 0)
  const weeklyConsistency = weekDue > 0 ? weekDone / weekDue : 0

  return {
    todayPoints,
    todayPossible,
    todayDone,
    todayDue,
    coreDone,
    coreDue,
    coreComplete,
    xp,
    level,
    levelProgress,
    xpToNext,
    globalStreak,
    weeklyConsistency,
  }
}
