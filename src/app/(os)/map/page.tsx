"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { JarvisPanel } from '@/components/map/JarvisPanel'
import { Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Leaflet SSR sorunu çözümü
const LeadMapMap = dynamic(() => import('@/components/map/LeadMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#050810] font-mono">
      <div className="text-[var(--os-cyan)] pulse-text tracking-widest text-sm mb-4">HARİTA MOTORU BAŞLATILIYOR...</div>
      <div className="w-48 h-[1px] bg-[var(--border-color)] overflow-hidden relative">
        <div className="absolute top-0 left-0 h-full bg-[var(--os-cyan)] w-1/3 animate-[ticker_1s_infinite]"></div>
      </div>
    </div>
  )
})

export default function MapPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase.from('leads').select('*')
      if (data) setLeads(data)
      setLoading(false)
    }
    fetchLeads()
  }, [])

  const stats = {
    new: leads.filter(l => l.status === 'new' || l.status === 'yeni').length,
    contacted: leads.filter(l => l.status === 'contacted' || l.status === 'iletişim').length,
    won: leads.filter(l => l.status === 'converted' || l.status === 'won' || l.status === 'kazanıldı').length
  }

  return (
    <div className="flex h-full w-full overflow-hidden relative font-mono">
      
      {/* Upper Status Bar specific to Map */}
      <div className="absolute top-0 left-0 right-[320px] h-12 bg-[#050810]/90 backdrop-blur-sm border-b border-[var(--border-color)] z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-[var(--text-primary)] font-bold tracking-widest text-sm">JARVIS</h2>
          <div className="text-[10px] text-[var(--text-secondary)] tracking-widest">
            <span className="text-[var(--os-cyan)] font-bold">{leads.length}</span> / {leads.length}
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--os-green)] shadow-[0_0_6px_var(--os-green)]"></div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-[10px] text-[var(--text-secondary)] tracking-wider flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--os-cyan)] shrink-0"></div>
            AĞ: BEKLEMEDE
          </div>
          <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Map Area (Left 75% roughly, responsive: flex-1) */}
      <div className="flex-1 relative bg-[#050810]">
        <LeadMapMap leads={leads} />

        {/* Bottom Status Bar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0a0d16]/90 backdrop-blur-md border border-[var(--border-color)] rounded-full px-6 py-2.5 z-40 flex items-center gap-6 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--os-cyan)]"></div>
            <span className="text-[10px] font-bold text-[var(--text-primary)]">{stats.new} <span className="text-[var(--text-secondary)] font-normal">YENİ</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--os-accent)]"></div>
            <span className="text-[10px] font-bold text-[var(--text-primary)]">{stats.contacted} <span className="text-[var(--text-secondary)] font-normal">İLETİŞİM</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--os-green)]"></div>
            <span className="text-[10px] font-bold text-[var(--text-primary)]">{stats.won} <span className="text-[var(--text-secondary)] font-normal">KAZANILDI</span></span>
          </div>
          <div className="w-px h-3 bg-[var(--border-color)]"></div>
          <div className="text-[10px] font-bold text-[var(--text-primary)]">SİSTEM ÇEVRİMİÇİ</div>
        </div>
      </div>

      {/* Jarvis Panel Area (Right 25% roughly, fixed 320px) */}
      <div className="w-[320px] shrink-0 h-full border-l border-[var(--border-color)] bg-[#050810] z-50">
        <JarvisPanel leadsCount={leads.length} />
      </div>

    </div>
  )
}
