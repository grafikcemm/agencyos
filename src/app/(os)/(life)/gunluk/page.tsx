export const dynamic = 'force-dynamic'

import { format } from 'date-fns'
import { isRhythmActiveToday, getRhythmVariantForDay } from '@/data/rhythmSchedule'
import { isGymPrepActiveISO, isWorkoutTemplate, GYM_PREP_TREADMILL_MINUTES } from '@/data/gymPrepChallenge'
import { DailyShell } from '@/components/daily/DailyShell'
import { DailyDashboardClient } from '@/components/daily/DailyDashboardClient'
import { createServerSupabase } from '@/lib/supabaseServer'
import { loadActiveTasks } from '@/lib/activeTasks'
import { loadDailyRoutines } from '@/lib/dailyRoutines'
import { getEnglishGroupForToday } from '@/lib/dayUtils'
import { ensureTodayQuote } from '@/app/actions/quoteActions'
import { getDailyV2 } from '@/app/actions/dailyV2'

// Anasayfa (Günlük) — FTG GÜNLÜK sekmesinin gerçek-route karşılığı.
export default async function GunlukPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await ensureTodayQuote()

  const resolvedParams = await searchParams
  const isDev = resolvedParams.dev === '1'

  const supabase = createServerSupabase()
  const today = format(new Date(), 'yyyy-MM-dd')
  const englishGroupKey = getEnglishGroupForToday()

  const [
    { data: goatState },
    { data: templates },
    { data: completions },
    activeTasksResult,
    dailyRoutinesResult,
    { data: todayPeakLogs },
    { data: quote },
    { data: vitaminPackagesData },
    { data: vitaminCompletions },
    { data: skincareCompletions },
    dailyV2Data,
  ] = await Promise.all([
    supabase.from('goat_state').select('last_finalized, current_streak').eq('id', 1).single(),
    supabase.from('task_templates').select('*').order('sort_order'),
    supabase.from('daily_completions').select('template_id').eq('date', today),
    loadActiveTasks(supabase),
    loadDailyRoutines(supabase),
    supabase.from('bad_habit_logs').select('habit_key, success').eq('log_date', today),
    supabase.from('daily_quotes').select('*').eq('date', today).maybeSingle(),
    supabase.from('vitamin_packages').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('vitamin_package_completions').select('*').eq('date', today),
    supabase.from('skincare_completions').select('package_id').eq('date', today),
    getDailyV2(today),
  ])

  const activeTasks = activeTasksResult.tasks

  let englishSubtasks: { id: string; title: string; isCompleted: boolean }[] = []
  if (englishGroupKey) {
    const [{ data: subtasks }, { data: subCompletions }] = await Promise.all([
      supabase.from('task_subtasks').select('*').eq('subtask_group', englishGroupKey).order('sort_order'),
      supabase.from('task_subtask_completions').select('*').eq('date', today),
    ])
    const completedSet = new Set(subCompletions?.map((c) => c.subtask_id) ?? [])
    englishSubtasks =
      subtasks?.map((s: { id: string; title: string }) => ({
        ...s,
        isCompleted: completedSet.has(s.id),
      })) ?? []
  }

  const todayDate = new Date()
  const gymPrep = isGymPrepActiveISO(today)
  const isTreadmillActive = gymPrep || isRhythmActiveToday('treadmill', todayDate)

  const takenVitaminSet = new Set(vitaminCompletions?.map((c) => c.package_id) ?? [])
  const vitaminPackages =
    vitaminPackagesData?.map((p) => ({ ...p, isTaken: takenVitaminSet.has(p.id) })) ?? []

  const completedSkincareIds = skincareCompletions?.map((c) => c.package_id) ?? []

  const completedIds = new Set(completions?.map((c) => c.template_id) ?? [])
  const allTemplates = templates ?? []

  const dayMap: Record<number, string> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
  }
  const currentDayKey = dayMap[new Date().getDay()]

  const englishVariant = getRhythmVariantForDay('english', todayDate)
  const treadmillVariant = getRhythmVariantForDay('treadmill', todayDate)

  const sistemTasks = allTemplates
    .filter((t) => {
      if (t.section !== 'sistem') return false
      if (gymPrep && isWorkoutTemplate(t)) return false
      if (gymPrep && t.system_type === 'treadmill') return true
      if (t.system_type === 'saz') return false
      if (!t.active_days || t.active_days.length === 0) return true
      return t.active_days.includes(currentDayKey)
    })
    .map((t) => {
      if (t.system_type === 'english' && englishVariant) {
        return {
          ...t,
          title: englishVariant.optional ? `${englishVariant.label} (Opsiyonel)` : englishVariant.label,
        }
      }
      if (t.system_type === 'treadmill') {
        if (gymPrep) return { ...t, title: `Koşu Bandı — ${GYM_PREP_TREADMILL_MINUTES} dk` }
        if (treadmillVariant) {
          return {
            ...t,
            title: treadmillVariant.optional ? `${treadmillVariant.label} (Opsiyonel)` : treadmillVariant.label,
          }
        }
      }
      return t
    })

  const sportVariant = getRhythmVariantForDay('sport', todayDate)
  if (
    !gymPrep &&
    isRhythmActiveToday('sport', todayDate) &&
    !sistemTasks.some((t: { system_type?: string | null }) => t.system_type === 'sport')
  ) {
    sistemTasks.push({
      id: '__virtual_sport__',
      title: sportVariant?.label ?? 'Spor',
      section: 'sistem',
      system_type: 'sport',
      category: 'health',
      points: 20,
      active_days: ['mon', 'wed', 'fri', 'sat'],
      sort_order: 99,
    })
  }

  const safeGoatState = goatState || { last_finalized: null }
  const isAlreadyFinalized = safeGoatState.last_finalized === today

  const activeDailyRoutines = dailyRoutinesResult.routines.filter((r) => {
    if (!r.active_days) return true
    return r.active_days.includes(currentDayKey)
  })
  const routinesTotalPoints = activeDailyRoutines.reduce((sum, r) => sum + (r.points ?? 10), 0)
  const routinesCompletedPoints = activeDailyRoutines
    .filter((r) => completedIds.has(r.id))
    .reduce((sum, r) => sum + (r.points ?? 10), 0)

  const peakTotalPoints = 40
  const completedPeakCount = todayPeakLogs?.filter((l) => l.success).length ?? 0
  const peakCompletedPoints = completedPeakCount * 10

  const rhythmsTotalPoints = sistemTasks.reduce((sum, t) => sum + (t.points ?? 10), 0)
  const rhythmsCompletedPoints = sistemTasks
    .filter((t) => completedIds.has(t.id))
    .reduce((sum, t) => sum + (t.points ?? 10), 0)

  const activeProjects = activeTasks.filter((t) => t.category === 'active')
  const projectsTotalPoints = activeProjects.length * 15
  const projectsCompletedPoints = activeProjects.filter((t) => t.is_done).length * 15

  const totalDailyPoints = routinesTotalPoints + peakTotalPoints + rhythmsTotalPoints + projectsTotalPoints
  const completedDailyPoints =
    routinesCompletedPoints + peakCompletedPoints + rhythmsCompletedPoints + projectsCompletedPoints

  return (
    <div className="min-h-screen font-sans">
      <DailyShell>
        <DailyDashboardClient
          routines={activeDailyRoutines}
          sistemTasks={sistemTasks}
          activeTasks={activeTasks}
          initialCompletedIds={Array.from(completedIds)}
          initialPeakChecked={
            todayPeakLogs?.reduce(
              (acc: Record<string, boolean>, l: { habit_key: string; success: boolean }) => {
                acc[l.habit_key] = l.success
                return acc
              },
              {} as Record<string, boolean>,
            ) ?? {}
          }
          quote={quote}
          vitaminPackages={vitaminPackages}
          completedSkincareIds={completedSkincareIds}
          englishSubtasks={englishSubtasks}
          isTreadmillActive={isTreadmillActive}
          today={today}
          isAlreadyFinalized={isAlreadyFinalized}
          initialTotalScore={completedDailyPoints}
          dayTotalPossible={totalDailyPoints}
          dayModeInitial={dailyV2Data?.day_mode ?? null}
          healthMinimumInitial={{
            protein_meal: dailyV2Data?.protein_meal ?? false,
            water_3l: dailyV2Data?.water_3l ?? false,
            walk_35: dailyV2Data?.walk_35 ?? false,
          }}
          englishDoneInitial={dailyV2Data?.english_done ?? false}
          uiModeInitial={dailyV2Data?.ui_mode || 'denge'}
          maxAutoTasksInitial={dailyV2Data?.max_auto_tasks || 3}
          lockedModulesInitial={dailyV2Data?.locked_modules || []}
          unlockedModulesInitial={dailyV2Data?.unlocked_modules || []}
          assistantReasonInitial={dailyV2Data?.assistant_reason || ''}
          nextActionInitial={dailyV2Data?.next_action || ''}
          agencyLoadInitial={dailyV2Data?.agency_load || 'normal'}
          energyInitial={dailyV2Data?.energy || 'medium'}
          isDev={isDev}
        />

        {process.env.NODE_ENV !== 'production' && activeTasksResult.source === 'fallback' && (
          <div className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-full bg-[#1c0000] border border-[#2a0000] text-[10px] font-medium text-[#ff453a] opacity-80 hover:opacity-100 transition-opacity animate-in fade-in duration-300">
            ⚡ Offline görev şablonu
          </div>
        )}
      </DailyShell>
    </div>
  )
}
