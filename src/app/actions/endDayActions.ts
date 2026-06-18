'use server'

import { createClient } from '@/lib/supabase/server'
import { assertSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function finalizeDay(score: number, totalPossible = 80): Promise<{
  newStreak: number
  streakBroken: boolean
  longestStreak: number
}> {
  await assertSession()
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)
  // totalPossible artık günün gerçek toplam puanı (antrenman günü ~100, diğer ~80).
  // Eski hardcoded 70, completion_rate'i bozuyordu (streak + haftalık tutarlılık buna bağlı).
  const safeTotal = totalPossible > 0 ? totalPossible : 80
  const completionRate = Math.min(100, Math.round((score / safeTotal) * 100))

  // daily_scores'a kaydet
  await supabase.from('daily_scores').upsert({
    date: today,
    total_score: score,
    total_possible: totalPossible,
    completion_rate: completionRate,
    finalized: true,
  }, { onConflict: 'date' })

  // goat_state'i güncelle
  const { data: state } = await supabase
    .from('goat_state')
    .select('*')
    .eq('id', 1)
    .single()

  const lastFinalized = state?.last_finalized
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  let newStreak = 1
  let streakBroken = false

  if (lastFinalized === today) {
    // Aynı gün tekrar basıyorsa — streak değişmez
    return {
      newStreak: state?.current_streak ?? 1,
      streakBroken: false,
      longestStreak: state?.longest_streak ?? 1,
    }
  }

  if (lastFinalized === yesterdayStr) {
    // Dün de tamamladı — streak devam
    newStreak = (state?.current_streak ?? 0) + 1
  } else if (lastFinalized) {
    // Ara verdi — streak kırıldı
    streakBroken = (state?.current_streak ?? 0) > 1
    newStreak = 1
  }

  const longestStreak = Math.max(newStreak, state?.longest_streak ?? 0)

  // Son 7 günü hesapla — haftalık tutarlılık
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)

  const { data: lastWeek } = await supabase
    .from('daily_scores')
    .select('completion_rate')
    .gte('date', sevenDaysAgoStr)
    .order('date', { ascending: false })
    .limit(7)

  const avgConsistency = lastWeek && lastWeek.length > 0
    ? Math.round(lastWeek.reduce((sum, d) => sum + (d.completion_rate ?? 0), 0) / lastWeek.length)
    : 0

  await supabase.from('goat_state').update({
    current_streak: newStreak,
    longest_streak: longestStreak,
    last_finalized: today,
    consistency_days: (state?.consistency_days ?? 0) + 1,
    weekly_consistency: avgConsistency,
  }).eq('id', 1)

  revalidatePath('/')

  return { newStreak, streakBroken, longestStreak }
}
