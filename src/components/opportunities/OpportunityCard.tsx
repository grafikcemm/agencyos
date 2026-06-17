import { ArrowRight, Ban, CheckCircle2, Clock3, Gauge } from 'lucide-react'
import type { ComponentType } from 'react'
import { ACTION_TIER_LABELS, CATEGORY_LABELS, Opportunity } from '@/lib/opportunities'

const tierStyles: Record<Opportunity['actionTier'], string> = {
  launch_now: 'border-[var(--success)]/35 bg-[var(--success)]/10 text-[var(--success)]',
  next_bet: 'border-[var(--fire)]/35 bg-[var(--fire)]/10 text-[var(--fire)]',
  incubate: 'border-[var(--info)]/30 bg-[var(--info)]/10 text-[var(--info)]',
  park: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
}

export function OpportunityCard({ opp, onClick }: { opp: Opportunity, onClick: () => void }) {
  const scoreTone = opp.score.total >= 86
    ? 'text-[var(--success)]'
    : opp.score.total >= 76
      ? 'text-[var(--fire)]'
      : 'text-[var(--text-secondary)]'

  return (
    <button
      type="button"
      className="w-full text-left bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 rounded-lg p-4 flex flex-col gap-3 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${tierStyles[opp.actionTier]}`}>
              {ACTION_TIER_LABELS[opp.actionTier]}
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)]">
              {CATEGORY_LABELS[opp.category]}
            </span>
          </div>
          <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight mt-2">{opp.title}</h3>
        </div>
        <div className={`text-lg font-black leading-none ${scoreTone}`}>{opp.score.total}</div>
      </div>

      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
        {opp.decision}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Metric icon={Gauge} label="Netlik" value={opp.score.actionClarity} />
        <Metric icon={Clock3} label="Hız" value={opp.score.speedToLaunch} />
        <Metric icon={CheckCircle2} label="Kitle" value={opp.score.audienceFit} />
      </div>

      <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
        <div className="flex items-start gap-2">
          <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
          <span className="text-[12px] font-bold text-[var(--text-primary)] leading-snug">{opp.nextAction}</span>
        </div>
        <div className="flex items-start gap-2">
          <Ban className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
          <span className="text-[11px] text-[var(--text-muted)] leading-snug">{opp.antiDistractionRule}</span>
        </div>
      </div>
    </button>
  )
}

function Metric({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>, label: string, value: number }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 min-w-0">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <Icon className="w-3 h-3" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-[12px] font-black text-[var(--text-primary)] mt-0.5">{value}</div>
    </div>
  )
}
