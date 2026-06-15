export const dynamic = 'force-dynamic'

import { format } from 'date-fns'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { getUniversityData } from '@/app/actions/university'
import { getDailyV2 } from '@/app/actions/dailyV2'

export default async function AkademiPage() {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [beykent, aof, dailyV2Data] = await Promise.all([
    getUniversityData('beykent'),
    getUniversityData('aof'),
    getDailyV2(todayStr),
  ])
  return (
    <div className="pt-8">
      <AcademyShell beykentData={beykent} aofData={aof} uiMode={dailyV2Data?.ui_mode || 'denge'} />
    </div>
  )
}
