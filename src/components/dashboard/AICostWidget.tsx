"use client"

import { useEffect, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'

export function AICostWidget() {
  const [costs, setCosts] = useState<any>({ light: 0, medium: 0, heavy: 0, total: 0 })
  const [budget, setBudget] = useState(100)

  useEffect(() => {
    const fetchCosts = async () => {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const costRes = await fetch('/api/db/ai_cost_logs')
      const data = await costRes.json()
      
      const setRes = await fetch('/api/db/settings')
      const settingsData = await setRes.json()
      
      const budgetSetting = settingsData?.find((s: any) => s.key === 'ai_monthly_budget_tl')
      if (budgetSetting?.value) setBudget(parseInt(budgetSetting.value))

      if (Array.isArray(data)) {
        // Filter by date manually since we didn't add date filtering to generic proxy yet
        const startISO = startOfMonth.toISOString()
        const breakdown = data.filter((log: any) => log.created_at >= startISO).reduce((acc: any, log: any) => {
          const tier = (log.model_tier || 'light').toLowerCase()
          acc[tier] = (acc[tier] || 0) + (log.cost_tl || 0)
          acc.total += (log.cost_tl || 0)
          return acc
        }, { light: 0, medium: 0, heavy: 0, total: 0 })
        setCosts(breakdown)
      }
    }
    fetchCosts()
  }, [])


  const progress = budget > 0 ? (costs.total / budget) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <h3 className="label-eyebrow">AI Maliyeti</h3>
        <span className="num lira text-[11px] font-bold text-[var(--text-primary)]">₺{costs.total.toFixed(2)} / ₺{budget}</span>
      </div>
      <ProgressBar progress={progress} />
      
      <div className="space-y-2 mt-4">
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--text-secondary)]">Light Tasks</span>
          <span className="text-[var(--text-primary)] font-medium">₺{costs.light.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--text-secondary)]">Medium Tasks</span>
          <span className="text-[var(--text-primary)] font-medium">₺{costs.medium.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--text-secondary)]">Heavy Tasks</span>
          <span className="text-[var(--text-primary)] font-medium">₺{costs.heavy.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
