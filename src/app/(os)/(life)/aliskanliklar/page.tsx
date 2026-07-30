export const dynamic = 'force-dynamic'

import { getHabitsOverview } from '@/app/actions/habitActions'
import { getIstanbulDateAndDay } from '@/lib/assistant/timezone'
import { HabitTracker } from '@/components/habits/HabitTracker'
import LifeMovedNotice from '@/components/life/LifeMovedNotice'
import { showsLifeUi } from '@/lib/lifeFlags'

// Alışkanlık Takibi — "zinciri kırma" sistemi. Hem yaşam hem iş alışkanlıkları.
export default async function AliskanliklarPage() {
  // SAHIPLIK KAPISI (RT-A2) — bkz. gorevler/page.tsx.
  if (!showsLifeUi()) {
    return <LifeMovedNotice title="Alışkanlıklar" hint="Hayat Merkezi → Alışkanlıklar sekmesi." />
  }
  // Server UTC değil, İstanbul günü — gece 00:00-03:00 kaymasını önler.
  const today = getIstanbulDateAndDay().todayStr
  const items = await getHabitsOverview(today)
  return (
    <div className="pt-8">
      <HabitTracker items={items} today={today} />
    </div>
  )
}
