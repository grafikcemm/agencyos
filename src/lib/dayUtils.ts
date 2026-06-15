export type DayKey = 'PZT' | 'SAL' | 'CAR' | 'PER' | 'CUM' | 'CMT' | 'PAZ';

const DAY_MAP: DayKey[] = ['PAZ', 'PZT', 'SAL', 'CAR', 'PER', 'CUM', 'CMT'];

export function getTodayDayKey(): DayKey {
  return DAY_MAP[new Date().getDay()];
}

// İngilizce ritim: HER GÜN aktif. İngilizce360 günlük tek çapa (2026-06-07).
// Eski Salı/Perşembe/Pazar gün-bazlı kadans kaldırıldı.
export const ENGLISH_GROUP_BY_DAY: Partial<Record<DayKey, string>> = {
  PZT: 'english_daily',
  SAL: 'english_daily',
  CAR: 'english_daily',
  PER: 'english_daily',
  CUM: 'english_daily',
  CMT: 'english_daily',
  PAZ: 'english_daily',
};

export function getEnglishGroupForToday(): string | null {
  const day = getTodayDayKey();
  return ENGLISH_GROUP_BY_DAY[day] ?? null;
}

export function isEnglishActiveToday(): boolean {
  return getEnglishGroupForToday() !== null;
}
