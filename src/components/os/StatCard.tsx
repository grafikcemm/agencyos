import { StatusBadge } from './StatusBadge'

interface StatCardProps {
  abbr: string
  title: string
  value: string | number
  statusText?: string
  statusVariant?: 'success' | 'warning' | 'error' | 'neutral' | 'cyan'
}

export function StatCard({ abbr, title, value, statusText, statusVariant = 'neutral' }: StatCardProps) {
  return (
    <div className="os-card p-5 relative overflow-hidden flex flex-col justify-between h-32 group hover:border-[var(--border-bright)] transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 text-[var(--os-cyan)]">
          <span className="text-xs font-bold tracking-widest">[{abbr}]</span>
        </div>
        {statusText && (
          <StatusBadge text={statusText} variant={statusVariant} />
        )}
      </div>
      
      <div>
        <div className="text-[10px] text-[var(--text-secondary)] tracking-[0.15em] mb-1 font-bold uppercase">{title}</div>
        <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">{value}</div>
      </div>

      {/* Decorative corner accent */}
      <div className="absolute -bottom-4 -right-4 w-12 h-12 border border-[var(--border-color)] rounded-full opacity-20 group-hover:border-[var(--os-cyan)] transition-colors"></div>
    </div>
  )
}
