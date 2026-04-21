import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { Filter } from 'lucide-react'

export default function PipelinePage() {
  return (
    <div className="h-full flex flex-col p-6 font-mono bg-[var(--bg-base)]">
      
      {/* Top Bar Area */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-bold text-[var(--os-accent)] tracking-widest">// SATIŞ PİPELİNE</h2>
          <div className="text-[10px] bg-[#0a0d16] border border-[var(--border-color)] px-2 py-1 rounded-sm text-[var(--text-secondary)] font-bold tracking-widest">
            TÜM LEADLER (4)
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border-color)] bg-[#0a0d16] hover:bg-[#0f1420] transition-colors rounded-sm text-[10px] font-bold tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <Filter className="w-3.5 h-3.5" /> FİLTRELE
          </button>
          <button className="px-4 py-1.5 bg-[var(--os-accent)] text-[#050810] text-[10px] font-bold tracking-widest hover:bg-[var(--os-accent-hover)] transition-colors rounded-sm">
            + MANUEL EKLE
          </button>
        </div>
      </div>

      {/* Main Kanban Board */}
      <div className="flex-1 overflow-hidden min-h-0">
        <KanbanBoard />
      </div>

    </div>
  )
}
