"use client"

import { useState, useEffect } from 'react'
import { Plus, X, Briefcase, Check } from 'lucide-react'
export function NewProjectModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [leads, setLeads] = useState<any[]>([])
  const [playbooks, setPlaybooks] = useState<any[]>([])
  
  const [selectedLead, setSelectedLead] = useState('')
  const [selectedPlaybook, setSelectedPlaybook] = useState('')
  const [revenue, setRevenue] = useState('')
  
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetch('/api/db/leads?order=created_at&asc=false').then(res => res.json()).then(data => setLeads(data || []))
      fetch('/api/db/playbooks').then(res => res.json()).then(data => setPlaybooks(data || []))
    }
  }, [isOpen])

  const handlePlaybookChange = (id: string) => {
    setSelectedPlaybook(id)
    const pb = playbooks.find(p => p.id === id)
    if (pb) {
      setRevenue((pb.monthly_fee || pb.setup_fee || 0).toString())
    }
  }

  const handleSave = async () => {
    if (!selectedLead || !selectedPlaybook) return
    setLoading(true)
    const lead = leads.find(l => l.id === selectedLead)
    const pb = playbooks.find(p => p.id === selectedPlaybook)
    
    await fetch('/api/db/projects', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: selectedLead,
        business_name: lead?.business_name || 'Bilinmeyen İşletme',
        status: 'active',
        services: [pb?.name || 'Özel Hizmet'],
        revenue_tl: parseFloat(revenue || '0'),
        revenue_collected: false
      })
    })
    
    setLoading(false)
    setIsOpen(false)
    window.location.reload()
  }


  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] text-[12px] font-bold hover:bg-[#e6e6e6] transition-all rounded-lg"
      >
        <Plus className="w-4 h-4" /> Yeni Proje
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-md rounded-2xl p-0 shadow-2xl relative overflow-hidden">
            
            {/* Header */}
            <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-base)]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-muted)] flex items-center justify-center border border-[var(--accent)]/20">
                  <Briefcase className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Yeni Proje Oluştur</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-[var(--bg-base)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Müşteri (Lead)</label>
                <select 
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] appearance-none"
                  value={selectedLead}
                  onChange={(e) => setSelectedLead(e.target.value)}
                >
                  <option value="">Seçiniz...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.business_name} ({l.city})</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Hizmet Paketi</label>
                <select 
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] appearance-none"
                  value={selectedPlaybook}
                  onChange={(e) => handlePlaybookChange(e.target.value)}
                >
                  <option value="">Seçiniz...</option>
                  {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Proje Bedeli (₺)</label>
                <input 
                  type="number" 
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[var(--border-subtle)] flex gap-3 bg-[var(--bg-base)]/50">
              <button onClick={() => setIsOpen(false)} className="flex-1 px-4 py-2.5 border border-[var(--border-subtle)] text-sm font-bold rounded-lg hover:bg-[var(--bg-surface)] transition-all">İptal</button>
              <button 
                onClick={handleSave} 
                disabled={loading || !selectedLead || !selectedPlaybook}
                className="flex-1 px-4 py-2.5 bg-[var(--cta-bg)] text-[var(--cta-fg)] text-sm font-bold rounded-lg hover:bg-[#e6e6e6] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Kaydediliyor...' : <><Check className="w-4 h-4" /> Projeyi Başlat</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
