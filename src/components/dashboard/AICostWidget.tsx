"use client"

import { useEffect, useState } from 'react'
import { ProgressBar } from '@/components/ui/ProgressBar'

interface CostBreakdown {
  light: number
  medium: number
  heavy: number
  total: number
}

export function AICostWidget() {
  const [costs, setCosts] = useState<CostBreakdown>({ light: 0, medium: 0, heavy: 0, total: 0 })
  const [budget, setBudget] = useState(100)

  useEffect(() => {
    const fetchCosts = async () => {
      try {
        // Server-side aggregate (M11) — eskiden tüm satırlar cliente çekiliyordu.
        const res = await fetch('/api/metrics/ai-cost')
        if (!res.ok) return
        const data = (await res.json()) as CostBreakdown & { budget?: number }
        setCosts({ light: data.light, medium: data.medium, heavy: data.heavy, total: data.total })
        if (data.budget && data.budget > 0) setBudget(data.budget)
      } catch {
        console.error('AI cost fetch error')
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
