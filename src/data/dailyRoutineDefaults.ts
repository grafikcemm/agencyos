export interface DailyRoutine {
  id: string;
  title: string;
  points: number;
  section: "rutin";
  system_type?: string | null;
  active_days?: string[] | null; // e.g. ['mon', 'wed', 'fri', 'sat'] for workout
}

// v2 set: 5 sade madde. Eski: workout, "06:30 Uyanış + Yüze Buz", "15 sayfa" — legacy diskte kalır.
export const DEFAULT_DAILY_ROUTINES: DailyRoutine[] = [
  {
    id: "rutin_wake_up",
    title: "Uyan",
    points: 15,
    section: "rutin",
    system_type: null,
  },
  {
    id: "rutin_wash_face",
    title: "Yüzünü buz ile yıka",
    points: 5,
    section: "rutin",
    system_type: null,
  },
  {
    id: "rutin_teeth",
    title: "Dişini fırçala",
    points: 5,
    section: "rutin",
    system_type: null,
  },
  {
    id: "rutin_vitamins",
    title: "Günlük vitaminlerini iç",
    points: 5,
    section: "rutin",
    system_type: "vitamin",
  },
  {
    id: "rutin_reading",
    title: "Gün sonu 10 sayfa kitap oku",
    points: 10,
    section: "rutin",
    system_type: "reading",
  },
];

export function getDefaultDailyRoutines(): DailyRoutine[] {
  return DEFAULT_DAILY_ROUTINES;
}
