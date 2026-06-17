'use client'

import { AlertTriangle, Globe2, Zap } from 'lucide-react'
import { TURKEY_GAP_ANALYSIS, type TurkeyGapItem } from '@/lib/opportunityIntelligenceEngine'

const POTENTIAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-[var(--success)]/10', text: 'text-[var(--success)]', label: 'Yüksek' },
  medium: { bg: 'bg-[var(--warning)]/10', text: 'text-[var(--warning)]', label: 'Orta' },
  low: { bg: 'bg-[var(--bg-elevated)]', text: 'text-[var(--text-secondary)]', label: 'Düşük' }
}

const DIFFICULTY_STYLES: Record<string, { label: string; color: string }> = {
  high: { label: 'Zor', color: 'var(--danger)' },
  medium: { label: 'Orta', color: 'var(--warning)' },
  low: { label: 'Kolay', color: 'var(--success)' }
}

function GapCard({ gap }: { gap: TurkeyGapItem }) {
  const pot = POTENTIAL_STYLES[gap.potential] ?? POTENTIAL_STYLES.low
  const diff = DIFFICULTY_STYLES[gap.difficulty] ?? DIFFICULTY_STYLES.medium

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col gap-3 hover:border-[var(--accent)]/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-black text-[var(--text-primary)] leading-tight">{gap.area}</h3>
          <p className="text-[10px] font-medium text-[var(--text-muted)] mt-0.5">{gap.global_equivalent}</p>
        </div>
        <Globe2 className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
      </div>

      {/* Why */}
      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-3">
        {gap.why}
      </p>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${pot.bg} ${pot.text}`}>
          <Zap className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
          {pot.label} Potansiyel
        </span>
        <span
          className="text-[9px] font-bold px-2 py-1 rounded-md border border-[var(--border-subtle)]"
          style={{ color: diff.color }}
        >
          <AlertTriangle className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
          {diff.label}
        </span>
      </div>
    </div>
  )
}

export function TurkeyGapCards() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe2 className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-black uppercase tracking-wider text-[var(--text-primary)]">
          Türkiye Fırsat Açığı Haritası
        </h2>
        <span className="text-[10px] font-black bg-[var(--bg-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
          {TURKEY_GAP_ANALYSIS.length}
        </span>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] -mt-1">
        Global servislerin Türkiye&apos;de bulunmadığı veya zayıf olduğu alanlar.
        Ürün fikirlerini bu açıklar üzerinden doğrulamak için kullan.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {TURKEY_GAP_ANALYSIS.map(gap => (
          <GapCard key={gap.id} gap={gap} />
        ))}
      </div>
    </div>
  )
}
