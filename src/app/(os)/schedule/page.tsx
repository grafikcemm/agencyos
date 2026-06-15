"use client"

import { CalendarClock, Search, Compass, Repeat, Info } from 'lucide-react'

interface ScheduledJob {
  name: string
  description: string
  nextRun: string
  cron: string
  icon: typeof CalendarClock
}

const JOBS: ScheduledJob[] = [
  {
    name: 'Günlük Lead Tarama',
    description: 'Her gün sabah 08:00 (TR) yeni leadleri otomatik olarak tarar ve sıralar.',
    nextRun: 'Her gün 08:00 TR',
    cron: '0 5 * * *',
    icon: Search
  },
  {
    name: 'Fırsat Tarama',
    description: 'Pazartesi sabahları sektörel fırsatları ve sıcak pencereleri analiz eder.',
    nextRun: 'Her Pazartesi 09:00 TR',
    cron: '0 6 * * 1',
    icon: Compass
  },
  {
    name: 'Ajan Tick (Kuyruk İşleme)',
    description: 'Görev kuyruğunu her 10 dakikada bir işler; bekleyen görevleri uzman ajanlara dağıtır.',
    nextRun: 'Her 10 dakikada bir',
    cron: '*/10 * * * *',
    icon: Repeat
  }
]

export default function SchedulePage() {
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)] p-6 scrollbar-thin">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="label-eyebrow">
            Zamanlanmış Ajan İşleri
          </h2>
        </div>

        <div className="space-y-3">
          {JOBS.map(job => {
            const Icon = job.icon
            return (
              <div
                key={job.name}
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex items-start gap-4 hover:border-[var(--border-highlight)] transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[var(--accent)]" />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">{job.name}</h3>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-400 text-[9px] font-black tracking-wider uppercase shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aktif
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">{job.description}</p>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide uppercase">
                      {job.nextRun}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-muted)] rounded px-2 py-0.5">
                      {job.cron}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-start gap-2.5 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 leading-relaxed font-medium italic">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Kullanıcı tarafından zamanlanan özel direktifler yakında eklenecek bir özelliktir. Şu an için tüm zamanlamalar sistem tarafından yönetilmektedir.
        </div>

      </div>
    </div>
  )
}
