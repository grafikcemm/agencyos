"use client"

import { useState, useEffect } from 'react'
import { MoreHorizontal, Calendar, MapPin, Zap } from 'lucide-react'
import { LeadModal } from './LeadModal'
import { Badge } from '@/components/ui/Badge'
import type { EnrichedLead } from '@/lib/enrichLead'

const COLUMNS = [
  { id: 'new', title: 'YENİ LEAD', color: '#378ADD' },
  { id: 'contacted', title: 'İLETİŞİM', color: '#BA7517' },
  { id: 'responded', title: 'YANIT', color: '#8B5CF6' },
  { id: 'meeting', title: 'TOPLANTI', color: '#3B82F6' },
  { id: 'proposal', title: 'TEKLİF', color: '#E8440A' },
  { id: 'converted', title: 'KAZANILDI', color: '#1D9E75' },
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
  const [leads, setLeads] = useState<EnrichedLead[]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<EnrichedLead | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)

  const fetchLeads = async () => {
    const res = await fetch('/api/db/leads?order=created_at&asc=false')
    const data = await res.json()
    if (Array.isArray(data)) {
      setLeads(data)
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchLeads()
    })
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
    
    await fetch('/api/db/leads', {
      method: 'PATCH',
      body: JSON.stringify({ id: currentDraggedId, status: statusColumn })
    })
  }


  const handleBatchAnalyze = async () => {
    const leadsToAnalyze = leads
      .filter(l => !l.ai_analysis)
      .slice(0, 10)
      .map(l => l.id)

    if (leadsToAnalyze.length === 0) return

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
    <div className="flex flex-col h-full gap-6">
      {/* Batch Control */}
      <div className="flex justify-between items-center px-1 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleBatchAnalyze}
            disabled={batchLoading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] text-[11px] font-bold uppercase transition-all ${
              batchLoading ? 'opacity-50 cursor-wait' : 'hover:bg-[var(--accent)] hover:text-white'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${batchLoading ? 'animate-pulse' : ''}`} />
            {batchLoading ? 'Analiz Ediliyor...' : 'Tümünü Analiz Et (MAX 10)'}
          </button>
          
          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
            Bekleyen: <span className="text-[var(--accent)]">{leads.filter(l => !l.ai_analysis).length}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 h-full overflow-x-auto pb-4 custom-scrollbar items-start min-h-0">
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
              return (b.quality_score || b.potential_score || 0) - (a.quality_score || a.potential_score || 0)
            })
          
          return (
            <div 
              key={col.id} 
              className="w-[280px] shrink-0 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg flex flex-col max-h-full"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Sütun Başlığı */}
              <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between sticky top-0 bg-[var(--bg-base)] z-10 rounded-t-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }}></div>
                  <h3 className="text-[11px] font-bold tracking-widest text-[var(--text-primary)] uppercase">{col.title}</h3>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] font-bold bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                  {columnLeads.length}
                </div>
              </div>

              {/* İçerik / Kartlar */}
              <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar min-h-[150px]">
                {columnLeads.map(lead => (
                  <div 
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onClick={() => setSelectedLead(lead)}
                    className={`bg-[var(--bg-surface)] border p-3 rounded-lg cursor-pointer transition-all group relative hover:border-[var(--accent)] hover:shadow-md ${
                      lead.priority === 'high' ? 'border-[var(--accent)]/30' : 'border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-[12px] font-bold text-[var(--text-primary)] truncate pr-4">{lead.business_name}</h4>
                      <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge variant="muted">{lead.sector || 'Sektör Yok'}</Badge>
                      <Badge variant={(lead.quality_score || lead.potential_score) >= 60 ? 'success' : 'default'}>
                        {lead.quality_score || lead.potential_score || 0} OBP
                      </Badge>
                      {lead.priority === 'high' && <Badge variant="warning">YÜKSEK</Badge>}
                    </div>

                    <div className="flex items-center justify-between text-[var(--text-muted)] mt-2 pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span className="text-[10px] tracking-wider">{lead.city || 'Bilinmiyor'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[10px] tracking-wider">{new Date(lead.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                  </div>
                ))}
                
                <button className="w-full py-2 border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] text-[11px] font-bold tracking-widest rounded-lg transition-colors text-center bg-transparent">
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
