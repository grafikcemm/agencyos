'use client'

// Faz 4.9 — "gir-hallet-çık" metriği: bugün kokpitte GERÇEKTEN harcanan süre
// (sekme görünürken sayan yerel sayaç; gün-anahtarlı localStorage) + bugün
// TAMAMLANAN gelir aksiyonları (server audit sayımı — iddia değil kayıt).

import { useEffect, useState } from 'react'
import { Timer, CheckCircle2, Mail, BadgeCheck } from 'lucide-react'
import type { OpsMetrics } from '@/lib/cockpit/today'

const STORE_KEY = 'bugun-active-seconds'
const TICK_MS = 5_000

function dayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function readSeconds(): number {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { day: string; seconds: number }
    return parsed.day === dayKey() ? parsed.seconds : 0
  } catch {
    return 0
  }
}

function writeSeconds(seconds: number) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ day: dayKey(), seconds }))
  } catch {
    /* storage kapalıysa sayaç yalnız oturum-içi çalışır */
  }
}

export function OpsMetricsBar({ metrics, error }: { metrics: OpsMetrics | null; error: string | null }) {
  const [seconds, setSeconds] = useState<number | null>(null)

  useEffect(() => {
    setSeconds(readSeconds())
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setSeconds((prev) => {
        const next = (prev ?? readSeconds()) + TICK_MS / 1000
        writeSeconds(next)
        return next
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const mins = seconds === null ? null : Math.floor(seconds / 60)
  const timeLabel =
    mins === null ? '—' : mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)} sa ${mins % 60} dk`

  return (
    <div
      data-testid="ops-metrics"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)]"
    >
      <span className="flex items-center gap-1" title="Bugün kokpitte geçen aktif süre (bu tarayıcı)">
        <Timer className="w-3.5 h-3.5 text-[var(--accent)]" />
        Bugün kokpitte: <b className="text-[var(--text-primary)]">{timeLabel}</b>
      </span>
      {error ? (
        <span className="text-red-400">Aksiyon metriği yüklenemedi: {error}</span>
      ) : metrics ? (
        <>
          <span className="flex items-center gap-1" title="Bugün audit'e yazılan lead aksiyonları">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Gelir aksiyonu: <b className="text-[var(--text-primary)]">{metrics.totalActions}</b>
          </span>
          <span className="flex items-center gap-1">
            <BadgeCheck className="w-3.5 h-3.5 text-amber-400" />
            Onaya alınan: <b className="text-[var(--text-primary)]">{metrics.approvalsRequested}</b>
          </span>
          <span className="flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-sky-400" />
            Gönderilen: <b className="text-[var(--text-primary)]">{metrics.emailsSent}</b>
          </span>
        </>
      ) : null}
    </div>
  )
}
