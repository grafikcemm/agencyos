export const dynamic = 'force-dynamic'

import { FinanceCommandCenter } from '@/components/finance/FinanceCommandCenter'
import { MoneyRulesPanel } from '@/components/finance/MoneyRulesPanel'
import { getCurrentFinanceMonth } from '@/lib/finance/financeData'
import { loadFinanceMonth } from '@/lib/finance/loadFinanceMonth'

export default async function FinansPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const resolvedParams = await searchParams
  const rawMonth = resolvedParams.fmonth
  const candidate = (Array.isArray(rawMonth) ? rawMonth[0] : rawMonth) ?? ''
  // yyyy-MM doğrula; geçersizse içinde bulunulan aya düş (sessizce yanlış veri göstermeyi önler)
  const fmonth = /^\d{4}-\d{2}$/.test(candidate) ? candidate : getCurrentFinanceMonth()
  const financeData = await loadFinanceMonth(fmonth)
  return (
    <div className="pt-8">
      <FinanceCommandCenter data={financeData} month={fmonth} />
      <MoneyRulesPanel />
    </div>
  )
}
