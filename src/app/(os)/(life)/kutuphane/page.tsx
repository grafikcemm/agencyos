export const dynamic = 'force-dynamic'

import { format } from 'date-fns'
import { LibraryShell } from '@/components/library/LibraryShell'
import { getDailyV2 } from '@/app/actions/dailyV2'

export default async function KutuphanePage() {
  const dailyV2Data = await getDailyV2(format(new Date(), 'yyyy-MM-dd'))
  return (
    <div className="pt-8">
      <LibraryShell uiMode={dailyV2Data?.ui_mode || 'denge'} />
    </div>
  )
}
