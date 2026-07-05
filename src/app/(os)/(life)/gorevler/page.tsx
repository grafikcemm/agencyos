export const dynamic = 'force-dynamic'

import { format } from 'date-fns'
import { loadActiveTasks } from '@/lib/activeTasks'
import { createServerSupabase } from '@/lib/supabaseServer'
import { ActiveTasksSection } from '@/components/tasks/ActiveTasksSection'

// Aktif Görevler — aktif fazın çıktısını önplanda tutan görev yüzeyi.
// Alışkanlıklar ile aynı Life DB + tasarım dili (sidebar'da onun hemen altında).
export default async function GorevlerPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { tasks, source } = await loadActiveTasks(createServerSupabase())
  return (
    <div className="pt-8">
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 pb-20">
        <ActiveTasksSection initialTasks={tasks} source={source} today={today} />
      </div>
    </div>
  )
}
