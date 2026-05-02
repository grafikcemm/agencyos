"use client"

import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { Filter, Plus } from 'lucide-react'

export default function PipelinePage() {
  return (
    <div className="h-full overflow-hidden flex flex-col p-6 gap-5">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Müşteri Akışı</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Pipeline ve teklif süreçleri</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <Filter className="w-3.5 h-3.5" /> Filtrele
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-hover)] rounded-lg transition-all">
            <Plus className="w-3.5 h-3.5" /> Ekle
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl">
        <KanbanBoard />
      </div>
    </div>
  )
}
