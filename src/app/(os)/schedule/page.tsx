"use client"

import { CalendarClock, Info, Zap } from 'lucide-react'
import { CRON_MANIFEST, CRON_REQUIRES_SUB_DAILY_SCHEDULER } from '@/lib/cron/manifest'

// Zamanlanmış işler artık KANONİK manifest'ten (src/lib/cron/manifest.ts) türer —
// GitHub Actions workflow ile parity CI testi (manifest.test.ts) garantidir. UI hiçbir
// "hayali sıklık" göstermez; gösterilen cron ifadesi GERÇEKTEN deploy edilendir.

export default function SchedulePage() {
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-base)] p-6 scrollbar-thin">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="label-eyebrow">Zamanlanmış Ajan İşleri</h2>
        </div>

        {CRON_REQUIRES_SUB_DAILY_SCHEDULER && (
          <div className="flex items-start gap-2.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 leading-relaxed font-medium">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            Uygulama Vercel Hobby’de ücretsiz barındırılır; sub-daily işler GitHub Actions scheduler’ı üzerinden çalışır.
            Vercel Pro gerekmez.
          </div>
        )}

        <div className="space-y-3">
          {CRON_MANIFEST.map((job, i) => (
            <div
              key={`${job.path}-${i}`}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex items-start gap-4 hover:border-[var(--border-highlight)] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                {job.slaCritical ? (
                  <Zap className="w-5 h-5 text-[var(--accent)]" />
                ) : (
                  <CalendarClock className="w-5 h-5 text-[var(--accent)]" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{job.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.slaCritical && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded border border-[var(--accent)]/30 text-[var(--accent)] text-[9px] font-black tracking-wider uppercase">
                        SLA
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-400 text-[9px] font-black tracking-wider uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aktif
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">{job.description}</p>
                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide uppercase">
                    {job.cadenceLabel}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--accent)] bg-[var(--accent-muted)] rounded px-2 py-0.5">
                    {job.schedule}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{job.path}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2.5 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 leading-relaxed font-medium italic">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Gösterilen cron ifadeleri GitHub Actions workflow ile birebir aynıdır (parity CI testi ile doğrulanır).
          Cron saatleri UTC yorumlanır; etiketlerdeki TR saatleri UTC+3’tür.
        </div>

      </div>
    </div>
  )
}
