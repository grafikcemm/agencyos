// Alışkanlık takibi — tip tanımları ve Günlük (FTG) kaynak eşlemesi.
// "Zinciri kırma" sistemi: tek-truth = habit_logs (FTG Supabase).

export type HabitCadence = 'daily' | 'training_days' | 'english_days'
export type HabitCategory = 'life' | 'business'

export interface HabitDef {
  id: string
  key: string
  label: string
  icon: string | null
  category: HabitCategory
  cadence_type: HabitCadence
  target: number
  sort_order: number
  is_active: boolean
}

export interface HabitLogRow {
  habit_key: string
  date: string // yyyy-MM-dd
  value: number
}

export type TodayStatus = 'done' | 'partial' | 'due' | 'not_due'

export interface HabitComputed {
  currentStreak: number
  longestStreak: number
  completionRate30: number // 0..1
  todayStatus: TodayStatus
  atRisk: boolean // bugün due ve tamamlanmamış
}

export interface HabitDayCell {
  date: string
  due: boolean
  value: number
  done: boolean
}

export interface HabitOverviewItem extends HabitDef {
  todayValue: number
  computed: HabitComputed
  cells: HabitDayCell[] // eski→yeni, heatmap için
}

/**
 * Mirror eşlemesi: Günlük (FTG) tamamlamaları hangi alışkanlığı besler.
 * Günlük'te ilgili tik atıldığında habit_logs'a da yazılır (çift iş yok).
 * - system_type: task_templates.system_type eşleşmesi (saz/sport/english)
 * - vitamin: vitamin paketlerinin tümü alındığında
 * beslenme & musteri'nin Günlük kaynağı yok — doğrudan /aliskanliklar'dan loglanır.
 */
export const HABIT_SOURCE_BY_SYSTEM_TYPE: Record<string, string> = {
  saz: 'saz',
  sport: 'spor',
  english: 'ingilizce',
}

export const HABIT_KEY_VITAMIN = 'vitamin'

// ── Gruplama (sadece UI sunumu — migration yok) ───────────────────────────
// Alışkanlıkları İş / Sağlık / Rutinler bölümlerine ayırır. Veri/motor etkilenmez.
export type HabitGroup = 'is' | 'saglik' | 'rutinler'

export const HABIT_GROUP_BY_KEY: Record<string, HabitGroup> = {
  musteri: 'is',
  beslenme: 'saglik',
  su: 'saglik',
  vitamin: 'saglik',
  spor: 'saglik',
  saz: 'rutinler',
  ingilizce: 'rutinler',
  buz: 'rutinler',
}

export const HABIT_GROUP_META: Record<HabitGroup, { label: string; order: number }> = {
  is: { label: 'İş', order: 0 },
  saglik: { label: 'Sağlık', order: 1 },
  rutinler: { label: 'Rutinler', order: 2 },
}

/** Bilinmeyen key → 'rutinler' fallback. */
export function groupForHabit(key: string): HabitGroup {
  return HABIT_GROUP_BY_KEY[key] ?? 'rutinler'
}
