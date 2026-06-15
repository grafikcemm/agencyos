export interface EnglishDayPlan {
  day: number; // JS getDay(): 0=Sun, 1=Mon...
  dayLabel: string;
  focus: string;
  duration: string;
  goal: string;
}

// Günlük tek çapa — her gün aynı (İngilizce360 omurga, 2026-06-07).
const DAILY_FOCUS = 'İngilizce360: sıradaki 1 ders + kelime defteri';
const DAILY_GOAL = 'Süreklilik (taban: 5 kelime)';
export const ENGLISH_WEEKLY_PLAN: EnglishDayPlan[] = [
  { day: 1, dayLabel: 'Pazartesi', focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
  { day: 2, dayLabel: 'Salı',      focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
  { day: 3, dayLabel: 'Çarşamba',  focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
  { day: 4, dayLabel: 'Perşembe',  focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
  { day: 5, dayLabel: 'Cuma',      focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
  { day: 6, dayLabel: 'Cumartesi', focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
  { day: 0, dayLabel: 'Pazar',     focus: DAILY_FOCUS, duration: '15 dk', goal: DAILY_GOAL },
];

export function getEnglishPlanForToday(): EnglishDayPlan {
  const day = new Date().getDay();
  return ENGLISH_WEEKLY_PLAN.find(p => p.day === day) ?? ENGLISH_WEEKLY_PLAN[1];
}
