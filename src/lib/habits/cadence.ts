// Cadence motoru — bir alışkanlık belirli bir günde "due" (yapılması gereken) mi?
// Mevcut FTG ritim util'lerini reuse eder.

import { isRhythmActiveToday } from '@/data/rhythmSchedule'
import { ENGLISH_GROUP_BY_DAY, type DayKey } from '@/lib/dayUtils'
import type { HabitCadence } from './config'

// JS getDay() (0=Pazar) → FTG DayKey
const JS_DAY_TO_KEY: Record<number, DayKey> = {
  0: 'PAZ',
  1: 'PZT',
  2: 'SAL',
  3: 'CAR',
  4: 'PER',
  5: 'CUM',
  6: 'CMT',
}

export function isHabitDue(cadence: HabitCadence, date: Date): boolean {
  switch (cadence) {
    case 'daily':
      return true
    case 'training_days':
      // Antrenman günleri — FTG sport ritmi (mon/wed/fri/sat ağırlıklı)
      return isRhythmActiveToday('sport', date)
    case 'english_days': {
      const key = JS_DAY_TO_KEY[date.getDay()]
      return Boolean(ENGLISH_GROUP_BY_DAY[key])
    }
    default:
      return true
  }
}

/** Cadence'i bir tarih-yüklemine bağlar (streak motoru saf kalsın diye enjekte edilir). */
export function makeIsDue(cadence: HabitCadence): (d: Date) => boolean {
  return (d: Date) => isHabitDue(cadence, d)
}
