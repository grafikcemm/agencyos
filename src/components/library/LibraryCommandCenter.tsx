'use client'

import { BookOpen, CheckCircle, StickyNote, Zap, Target } from 'lucide-react'

interface Props {
  totalBooks: number
  completedCount: number
  notesThisMonth: number
  actionsThisMonth: number
  weeklyGoalPages: number
  activeBookTitle?: string
  nextBookTitle?: string
}

export function LibraryCommandCenter({
  totalBooks,
  completedCount,
  notesThisMonth,
  actionsThisMonth,
  weeklyGoalPages,
  activeBookTitle,
  nextBookTitle,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-pill bg-cat-purple/15 border border-cat-purple/30 flex items-center justify-center shrink-0">
          <BookOpen size={13} className="text-cat-purple" strokeWidth={1.5} />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-bold">Kütüphane Komuta Merkezi</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<BookOpen size={14} />} label="Toplam Kitap" value={totalBooks} />
        <StatCard icon={<CheckCircle size={14} />} label="Tamamlanan" value={completedCount} accent />
        <StatCard icon={<StickyNote size={14} />} label="Bu Ay Not" value={notesThisMonth} />
        <StatCard icon={<Zap size={14} />} label="Bu Ay Aksiyon" value={actionsThisMonth} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-4 shadow-soft">
          <div className="flex items-center gap-2 mb-2">
            <Target size={12} className="text-cat-purple" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Aktif Kitap</span>
          </div>
          <p className="text-[var(--text-primary)] text-sm font-medium">
            {activeBookTitle ?? <span className="text-[var(--text-muted)]">Aktif kitap yok</span>}
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-4 shadow-soft">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={12} className="text-[var(--border-strong)]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Sıradaki</span>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">
            {nextBookTitle ?? <span className="text-[var(--text-muted)]">—</span>}
          </p>
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-4 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">Haftalık Okuma Hedefi</span>
          <span className="text-cat-purple text-xs font-mono">{weeklyGoalPages} sayfa</span>
        </div>
        <p className="text-[var(--text-muted)] text-xs">Aynı anda sadece 1 aktif ana kitap. Bitmeden sıradakine geçme.</p>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-3 shadow-soft">
      <div className={`flex items-center gap-1.5 mb-2 ${accent ? 'text-cat-teal' : 'text-[var(--text-muted)]'}`}>
        {icon}
        <span className="text-[9px] font-mono uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-2xl font-mono font-bold ${accent ? 'text-cat-teal' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}
