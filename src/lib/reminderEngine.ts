import type { ReminderType } from '@/data/orchestratorConfig';
import { REMINDER_SCHEDULE } from '@/data/orchestratorConfig';

export type ReminderStatus = 'pending' | 'done' | 'skipped' | 'snoozed';

export interface ReminderState {
  id?: string;
  date: string;
  reminder_type: ReminderType;
  sent_at: string;
  responded_at?: string;
  status: ReminderStatus;
  telegram_message_id?: number;
}

/** İstanbul saatine göre HH:MM — server-local (Vercel'de UTC) saate güvenme. */
function istanbulHHMM(now: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(now); // "08:30"
}

// Returns the reminder type that should fire right now, or null
export function getDueReminder(
  now: Date,
  sentToday: ReminderType[],
): ReminderType | null {
  const hhmm = istanbulHHMM(now);

  const order: ReminderType[] = [
    'morning_checkin',
    'midday_status',
    'evening_rhythm',
    'night_shutdown',
  ];

  for (const type of order) {
    if (sentToday.includes(type)) continue;
    if (hhmm >= REMINDER_SCHEDULE[type]) return type;
  }

  return null;
}
