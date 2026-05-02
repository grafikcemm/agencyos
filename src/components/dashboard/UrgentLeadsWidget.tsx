"use client"

import React, { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'

function ScoreBadge({ score }: { score: number }) {
  if (score >= 70) {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#A32D2D]/20 text-[#FF6B6B] border border-[#A32D2D]/30">
        {score}
      </span>
    )
  }
  if (score >= 50) {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#BA7517]/20 text-[#F5A623] border border-[#BA7517]/30">
        {score}
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/30">
      {score}
    </span>
  )
}

export function UrgentLeadsWidget() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    const fetchUrgentLeads = async () => {
      const res = await fetch('/api/db/leads?limit=3&order=score&asc=false')
      const data = await res.json()

      if (Array.isArray(data)) {
        const filtered = data.filter((l: any) =>
          !['converted', 'lost'].includes(l.status)
        )
        setLeads(filtered)
      }
    }
    fetchUrgentLeads()
  }, [])

  if (leads.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="label-eyebrow flex items-center gap-2 text-[var(--danger)]">
        <AlertCircle className="w-3 h-3" /> Acil Leads
      </h3>
      <div className="space-y-1.5">
        {leads.map(lead => (
          <div
            key={lead.id}
            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors group cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
          >
            <span className="text-[12px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[120px]">
              {lead.business_name}
            </span>
            <ScoreBadge score={lead.score || 0} />
          </div>
        ))}
      </div>
    </div>
  )
}
