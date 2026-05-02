"use client"

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Calendar } from 'lucide-react'

export function FollowUpWidget() {
  const [followUps, setFollowUps] = useState<any[]>([])

  useEffect(() => {
    const fetchFollowUps = async () => {
      const res = await fetch('/api/db/follow_ups?order=follow_up_date&asc=true')
      const data = await res.json()
      if (Array.isArray(data)) {
        setFollowUps(data)
      }
    }
    fetchFollowUps()
  }, [])


  return (
    <div className="space-y-4">
      <h3 className="label-eyebrow flex items-center gap-2">
        <Calendar className="w-3 h-3" /> Takvim
      </h3>
      
      <div className="space-y-3">
        {followUps.length > 0 ? (
          followUps.map((item) => (
            <div key={item.id} className="p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg space-y-2">
              <div className="flex justify-between items-start gap-2">
                <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                  {item.leads?.business_name || 'Bilinmeyen'}
                </span>
                <Badge variant={item.priority === 'high' ? 'danger' : 'default'} className="shrink-0">
                  {item.priority}
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{item.note}</p>
              <div className="text-[10px] text-[var(--text-muted)] font-medium">
                {new Date(item.follow_up_date).toLocaleDateString('tr-TR')}
              </div>
            </div>
          ))
        ) : (
          <div className="text-[11px] text-[var(--text-muted)] italic">Aktif takip yok.</div>
        )}
      </div>
    </div>
  )
}
