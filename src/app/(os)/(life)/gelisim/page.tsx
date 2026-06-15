export const dynamic = 'force-dynamic'

import { format } from 'date-fns'
import { GrowthPage } from '@/components/growth/GrowthPage'
import { getDailyV2 } from '@/app/actions/dailyV2'

export default async function GelisimPage() {
  const dailyV2Data = await getDailyV2(format(new Date(), 'yyyy-MM-dd'))
  return (
    <div className="pt-8">
      <GrowthPage uiMode={dailyV2Data?.ui_mode || 'denge'} />
    </div>
  )
}
