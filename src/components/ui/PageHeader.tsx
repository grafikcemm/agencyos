import type { ReactNode } from 'react'

export interface PageHeaderProps {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  compact?: boolean
  className?: string
}

/** AgencyOS karar yüzeylerinin tek başlık ve sekme sözleşmesi. */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  tabs,
  compact = false,
  className = '',
}: PageHeaderProps) {
  return (
    <header className={`border-b border-[var(--border-subtle)] ${compact ? 'pb-4' : 'pb-6'} ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-eyebrow">{eyebrow}</span>
            {meta ? <span className="text-[10px] text-[var(--text-tertiary)]">{meta}</span> : null}
          </div>
          <h1 className={`${compact ? 'hero-title' : 'display-title'} mt-2 text-[var(--text-primary)]`}>{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-5 flex items-center gap-1 overflow-x-auto" role="tablist">{tabs}</div> : null}
    </header>
  )
}
