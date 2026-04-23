"use client"

import { useState, useEffect } from 'react'
import { MoreHorizontal, Calendar, MapPin, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LeadModal } from './LeadModal'

const COLUMNS = [
  { id: 'new', title: 'YENİ LEAD', color: '#06b6d4' },
  { id: 'contacted', title: 'İLETİŞİM KURULDU', color: '#f59e0b' },
  { id: 'responded', title: 'YANIT VERDİ', color: '#8b5cf6' },
  { id: 'meeting', title: 'TOPLANTI', color: '#3b82f6' },
  { id: 'proposal', title: 'TEKLİF', color: '#f97316' },
  { id: 'converted', title: 'KAZANILDI', color: '#10b981' },
]

const STATUS_MAP: Record<string, string> = {
  'new': 'new', 'yeni': 'new',
  'contacted': 'contacted', 'iletişim': 'contacted',
  'responded': 'responded', 'replied': 'responded', 'yanıt': 'responded', 'yanıt verdi': 'responded',
  'meeting': 'meeting', 'toplantı': 'meeting',
  'proposal': 'proposal', 'teklif': 'proposal',
  'converted': 'converted', 'won': 'converted', 'kazanıldı': 'converted',
  'lost': 'lost', 'kaybedildi': 'lost'
}

export function KanbanBoard() {
  const [leads, setLeads] = useState<any[]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)

  const fetchLeads = async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (data) {
      console.log('Tüm lead status değerleri:', data.map(l => l.status))
      setLeads(data)
    }
  }

  useEffect(() => {
    fetchLeads()
  }, [])

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() 
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, statusColumn: string) => {
    e.preventDefault()
    if (!draggedId) return

    setLeads(prev => prev.map(lead => 
      lead.id === draggedId ? { ...lead, status: statusColumn } : lead
    ))
    const currentDraggedId = draggedId
    setDraggedId(null)
    
    await supabase.from('leads').update({ status: statusColumn }).eq('id', currentDraggedId)
  }

  const handleBatchAnalyze = async () => {
    const leadsToAnalyze = leads
      .filter(l => !l.ai_analysis)
      .slice(0, 10)
      .map(l => l.id)

    if (leadsToAnalyze.length === 0) {
      alert("Analiz edilecek yeni lead bulunamadı.")
      return
    }

    setBatchLoading(true)
    try {
      const res = await fetch('/api/leads/batch-analyze', {
        method: 'POST',
        body: JSON.stringify({ lead_ids: leadsToAnalyze })
      })
      if (res.ok) {
        fetchLeads()
      }
    } catch (e) {
      console.error(e)
    }
    setBatchLoading(false)
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Batch Control */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleBatchAnalyze}
            disabled={batchLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm border border-amber-500/30 text-amber-500 text-[11px] font-bold tracking-widest uppercase transition-all ${
              batchLoading ? 'opacity-50 cursor-wait' : 'hover:bg-amber-500/10 hover:border-amber-500/50'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${batchLoading ? 'animate-pulse' : ''}`} />
            {batchLoading ? 'ANALİZ EDİLİYOR...' : '⚡ TÜMÜNÜ ANALİZ ET (MAX 10)'}
          </button>
          
          <div className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">
            SİSTEM: <span className="text-[var(--os-cyan)]">HAZIR</span> • 
            BEKLEYEN: <span className="text-amber-500">{leads.filter(l => !l.ai_analysis).length}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 h-full overflow-x-auto pb-4 custom-scrollbar items-start">
        {COLUMNS.map(col => {
          const columnLeads = leads
            .filter(l => {
              const normalizedStatus = STATUS_MAP[l.status?.toLowerCase()] || l.status
              return normalizedStatus === col.id
            })
            .sort((a, b) => {
              const priorityOrder: Record<string, number> = { high: 3, normal: 2, low: 1 }
              const aPrio = priorityOrder[a.priority || 'normal']
              const bPrio = priorityOrder[b.priority || 'normal']
              if (aPrio !== bPrio) return bPrio - aPrio
              return b.potential_score - a.potential_score
            })
          
          return (
            <div 
              key={col.id} 
              className="w-[280px] shrink-0 bg-[#0a0d16] border border-[var(--border-color)] rounded-sm flex flex-col max-h-full"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Sütun Başlığı */}
              <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between sticky top-0 bg-[#0a0d16] z-10">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: col.color }}></div>
                  <h3 className="text-[11px] font-bold tracking-widest text-[var(--text-primary)]">{col.title}</h3>
                </div>
                <div className="text-[9px] text-[var(--text-muted)] font-bold">{columnLeads.length}</div>
              </div>

              {/* İçerik / Kartlar */}
              <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar min-h-[150px]">
                {columnLeads.map(lead => (
                  <div 
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onClick={() => setSelectedLead(lead)}
                    className={`bg-[#050810] border p-3 rounded-sm cursor-pointer transition-colors group relative ${
                      lead.priority === 'high' ? 'border-amber-500/50 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]' : 'border-[var(--border-color)] hover:border-[var(--border-bright)]'
                    }`}
                  >
                    {lead.priority === 'high' && (
                      <div className="mb-2.5 flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-sm text-amber-500 text-[8px] font-bold tracking-widest uppercase" title="Web sitesi yok, telefonu var">
                        <Zap className="w-2.5 h-2.5 fill-amber-500" />
                        ⚡ YÜKSEK ÖNCELİK
                      </div>
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-[11px] font-bold text-[var(--text-primary)] truncate pr-4">{lead.business_name}</h4>
                      <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 border border-[var(--border-bright)] bg-[#0a0d16] rounded-sm text-[var(--text-secondary)]">
                        {lead.sector || 'Sektör Yok'}
                      </span>
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 border border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444] rounded-sm">
                        {lead.potential_score || 0} OBP
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[var(--text-muted)] mt-2 pt-2 border-t border-[var(--border-color)]">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span className="text-[9px] tracking-wider">{lead.city || 'Bilinmiyor'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[9px] tracking-wider">{new Date(lead.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                    
                    {/* Hover glow line */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity rounded-l-sm" style={{ backgroundColor: col.color }}></div>
                  </div>
                ))}
                
                {/* Ekle Butonu */}
                <button className="w-full py-2 border border-dashed border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-bright)] text-[10px] font-bold tracking-widest rounded-sm transition-colors text-center bg-transparent">
                  + YENİ EKLE
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {selectedLead && (
        <LeadModal 
          lead={selectedLead} 
          onClose={() => setSelectedLead(null)} 
          onUpdate={fetchLeads} 
        />
      )}
    </div>
  )
}
