import React from 'react'
import Link from 'next/link'

interface HeroCardProps {
  agencyName: string
  monthlyRevenue: number
  targetRevenue: number
  hotLeadsCount: number
  pendingFollowUps: number
  weeklyRevenue?: number[]
}

export function HeroCard({
  agencyName,
  monthlyRevenue,
  targetRevenue,
  hotLeadsCount,
  pendingFollowUps,
  weeklyRevenue = [0, 0, 0, 0],
}: HeroCardProps) {
  const progress = Math.min((monthlyRevenue / targetRevenue) * 100, 100)
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const maxWeekly = Math.max(...weeklyRevenue, 1)

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl p-8 border border-[var(--border-subtle)]">
      <div className="flex justify-between items-start gap-8">
        {/* Left */}
        <div className="flex-1 min-w-0">
          <p className="label-eyebrow mb-0.5">{agencyName}</p>
          <p className="text-sm text-[var(--text-muted)] mb-6">{today}</p>

          <div className="mb-6">
            <p className="label-eyebrow mb-2">AYLIK GELİR HEDEFİ</p>
            <div className="text-[36px] font-bold text-[var(--text-primary)] tracking-tight leading-none">
              <span className="lira">₺</span>{monthlyRevenue.toLocaleString('tr-TR')}
              <span className="text-base font-normal text-[var(--text-muted)] ml-2">
                / <span className="lira">₺</span>{targetRevenue.toLocaleString('tr-TR')}
              </span>
            </div>
            <div className="mt-3 h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden max-w-sm">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-[var(--success)] font-medium mt-1 block">
              %{progress.toFixed(0)} tamamlandı
            </span>
          </div>

          <div className="flex gap-10">
            <div>
              <p className="label-eyebrow mb-1">SICAK LEAD</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{hotLeadsCount}</p>
            </div>
            <div>
              <p className="label-eyebrow mb-1">BEKLEYEN TAKİP</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{pendingFollowUps}</p>
            </div>
          </div>
        </div>

        {/* Right: bar chart + CTA */}
        <div className="hidden md:flex flex-col items-end gap-4 shrink-0">
          <div className="text-right">
            <p className="label-eyebrow mb-0.5">SON 4 HAFTA</p>
            <p className="text-[10px] text-[var(--text-muted)]">Gelir dağılımı</p>
          </div>

          <div className="flex items-end gap-2 h-16">
            {weeklyRevenue.map((val, i) => {
              const pct = Math.max((val / maxWeekly) * 100, 4)
              const isLast = i === weeklyRevenue.length - 1
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="relative w-8 h-14 flex items-end">
                    <div
                      className={`w-full rounded-md transition-all duration-700 ${isLast ? 'bg-[var(--accent)]' : 'bg-[var(--border-highlight)]'}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-[var(--text-muted)]">H{i + 1}</span>
                </div>
              )
            })}
          </div>

          <Link
            href="/pipeline"
            className="mt-2 bg-[var(--cta-bg)] hover:bg-[#e6e6e6] text-[var(--cta-fg)] px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            Pipeline&apos;ı Aç →
          </Link>
        </div>
      </div>
    </div>
  )
}
