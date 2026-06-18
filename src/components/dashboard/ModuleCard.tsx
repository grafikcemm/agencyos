import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type SpotlightColor = 'violet' | 'magenta' | 'orange' | 'coral'

interface ModuleCardProps {
  number: string
  title: string
  description: string
  badge: string
  href: string
  /** Seçili modülü Framer gradient spotlight tile'ı olarak öne çıkar (seyrek). */
  spotlight?: SpotlightColor
}

export function ModuleCard({ number, title, description, badge, href, spotlight }: ModuleCardProps) {
  return (
    <Link href={href} className="group">
      <div
        className={cn(
          'p-6 h-full transition-all duration-200 flex flex-col relative',
          spotlight
            ? `gradient-spotlight gradient-spotlight-${spotlight} [&>*]:relative [&>*]:z-10`
            : 'bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--border-highlight)]',
        )}
      >
        <div className="flex justify-between items-start mb-5">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{number}</span>
          <div className="w-7 h-7 rounded-full bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-center group-hover:border-[var(--border-highlight)] transition-all">
            <ArrowUpRight className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
          </div>
        </div>

        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent)] transition-colors">{title}</h3>
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)] mb-6 flex-1">{description}</p>

        <div className="mt-auto">
          <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--accent-muted)] px-2.5 py-1 rounded-lg uppercase tracking-widest">
            {badge}
          </span>
        </div>
      </div>
    </Link>
  )
}
