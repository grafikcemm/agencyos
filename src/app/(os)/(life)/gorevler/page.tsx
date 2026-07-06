export const dynamic = 'force-dynamic'

import { loadActiveTasks } from '@/lib/activeTasks'
import { createServerSupabase } from '@/lib/supabaseServer'
import { getIstanbulDateAndDay } from '@/lib/assistant/timezone'
import { ActiveTasksSection } from '@/components/tasks/ActiveTasksSection'

// Aktif Görevler — aktif fazın çıktısını önplanda tutan görev yüzeyi.
// Alışkanlıklar ile aynı Life DB + tasarım dili (sidebar'da onun hemen altında).
export default async function GorevlerPage() {
  // İstanbul günü — "Bugün/Gecikti" çipleri gece yarısı UTC kaymasın.
  const today = getIstanbulDateAndDay().todayStr
  const { tasks, source } = await loadActiveTasks(createServerSupabase())
  return (
    <div className="pt-8">
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-20">
        <ActiveTasksSection initialTasks={tasks} source={source} today={today} />
      </div>
    </div>
  )
}
