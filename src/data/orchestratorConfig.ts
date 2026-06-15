export const ORCHESTRATOR_START_DATE = process.env.ORCHESTRATOR_START_DATE ?? '2026-06-01';

export type ReminderType =
  | 'morning_checkin'
  | 'midday_status'
  | 'evening_rhythm'
  | 'night_shutdown';

/**
 * TEK SAAT KAYNAĞI — İstanbul (Europe/Istanbul) saatleri.
 * vercel.json cron'ları bu saatlerin UTC karşılığı olmalı;
 * senkron `scripts/check-cron-sync.mjs` ile doğrulanır (test:quality gate).
 */
export const REMINDER_SCHEDULE: Record<ReminderType, string> = {
  morning_checkin: '08:30',
  midday_status:   '13:00',
  evening_rhythm:  '19:30',
  night_shutdown:  '22:30',
};

/** Türkiye 2016'dan beri DST'siz sabit UTC+3. */
export const ISTANBUL_UTC_OFFSET_HOURS = 3;

export type TimeBlock = 'morning' | 'noon' | 'evening' | 'night';

/** vercel.json cron query parametresi (timeBlock) → reminder_type eşlemesi. */
export const TIME_BLOCK_TO_REMINDER: Record<TimeBlock, ReminderType> = {
  morning: 'morning_checkin',
  noon:    'midday_status',
  evening: 'evening_rhythm',
  night:   'night_shutdown',
};

/** 'HH:MM' İstanbul saatini Vercel cron string'ine ('M H * * *', UTC) çevirir. */
export function reminderTimeToUtcCron(hhmm: string): string {
  const [hourStr, minuteStr] = hhmm.split(':');
  const istanbulHour = Number(hourStr);
  const minute = Number(minuteStr);
  // Saat 3'ten küçükse UTC'de önceki güne sarkar; gün alanı '*' olduğu için saat sarması yeterli.
  const utcHour = (istanbulHour - ISTANBUL_UTC_OFFSET_HOURS + 24) % 24;
  return `${minute} ${utcHour} * * *`;
}

export function isOrchestratorActive(today: string): boolean {
  return today >= ORCHESTRATOR_START_DATE;
}
