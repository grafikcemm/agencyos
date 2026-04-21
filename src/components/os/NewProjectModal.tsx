"use client"

import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function NewProjectModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [leads, setLeads] = useState<any[]>([])
  const [playbooks, setPlaybooks] = useState<any[]>([])
  
  const [selectedLead, setSelectedLead] = useState('')
  const [selectedPlaybook, setSelectedPlaybook] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      supabase.from('leads').select('*').order('created_at', { ascending: false }).then(({ data }) => setLeads(data || []))
      supabase.from('playbooks').select('*').then(({ data }) => setPlaybooks(data || []))
    }
  }, [isOpen])

  const handlePlaybookChange = (id: string) => {
    setSelectedPlaybook(id)
    const pb = playbooks.find(p => p.id === id)
    if (pb) {
      setSetupFee(pb.setup_fee.toString())
      setMonthlyFee(pb.monthly_fee.toString())
    }
  }

  const handleSave = async () => {
    if (!selectedLead || !selectedPlaybook) return
    setLoading(true)
    const lead = leads.find(l => l.id === selectedLead)
    const pb = playbooks.find(p => p.id === selectedPlaybook)
    
    await supabase.from('projects').insert({
      lead_id: selectedLead,
      business_name: lead?.business_name || 'Bilinmeyen İşletme',
      status: 'active',
      services: [pb?.name || 'Özel Hizmet'],
      setup_fee: parseFloat(setupFee || '0'),
      monthly_fee: parseFloat(monthlyFee || '0')
    })
    
    setLoading(false)
    setIsOpen(false)
    window.location.reload()
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--os-accent)] text-[#050810] text-[11px] font-bold tracking-wider hover:bg-[var(--os-accent-hover)] transition-colors rounded-sm"
      >
        <Plus className="w-3.5 h-3.5" /> YENİ PROJE
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm font-mono">
          <div className="bg-[#0a0d16] border border-[var(--border-color)] w-[500px] rounded-sm p-6 shadow-2xl relative">
            <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-[var(--os-cyan)] mb-6 uppercase tracking-wider">// YENİ PROJE OLUŞTUR</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">LEAD SEÇ</label>
                <select 
                  className="w-full bg-[#050810] border border-[var(--border-color)] p-2 text-xs text-white outline-none focus:border-[var(--os-cyan)]"
                  value={selectedLead}
                  onChange={(e) => setSelectedLead(e.target.value)}
                >
                  <option value="">Seçiniz...</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.business_name} ({l.city})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">HİZMET (PLAYBOOK)</label>
                <select 
                  className="w-full bg-[#050810] border border-[var(--border-color)] p-2 text-xs text-white outline-none focus:border-[var(--os-cyan)]"
                  value={selectedPlaybook}
                  onChange={(e) => handlePlaybookChange(e.target.value)}
                >
                  <option value="">Seçiniz...</option>
                  {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">KURULUM ÜCRETİ (₺)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#050810] border border-[var(--border-color)] p-2 text-xs text-white outline-none focus:border-[var(--os-cyan)]"
                    value={setupFee}
                    onChange={(e) => setSetupFee(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">AYLIK ÜCRET (₺)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#050810] border border-[var(--border-color)] p-2 text-xs text-white outline-none focus:border-[var(--os-cyan)]"
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setIsOpen(false)} className="px-4 py-2 border border-[var(--border-color)] text-[11px] font-bold tracking-wider hover:bg-[#050810]">İPTAL</button>
              <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-[var(--os-cyan)] text-[#050810] text-[11px] font-bold tracking-wider hover:bg-[#0891b2]">
                {loading ? 'KAYDEDİLİYOR...' : 'KAYDET'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
