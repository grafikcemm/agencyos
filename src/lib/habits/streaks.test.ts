import { describe, it, expect } from 'vitest'
import { format, subDays } from 'date-fns'
import { computeHabit } from './streaks'

const today = new Date(2026, 5, 15) // 15 Haziran 2026, Pazartesi
const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

// offset (gün geriye) → value sözlüğünü date sözlüğüne çevir
function logsFromOffsets(map: Record<number, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [off, val] of Object.entries(map)) {
    out[fmt(subDays(today, Number(off)))] = val
  }
  return out
}

const daily = () => true

describe('computeHabit — günlük cadence', () => {
  it('son 5 gün tamamlanınca currentStreak 5 olur', () => {
    const logs = logsFromOffsets({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 })
    const { computed } = computeHabit({ isDue: daily, target: 1, logs, today })
    expect(computed.currentStreak).toBe(5)
    expect(computed.longestStreak).toBeGreaterThanOrEqual(5)
    expect(computed.todayStatus).toBe('done')
    expect(computed.atRisk).toBe(false)
  })

  it('bugün yapılmamış ama dün+ yapılmışsa zincir kırılmaz (grace), atRisk true', () => {
    const logs = logsFromOffsets({ 1: 1, 2: 1, 3: 1, 4: 1 }) // bugün (0) yok
    const { computed } = computeHabit({ isDue: daily, target: 1, logs, today })
    expect(computed.currentStreak).toBe(4) // geçmiş sayılır, bugün saymaz ama kırmaz
    expect(computed.todayStatus).toBe('due')
    expect(computed.atRisk).toBe(true)
  })

  it('geçmişte boşluk varsa zincir o boşlukta kırılır', () => {
    const logs = logsFromOffsets({ 0: 1, 1: 1, 3: 1, 4: 1 }) // 2 gün önce eksik
    const { computed } = computeHabit({ isDue: daily, target: 1, logs, today })
    expect(computed.currentStreak).toBe(2) // bugün + dün
    expect(computed.longestStreak).toBe(2)
  })
})

describe('computeHabit — cadence-aware (sadece tek günler due)', () => {
  // tek tarihli günler due (15,13,11...), çift günler (14,12) due değil
  const oddDue = (d: Date) => d.getDate() % 2 === 1

  it('due-olmayan günler zinciri kırmaz ve saymaz', () => {
    // 15,13,11 yapıldı; 14,12 zaten due değil (log yok)
    const logs = logsFromOffsets({ 0: 1, 2: 1, 4: 1 })
    const { computed } = computeHabit({ isDue: oddDue, target: 1, logs, today })
    expect(computed.currentStreak).toBe(3)
  })

  it('bugün due değilse todayStatus not_due, atRisk false', () => {
    const evenDue = (d: Date) => d.getDate() % 2 === 0 // 15 due değil
    const logs = logsFromOffsets({ 1: 1, 3: 1 })
    const { computed } = computeHabit({ isDue: evenDue, target: 1, logs, today })
    expect(computed.todayStatus).toBe('not_due')
    expect(computed.atRisk).toBe(false)
  })
})

describe('computeHabit — sayaç (target > 1)', () => {
  it('hedefin altı partial, hedef done', () => {
    const partialLogs = logsFromOffsets({ 0: 2 }) // 3 termostan 2
    const r1 = computeHabit({ isDue: daily, target: 3, logs: partialLogs, today })
    expect(r1.computed.todayStatus).toBe('partial')
    expect(r1.computed.atRisk).toBe(true)
    expect(r1.todayValue).toBe(2)

    const doneLogs = logsFromOffsets({ 0: 3 })
    const r2 = computeHabit({ isDue: daily, target: 3, logs: doneLogs, today })
    expect(r2.computed.todayStatus).toBe('done')
    expect(r2.computed.atRisk).toBe(false)
  })
})

describe('computeHabit — heatmap hücreleri', () => {
  it('windowDays kadar hücre üretir, eski→yeni sırada', () => {
    const logs = logsFromOffsets({ 0: 1 })
    const { cells } = computeHabit({ isDue: daily, target: 1, logs, today, windowDays: 7 })
    expect(cells).toHaveLength(7)
    expect(cells[cells.length - 1].date).toBe(fmt(today)) // son hücre bugün
    expect(cells[cells.length - 1].done).toBe(true)
  })
})
