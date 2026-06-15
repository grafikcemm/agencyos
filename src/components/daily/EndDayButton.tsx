'use client'

import React, { useState } from 'react'
import { finalizeDay } from '@/app/actions/endDayActions'
import { fireDayCompleteConfetti } from '@/lib/confetti'
import { cn } from '@/utils/cn'

interface EndDayButtonProps {
  score: number
  totalPossible?: number
  isAlreadyFinalized: boolean
}

export function EndDayButton({ score, totalPossible = 80, isAlreadyFinalized }: EndDayButtonProps) {
  const [isDone, setIsDone] = useState(isAlreadyFinalized)
  const [result, setResult] = useState<{
    newStreak: number
    streakBroken: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleEndDay() {
    setLoading(true)
    try {
      const res = await finalizeDay(score, totalPossible)
      setResult(res)
      setIsDone(true)
      if (!res.streakBroken) {
        fireDayCompleteConfetti()
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  if (isDone && result?.streakBroken) {
    return (
      <div className="w-full h-14 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-[16px] flex flex-col items-center justify-center animate-in fade-in duration-500">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">⚠️ Seri kırıldı</p>
        <p className="text-[var(--text-tertiary)] text-[10px] font-bold tracking-widest uppercase mt-0.5">YENİ SERİ BAŞLIYOR. YARIN DEVAM ET.</p>
      </div>
    )
  }

  if (isDone) {
    return (
      <div className="w-full h-14 bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-[16px] flex flex-col items-center justify-center animate-in fade-in duration-500">
        <p className="text-[var(--success)] text-sm font-semibold uppercase tracking-tight">✓ GÜN TAMAMLANDI</p>
        {result && (
          <p className="text-[var(--success)]/70 text-[10px] mt-1 font-bold tracking-widest uppercase">
            {result.newStreak} GÜNLÜK SERİ 🔥
          </p>
        )}
        {isAlreadyFinalized && !result && (
          <p className="text-[var(--text-tertiary)] text-[10px] mt-1 font-bold uppercase tracking-widest">
            BUGÜN ZATEN KAYDEDİLDİ
          </p>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={handleEndDay}
      disabled={loading}
      className={cn(
        "w-full bg-[var(--accent)] text-white font-bold text-sm py-3.5 rounded-xl hover:bg-[var(--accent-hover)] transition-all cursor-pointer active:scale-[0.98] uppercase",
        loading && "opacity-50 cursor-wait"
      )}
    >
      {loading ? 'KAYDEDİLİYOR...' : 'GÜNÜ BİTİR'}
    </button>
  )
}
