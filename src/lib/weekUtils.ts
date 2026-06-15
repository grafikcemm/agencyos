import { startOfISOWeek, endOfISOWeek, format, getISOWeek, getISOWeekYear, eachDayOfInterval } from 'date-fns';

export function getCurrentISOWeekKey(): string {
  const now = new Date();
  return `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`;
}

export function getCurrentWeekRange(): { start: Date; end: Date; days: Date[] } {
  const now = new Date();
  const start = startOfISOWeek(now);
  const end = endOfISOWeek(now);
  const days = eachDayOfInterval({ start, end });
  return { start, end, days };
}

export function formatDateForDB(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export const DAY_LABELS_TR = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT', 'PAZ'] as const;
