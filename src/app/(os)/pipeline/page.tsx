"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Phone, Mail, Calendar, Star, ChevronRight, TrendingUp, AlertTriangle, Clock, Flame, FileText, Wallet } from 'lucide-react'
import { LeadDrawer } from '@/components/map/LeadDrawer'
import { enrichLead, EnrichedLead } from '@/lib/enrichLead'

const COLUMNS = [
  { id: 'new', title: 'YENİ', color: '#378ADD', icon: Star },
  { id: 'contacted', title: 'İLETİŞİM', color: '#BA7517', icon: Phone },
  { id: 'responded', title: 'YANIT', color: '#8B5CF6', icon: Mail },
  { id: 'meeting', title: 'TOPLANTI', color: '#3B82F6', icon: Calendar },
  { id: 'proposal', title: 'TEKLİF', color: '#E8440A', icon: ChevronRight },
  { id: 'converted', title: 'KAZANILDI', color: '#1D9E75', icon: TrendingUp },
]

function formatTL(n: number): string {
  if (!n) return '₺0'
  if (n >= 1000) return '₺' + Math.round(n / 1000) + 'k'
  return '₺' + n
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<EnrichedLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EnrichedLead | null>(null)

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/db/leads?order=potential_score')
      const data = await res.json()
      const raws = Array.isArray(data) ? data : []
      setLeads(raws.map((r) => enrichLead(r as Parameters<typeof enrichLead>[0])))
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadLeads()
    })
  }, [loadLeads])

  const getColumnLeads = (columnId: string) =>
    leads
      .filter(l => l.status === columnId)
      .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newStatus = destination.droppableId

    setLeads(prev => prev.map(l => l.id === draggableId
      ? enrichLead({ ...l, status: newStatus, stage_entered_at: new Date().toISOString() })
      : l))

    try {
      await fetch('/api/db/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draggableId, status: newStatus })
      })
    } catch {
      loadLeads()
    }
  }

  const summary = useMemo(() => {
    const today = leads.filter(l => (l.next_action_priority === 'call_now' || l.next_action_priority === 'send_audit') && l.status !== 'converted' && l.status !== 'lost').length
    const hot = leads.filter(l => l.lead_tier === 'A').length
    const proposals = leads.filter(l => l.status === 'proposal').length
    const overdue = leads.filter(l => l.nextAction.isOverdue).length
    const potentialMRR = leads
      .filter(l => l.status !== 'lost' && l.status !== 'converted')
      .reduce((s, l) => s + (l.estimated_monthly_value || 0), 0)
    const wonMRR = leads
      .filter(l => l.status === 'converted')
      .reduce((s, l) => s + (l.estimated_monthly_value || 0), 0)
    return { today, hot, proposals, overdue, potentialMRR, wonMRR }
  }, [leads])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[var(--accent)] animate-pulse text-xs tracking-widest uppercase font-medium">Pipeline yükleniyor...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)]">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <SummaryCard icon={Flame} label="Bugün takip" value={summary.today} color="#E8440A" />
          <SummaryCard icon={Star} label="A-Tier Müşteri" value={summary.hot} color="#1D9E75" />
          <SummaryCard icon={FileText} label="Teklifte" value={summary.proposals} color="#8B5CF6" />
          <SummaryCard icon={AlertTriangle} label="Geciken" value={summary.overdue} color="#EF4444" />
          <SummaryCard icon={Wallet} label="Potansiyel MRR" value={formatTL(summary.potentialMRR)} color="#BA7517" />
          <SummaryCard icon={TrendingUp} label="Kazanılan MRR" value={formatTL(summary.wonMRR)} color="#1D9E75" />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex h-full p-4 gap-3 min-w-max">
            {COLUMNS.map(col => {
              const colLeads = getColumnLeads(col.id)
              return (
                <div key={col.id} className="w-[260px] flex flex-col bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shrink-0">
                  <div className="px-3 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                      <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: col.color }}>{col.title}</span>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">{colLeads.length}</span>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto p-2 space-y-2 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-[var(--accent-muted)]' : ''
                        }`}
                      >
                        {colLeads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => setSelected(lead)}
                                className={`bg-[var(--bg-surface)] border rounded-lg p-3 cursor-pointer transition-all ${
                                  snapshot.isDragging
                                    ? 'shadow-xl border-[var(--accent)] rotate-1'
                                    : lead.nextAction.isOverdue
                                      ? 'border-[#EF4444]/40 hover:border-[#EF4444]'
                                      : lead.next_action_priority === 'call_now'
                                        ? 'border-[#E8440A]/50 bg-[#E8440A]/5 hover:border-[#E8440A]'
                                        : lead.lead_tier === 'A'
                                          ? 'border-[#1D9E75]/30 hover:border-[#1D9E75]'
                                          : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/40'
                                }`}
                              >
                                <div className="flex items-start justify-between mb-1.5 gap-1">
                                  <h4 className="text-xs font-semibold text-[var(--text-primary)] leading-tight line-clamp-2 flex-1">{lead.business_name}</h4>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {lead.nextAction.isOverdue && (
                                      <AlertTriangle className="w-3 h-3 text-[#EF4444]" />
                                    )}
                                    {lead.lead_tier === 'A' && (
                                      <Star className="w-3 h-3 text-[#1D9E75] fill-current" />
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 mb-2">
                                  <span className="text-[9px] text-[var(--text-muted)] truncate">{lead.sector}</span>
                                  <span className="text-[9px] text-[var(--text-muted)]">•</span>
                                  <span className="text-[9px] text-[var(--text-muted)] truncate">{lead.city}</span>
                                </div>

                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                      lead.lead_tier === 'A' 
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                                        : lead.lead_tier === 'B'
                                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                          : lead.lead_tier === 'C'
                                            ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                    }`}>
                                      {lead.lead_tier}-TIER
                                    </span>
                                    <span className="text-[9px] font-bold text-[var(--text-primary)]">Skor: {lead.quality_score || 0}</span>
                                  </div>
                                  {lead.conversion_probability !== undefined && (
                                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                      % {lead.conversion_probability} İkna
                                    </span>
                                  )}
                                </div>

                                {lead.recommended_offer_name && (
                                  <div className="mb-1.5 text-[9px] text-[var(--text-secondary)] truncate" title={lead.recommended_offer_name}>
                                    → {lead.recommended_offer_name}
                                  </div>
                                )}

                                <div className={`text-[9px] font-bold uppercase tracking-wide flex items-center gap-1 ${
                                  lead.nextAction.isOverdue ? 'text-[#EF4444]' : lead.next_action_priority === 'call_now' ? 'text-[#E8440A]' : 'text-[var(--text-muted)]'
                                }`}>
                                  <Clock className="w-2.5 h-2.5" />
                                  <span className="truncate">{lead.next_action}</span>
                                </div>

                                {lead.stageAge > 0 && (
                                  <div className="text-[8px] text-[var(--text-muted)] mt-1">
                                    {lead.stageAge} gündür bu aşamada
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {colLeads.length === 0 && (
                          <div className="text-center py-6 text-[10px] text-[var(--text-muted)] opacity-50">Boş</div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest truncate">{label}</div>
        <div className="text-sm font-black text-[var(--text-primary)] leading-tight truncate">{value}</div>
      </div>
    </div>
  )
}
