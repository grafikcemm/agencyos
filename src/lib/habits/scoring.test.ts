import { describe, it, expect } from 'vitest'
import {
  computeHabitScore,
  xpForLevel,
  levelFromXp,
  pointsForHabit,
  DEFAULT_HABIT_POINTS,
} from './scoring'
import type { HabitOverviewItem, HabitDayCell, TodayStatus } from './config'

// ── Test yardımcıları ────────────────────────────────────────────────────────
function cell(date: string, due: boolean, done: boolean): HabitDayCell {
  return { date, due, value: done ? 1 : 0, done }
}

function makeItem(
  key: string,
  todayStatus: TodayStatus,
  cells: HabitDayCell[],
): HabitOverviewItem {
  return {
    id: key,
    key,
    label: key,
    icon: null,
    category: 'life',
    cadence_type: 'daily',
    target: 1,
    sort_order: 0,
    is_active: true,
    todayValue: todayStatus === 'done' ? 1 : 0,
    computed: {
      currentStreak: 0,
      longestStreak: 0,
      completionRate30: 0,
      todayStatus,
      atRisk: todayStatus === 'due',
    },
    cells,
  }
}

/** N ardışık tarih (eski→yeni), today dahil. */
function lastDates(today: string, n: number): string[] {
  const out: string[] = []
  const base = new Date(`${today}T00:00:00Z`)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

describe('xpForLevel / levelFromXp', () => {
  it('seviye 1 sıfır XP gerektirir, kuadratik büyür', () => {
    // Arrange / Act / Assert
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(25)
    expect(xpForLevel(3)).toBe(100)
  })

  it('XP arttıkça seviye monoton artar', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(25)).toBe(2)
    expect(levelFromXp(99)).toBe(2)
    expect(levelFromXp(100)).toBe(3)
  })
})

describe('pointsForHabit', () => {
  it('bilinmeyen key için varsayılan puan döner', () => {
    expect(pointsForHabit('herhangi')).toBe(DEFAULT_HABIT_POINTS)
  })
})

describe('computeHabitScore — bugün', () => {
  it('tamamlanan due alışkanlıkların puanını toplar, not_due olanı saymaz', () => {
    // Arrange
    const today = '2026-06-27'
    const items = [
      makeItem('a', 'done', [cell(today, true, true)]),
      makeItem('b', 'due', [cell(today, true, false)]),
      makeItem('c', 'not_due', [cell(today, false, false)]),
    ]

    // Act
    const score = computeHabitScore(items, today)

    // Assert
    expect(score.todayDue).toBe(2)
    expect(score.todayDone).toBe(1)
    expect(score.todayPoints).toBe(DEFAULT_HABIT_POINTS)
    expect(score.todayPossible).toBe(DEFAULT_HABIT_POINTS * 2)
  })
})

describe('computeHabitScore — global zincir', () => {
  it('tüm due alışkanlıklar tamamlanan ardışık günleri sayar', () => {
    // Arrange — 3 gün, her gün 2 alışkanlık, hepsi done; bugün henüz boş (grace)
    const dates = lastDates('2026-06-27', 3)
    const [d1, d2, today] = dates
    const items = [
      makeItem('a', 'due', [cell(d1, true, true), cell(d2, true, true), cell(today, true, false)]),
      makeItem('b', 'due', [cell(d1, true, true), cell(d2, true, true), cell(today, true, false)]),
    ]

    // Act
    const score = computeHabitScore(items, today)

    // Assert — bugün grace (sayılmaz, kırmaz); önceki 2 gün perfect
    expect(score.globalStreak).toBe(2)
  })

  it('eksik tamamlanan geçmiş gün zinciri kırar', () => {
    // Arrange
    const dates = lastDates('2026-06-27', 3)
    const [d1, d2, today] = dates
    const items = [
      makeItem('a', 'done', [cell(d1, true, true), cell(d2, true, false), cell(today, true, true)]),
    ]

    // Act
    const score = computeHabitScore(items, today)

    // Assert — bugün done (1), d2 eksik → kır
    expect(score.globalStreak).toBe(1)
  })
})

describe('computeHabitScore — XP ve haftalık tutarlılık', () => {
  it('XP penceredeki tüm tamamlamaları puanla çarpar', () => {
    // Arrange — 2 gün, 1 alışkanlık, ikisi de done
    const dates = lastDates('2026-06-27', 2)
    const [d1, today] = dates
    const items = [makeItem('a', 'done', [cell(d1, true, true), cell(today, true, true)])]

    // Act
    const score = computeHabitScore(items, today)

    // Assert
    expect(score.xp).toBe(DEFAULT_HABIT_POINTS * 2)
    expect(score.weeklyConsistency).toBe(1)
  })
})

describe('computeHabitScore — çekirdek (ADHD-koruyucu)', () => {
  it('çekirdekler bugün tamamsa coreComplete=true (çekirdek-dışı eksik olsa bile)', () => {
    // Arrange
    const today = '2026-06-27'
    const items = [
      makeItem('beslenme', 'done', [cell(today, true, true)]),
      makeItem('su', 'done', [cell(today, true, true)]),
      makeItem('vitamin', 'done', [cell(today, true, true)]),
      makeItem('x_post', 'due', [cell(today, true, false)]), // çekirdek değil, eksik
    ]

    // Act
    const score = computeHabitScore(items, today)

    // Assert
    expect(score.coreDue).toBe(3)
    expect(score.coreDone).toBe(3)
    expect(score.coreComplete).toBe(true)
  })

  it('bir çekirdek eksikse coreComplete=false', () => {
    // Arrange
    const today = '2026-06-27'
    const items = [
      makeItem('beslenme', 'done', [cell(today, true, true)]),
      makeItem('su', 'due', [cell(today, true, false)]),
      makeItem('vitamin', 'done', [cell(today, true, true)]),
    ]

    // Act
    const score = computeHabitScore(items, today)

    // Assert
    expect(score.coreComplete).toBe(false)
    expect(score.coreDone).toBe(2)
  })

  it('global zincir çekirdek bazlı — çekirdek-dışı eksik gün zinciri kırmaz', () => {
    // Arrange — çekirdekler 2 gün tam (bugün grace); çekirdek-dışı sürekli eksik
    const dates = lastDates('2026-06-27', 3)
    const [d1, d2, today] = dates
    const items = [
      makeItem('beslenme', 'due', [cell(d1, true, true), cell(d2, true, true), cell(today, true, false)]),
      makeItem('su', 'due', [cell(d1, true, true), cell(d2, true, true), cell(today, true, false)]),
      makeItem('x_post', 'due', [cell(d1, true, false), cell(d2, true, false), cell(today, true, false)]),
    ]

    // Act
    const score = computeHabitScore(items, today)

    // Assert — sadece çekirdek sayılır → zincir 2
    expect(score.globalStreak).toBe(2)
  })
})
