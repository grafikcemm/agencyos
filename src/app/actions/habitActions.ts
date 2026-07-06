'use server'

import { format, parseISO, subDays } from 'date-fns'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabaseServer'
import { assertSession } from '@/lib/auth'
import { computeHabit } from '@/lib/habits/streaks'
import { makeIsDue } from '@/lib/habits/cadence'
import type { HabitDef, HabitOverviewItem } from '@/lib/habits/config'
import { getIstanbulDateAndDay } from '@/lib/assistant/timezone'

// Streak tarama penceresiyle (computeHabit scanDays) KİLİTLİ tutulur — log
// penceresi taramadan kısaysa uzun zincirler sahte biçimde kesilir (120-gün cap bug'ı).
const HISTORY_DAYS = 365

function todayStr(): string {
  // Vercel'de server saati UTC — İstanbul 00:00-03:00 arasında UTC hâlâ dünde
  // kalır; log yanlış güne yazılırdı. reminderEngine ile aynı İstanbul çözümü.
  return getIstanbulDateAndDay().todayStr
}

/** Tüm aktif alışkanlıklar + hesaplı streak/heatmap (server component için). */
export async function getHabitsOverview(dateStr?: string): Promise<HabitOverviewItem[]> {
  const supabase = createServerSupabase()
  const today = parseISO(dateStr ?? todayStr())
  const todayDate = format(today, 'yyyy-MM-dd')
  const since = format(subDays(today, HISTORY_DAYS), 'yyyy-MM-dd')

  const [{ data: habits }, { data: logs }] = await Promise.all([
    supabase.from('habits').select('*').eq('is_active', true).order('sort_order'),
    supabase
      .from('habit_logs')
      .select('habit_key, date, value')
      .gte('date', since)
      .lte('date', todayDate),
  ])

  const logsByKey: Record<string, Record<string, number>> = {}
  for (const l of logs ?? []) {
    ;(logsByKey[l.habit_key] ??= {})[l.date] = l.value
  }

  return (habits ?? []).map((h: HabitDef) => {
    const isDue = makeIsDue(h.cadence_type)
    const r = computeHabit({
      isDue,
      target: h.target,
      logs: logsByKey[h.key] ?? {},
      today,
      // Tarama penceresi ASLA fetch penceresini aşmasın (eksik log ≠ yapılmadı).
      scanDays: HISTORY_DAYS,
    })
    return { ...h, todayValue: r.todayValue, computed: r.computed, cells: r.cells }
  })
}

/**
 * Bir alışkanlığın belirli gündeki değerini set eder (tek-truth: habit_logs).
 * value<=0 → log silinir. Client bir sonraki değeri hesaplayıp gönderir (binary toggle / sayaç).
 */
export async function setHabitValue(
  key: string,
  value: number,
  dateStr?: string
): Promise<{ ok: boolean; error?: string }> {
  await assertSession()
  const supabase = createServerSupabase()
  const date = dateStr ?? todayStr()
  try {
    if (value <= 0) {
      await supabase.from('habit_logs').delete().eq('habit_key', key).eq('date', date)
    } else {
      await supabase
        .from('habit_logs')
        .upsert({ habit_key: key, date, value }, { onConflict: 'habit_key,date' })
    }
    revalidatePath('/aliskanliklar')
    revalidatePath('/command-center')
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'habit log yazılamadı' }
  }
}
