"use client"

import { useState, useEffect } from 'react'
import { Plus, Filter, CheckCircle2 } from 'lucide-react'
import { supabase, Playbook } from '@/lib/supabase'

const CATEGORIES = [
  { id: 'all', name: 'Tümü', color: 'var(--text-secondary)' },
  { id: 'Tasarım', name: 'Tasarım', color: '#06b6d4' },
  { id: 'Otomasyon', name: 'Otomasyon', color: '#10b981' },
  { id: 'Dijital', name: 'Dijital', color: '#f59e0b' },
  { id: 'Strateji', name: 'Strateji', color: '#8b5cf6' },
  { id: 'Paket', name: 'Paket', color: '#ef4444' },
]

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => {
    async function fetchPlaybooks() {
      try {
        const { data, error } = await supabase
          .from('playbooks')
          .select('*')
          .eq('is_active', true)
          .order('name')
        
        if (error) throw error
        setPlaybooks(data || [])
      } catch (err) {
        console.error('Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPlaybooks()
  }, [])

  const filteredPlaybooks = activeCategory === 'all' 
    ? playbooks 
    : playbooks.filter(p => p.category === activeCategory)

  const getCategoryColor = (cat: string | null) => {
    return CATEGORIES.find(c => c.id === cat)?.color || 'var(--text-muted)'
  }

  return (
    <div className="p-8 max-w-7xl mx-auto font-mono">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold tracking-tighter uppercase">Oyun Kitapları</h2>
            <div className="px-2 py-0.5 bg-[#0a0d16] border border-[var(--border-color)] rounded-sm text-[10px] text-[var(--text-muted)] font-bold">
              {playbooks.length} SERVİS
            </div>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Hizmet paketleri ve pitch şablonları kütüphanesi</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--os-cyan)] text-[#050810] hover:bg-[#0891b2] text-[11px] font-bold tracking-wider transition-colors rounded-sm shadow-[0_0_15px_-5px_rgba(6,182,212,0.4)]">
          <Plus className="w-3.5 h-3.5" /> YENİ PLAYBOOK
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-8 p-1 bg-[#0a0d16] border border-[var(--border-color)] rounded-md w-fit">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-1.5 text-[10px] font-bold tracking-widest rounded-sm transition-all ${
              activeCategory === cat.id 
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-bright)] shadow-sm' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent'
            }`}
          >
            {cat.name.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-64 bg-[#0a0d16] border border-[var(--border-color)] rounded-sm"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlaybooks.map(pb => (
            <div key={pb.id} className="os-card group flex flex-col hover:border-[var(--border-bright)] transition-all duration-300">
              <div className="p-6 flex flex-col h-full">
                <div className="flex justify-between items-start mb-4">
                  <span 
                    className="px-2 py-0.5 border text-[9px] font-bold tracking-widest rounded-sm uppercase"
                    style={{ 
                      borderColor: `${getCategoryColor(pb.category)}44`, 
                      color: getCategoryColor(pb.category),
                      backgroundColor: `${getCategoryColor(pb.category)}11`
                    }}
                  >
                    {pb.category}
                  </span>
                </div>
                
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 group-hover:text-[var(--os-cyan)] transition-colors">{pb.name}</h3>
                <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mb-6 flex-1 line-clamp-3 italic">
                  "{pb.description}"
                </p>
                
                {/* Pricing Area */}
                <div className="mb-6 grid grid-cols-2 gap-2">
                  <div className="p-3 bg-[#050810] border border-[var(--border-color)] rounded-sm">
                    <div className="text-[8px] text-[var(--text-muted)] font-bold tracking-widest mb-1 uppercase">Kurulum</div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      {pb.setup_fee > 0 ? `₺${pb.setup_fee.toLocaleString('tr-TR')}` : 'ÜCRETSİZ'}
                    </div>
                  </div>
                  <div className="p-3 bg-[#050810] border border-[var(--border-color)] rounded-sm">
                    <div className="text-[8px] text-[var(--text-muted)] font-bold tracking-widest mb-1 uppercase">Aylık</div>
                    <div className="text-xs font-bold text-[var(--os-accent)]">
                      {pb.monthly_fee > 0 ? `₺${pb.monthly_fee.toLocaleString('tr-TR')}/ay` : 'TEK SEFERLİK'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="flex-1 py-2 bg-[#0a0d16] border border-[var(--border-color)] hover:border-[var(--border-bright)] text-[10px] font-bold tracking-wider rounded-sm transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    DETAYLAR
                  </button>
                  <button className="flex-1 py-2 bg-[#0a0d16] border border-[var(--border-color)] hover:border-[var(--os-cyan)] text-[var(--os-cyan)] text-[10px] font-bold tracking-wider rounded-sm transition-all hover:bg-[var(--os-cyan)] hover:text-[#050810]">
                    PİTCH KOPYALA
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredPlaybooks.length === 0 && !loading && (
        <div className="py-20 text-center border border-dashed border-[var(--border-color)] rounded-lg bg-[#0a0d16]/30">
          <Filter className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-4 opacity-20" />
          <p className="text-xs text-[var(--text-muted)] font-bold tracking-widest">BU KATEGORİDE PLAYBOOK BULUNAMADI</p>
        </div>
      )}

    </div>
  )
}

