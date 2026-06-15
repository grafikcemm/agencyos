import type { DailyRoutine } from '@/data/dailyRoutineDefaults';

export type DayMode = 'normal' | 'yogun' | 'dagilmis';

export interface AutoTaskItem {
  id: string;
  title: string;
  type: 'task' | 'routine' | 'health';
  points: number;
}

const LIMIT: Record<DayMode, number> = {
  normal: 3,
  yogun: 2,
  dagilmis: 1,
};

const BIG_TASK_PATTERNS = [
  /kurs/i, /proje/i, /müzik/i, /academy/i, /üniversite/i, /okul/i,
  /haftalık/i, /aylık/i, /gelişim/i, /kariyer/i,
];

const MORNING_ONLY_PATTERNS = [/uyan/i, /yüzün/i, /yüzü/i, /yuz/i];

function isBigTask(title: string): boolean {
  return BIG_TASK_PATTERNS.some(p => p.test(title));
}

function isMorningOnly(title: string): boolean {
  return MORNING_ONLY_PATTERNS.some(p => p.test(title));
}

const HEALTH_ITEMS: AutoTaskItem[] = [
  { id: 'protein_meal', title: 'Proteinli ilk öğün',         type: 'health', points: 5 },
  { id: 'water_3l',     title: '3 litre su',                  type: 'health', points: 5 },
  { id: 'walk_35',      title: '35 dk yürüyüş / koşu bandı', type: 'health', points: 5 },
];

function toNextActionTitle(title: string): string {
  const lowercaseTitle = title.toLowerCase();
  const isBitir = lowercaseTitle.includes('bitir') || lowercaseTitle.includes('tamamla');
  
  let cleaned = title;

  // Clean specific filler phrases
  cleaned = cleaned
    .replace(/ana sayfada bulunan\s*/gi, '')
    .replace(/ana sayfada yer alan\s*/gi, '')
    .replace(/planlama neler yapılacak\s*/gi, '')
    .replace(/planlama neler yapilacak\s*/gi, '')
    .replace(/neler yapılacak\s*/gi, '')
    .replace(/neler yapilacak\s*/gi, '')
    .replace(/neler yapılmalı\s*/gi, '')
    .replace(/neler yapilmali\s*/gi, '')
    .replace(/\s+bitir\w*/gi, '')
    .replace(/\s+tamamla\w*/gi, '')
    .trim();

  // Clean Turkish accusative suffixes
  cleaned = cleaned
    .replace(/(\w+)(s?)([ıiuü])n\3$/i, '$1$2$3')
    .replace(/(\w+)[y]([ıiuü])$/i, '$1')
    .trim();

  let formatted = cleaned;
  if (isBitir || isBigTask(cleaned)) {
    formatted = `10 dk başlat: ${cleaned}`;
  }

  // Ensure it's max 52 characters (within 48-55 range)
  if (formatted.length > 52) {
    formatted = formatted.slice(0, 49) + '...';
  }

  return formatted;
}

/**
 * Picks 1–3 items for the "today's auto tasks" card.
 * Accept currentHour for testability (default: now).
 */
export function pickTodayTasks(
  activeTasks: Array<{
    id: string;
    title: string;
    category: string;
    is_done: boolean;
    is_priority?: boolean;
    sort_order?: number;
    points?: number;
  }>,
  routines: DailyRoutine[],
  completedIds: Set<string>,
  mode: DayMode,
  healthState: { protein_meal: boolean; water_3l: boolean; walk_35: boolean },
  currentHour: number = new Date().getHours(),
  maxAutoTasks?: number
): AutoTaskItem[] {
  const isAfterNoon = currentHour >= 12;
  const limitVal = maxAutoTasks !== undefined ? maxAutoTasks : LIMIT[mode];

  const pendingTasks = activeTasks
    .filter(t => t.category === 'active' && !t.is_done)
    .sort((a, b) => {
      if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  const pendingRoutines: AutoTaskItem[] = routines
    .filter(r => {
      if (completedIds.has(r.id)) return false;
      if (isAfterNoon && isMorningOnly(r.title)) return false;
      return true;
    })
    .map(r => ({ id: r.id, title: r.title, type: 'routine' as const, points: r.points }));

  const pendingHealth = HEALTH_ITEMS.filter(h => !healthState[h.id as keyof typeof healthState]);

  if (mode === 'dagilmis') {
    // Single small physical action — prefer health items, fall back to routine
    return [...pendingHealth, ...pendingRoutines].slice(0, limitVal);
  }

  if (mode === 'yogun') {
    // 1 small active task + 1 health or routine
    const smallTasks = pendingTasks
      .filter(t => !isBigTask(t.title))
      .map(t => ({ id: t.id, title: toNextActionTitle(t.title), type: 'task' as const, points: t.points ?? 15 }));
    const support = [...pendingHealth, ...pendingRoutines];
    return [...smallTasks.slice(0, 1), ...support.slice(0, Math.max(0, limitVal - 1))].slice(0, limitVal);
  }

  // normal: 1 main task + 1 routine + 1 health/bonus (up to LIMIT)
  const taskItems = pendingTasks
    .map(t => ({ id: t.id, title: toNextActionTitle(t.title), type: 'task' as const, points: t.points ?? 15 }));

  const combined = [...taskItems.slice(0, Math.max(1, limitVal - 2)), ...pendingRoutines, ...pendingHealth];
  return combined.slice(0, limitVal);
}
