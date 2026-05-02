import React from 'react'
import { ArrowUpRight } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  statusText?: string
  trendText?: string
  trendDown?: boolean
}

function CurrencyValue({ value }: { value: string }) {
  if (!value.includes('₺')) return <>{value}</>
  const parts = value.split('₺')
  return (
    <>
      {parts.map((part, i) =>
        i === 0 ? part : (
          <React.Fragment key={i}>
            <span className="lira">₺</span>{part}
          </React.Fragment>
        )
      )}
    </>
  )
}

export function MetricCard({ title, value, statusText, trendText, trendDown }: MetricCardProps) {
  return (
    <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] transition-all group">
      <div className="flex justify-between items-start mb-5">
        <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{title}</span>
        <button className="w-8 h-8 rounded-full bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-center group-hover:border-[var(--border-highlight)] transition-all shrink-0">
          <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        </button>
      </div>

      <div className="text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-none mb-4">
        <CurrencyValue value={value} />
      </div>

      <div className="flex items-center justify-between">
        {statusText && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
            <span className="text-[11px] text-[var(--text-muted)]">{statusText}</span>
          </div>
        )}
        {trendText && (
          <span className={`text-[11px] font-semibold ${trendDown ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
            {trendDown ? '↓' : '↑'} {trendText}
          </span>
        )}
      </div>
    </div>
  )
}
