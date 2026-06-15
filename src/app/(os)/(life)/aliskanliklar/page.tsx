export const dynamic = 'force-dynamic'

import { format } from 'date-fns'
import { getHabitsOverview } from '@/app/actions/habitActions'
import { HabitTracker } from '@/components/habits/HabitTracker'

// Alışkanlık Takibi — "zinciri kırma" sistemi. Hem yaşam hem iş alışkanlıkları.
export default async function AliskanliklarPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const items = await getHabitsOverview(today)
  return (
    <div className="pt-8">
      <HabitTracker items={items} today={today} />
    </div>
  )
}
