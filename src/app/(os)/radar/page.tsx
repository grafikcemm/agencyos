"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback } from 'react'
import { JarvisPanel } from '@/components/map/JarvisPanel'
import { Search, ChevronDown, Loader2 } from 'lucide-react'

const LeadMapMap = dynamic(() => import('@/components/map/LeadMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-base)]">
      <div className="text-[var(--accent)] animate-pulse text-xs tracking-widest uppercase font-medium">
        Harita yükleniyor...
      </div>
    </div>
  )
})

const SECTORS = [
  'Tümü', 'Güzellik', 'Kafe', 'Restoran', 'Butik', 'Spor',
  'Sağlık', 'Eğitim', 'Teknoloji', 'Emlak', 'Hukuk',
]

const SECTOR_QUERY_MAP: Record<string, string> = {
  'Güzellik': 'güzellik salonu',
  'Kafe': 'kafe',
  'Restoran': 'restoran',
  'Butik': 'butik mağaza',
  'Spor': 'spor salonu',
  'Sağlık': 'özel klinik',
  'Eğitim': 'özel kurs merkezi',
  'Teknoloji': 'teknoloji',
  'Emlak': 'emlak ofisi',
  'Hukuk': 'hukuk bürosu',
}

export default function RadarPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [leads, setLeads] = useState<any[]>([])
  const [cityFilter, setCityFilter] = useState('')
  const [sectorFilter, setSectorFilter] = useState('Tümü')
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/db/leads')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data)) setLeads(data)
    } catch (e: any) {
      console.error('Lead fetch error:', e.message)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleScan = async () => {
    const city = cityFilter.trim() || 'İstanbul'
    const sector = SECTOR_QUERY_MAP[sectorFilter] || 'güzellik salonu'
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await fetch('/api/leads/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector, city, limit: 10 })
      })
      const data = await res.json()
      if (data.success) {
        setScanMsg(`${data.count} yeni lead eklendi`)
        await fetchLeads()
      } else {
        setScanMsg(data.message || data.error || 'Tarama başarısız')
      }
    } catch {
      setScanMsg('Bağlantı hatası')
    } finally {
      setScanning(false)
      setTimeout(() => setScanMsg(null), 4000)
    }
  }

  const filteredLeads = leads.filter(l => {
    const cityMatch = !cityFilter.trim() ||
      (l.city || '').toLowerCase().includes(cityFilter.toLowerCase()) ||
      (l.district || '').toLowerCase().includes(cityFilter.toLowerCase())
    const sectorMatch = sectorFilter === 'Tümü' ||
      (l.category || l.sector || '').toLowerCase().includes(sectorFilter.toLowerCase())
    return cityMatch && sectorMatch
  })

  const stats = {
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    won: leads.filter(l => l.status === 'converted').length,
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Map area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Floating filter bar */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-subtle)] rounded-xl px-3 py-2 shadow-lg shadow-black/40">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Şehir veya ilçe ara..."
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none min-w-0"
            />
            <div className="w-px h-4 bg-[var(--border-subtle)] shrink-0" />
            <div className="relative shrink-0">
              <select
                value={sectorFilter}
                onChange={e => setSectorFilter(e.target.value)}
                className="appearance-none bg-transparent text-sm text-[var(--text-secondary)] outline-none pr-5 cursor-pointer"
              >
                {SECTORS.map(s => (
                  <option key={s} value={s} className="bg-[var(--bg-surface)]">{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" />
            </div>
            <div className="w-px h-4 bg-[var(--border-subtle)] shrink-0" />
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors shrink-0 disabled:opacity-50"
            >
              {scanning && <Loader2 className="w-3 h-3 animate-spin" />}
              {scanning ? 'Tarıyor...' : 'Tara'}
            </button>
          </div>

          <div className="bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-subtle)] rounded-xl px-3 py-2 shadow-lg shadow-black/40 shrink-0">
            <span className="text-xs text-[var(--text-muted)]">
              <span className="text-[var(--text-primary)] font-semibold">{filteredLeads.length}</span> sonuç
            </span>
          </div>
        </div>

        {/* Scan result toast */}
        {scanMsg && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1001] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold px-4 py-2 rounded-xl shadow-lg">
            {scanMsg}
          </div>
        )}

        <LeadMapMap leads={filteredLeads} />
      </div>

      {/* JARVIS panel */}
      <div className="w-[300px] shrink-0 border-l border-[var(--border-subtle)] overflow-hidden flex flex-col">
        <JarvisPanel leadsCount={filteredLeads.length} stats={stats} />
      </div>
    </div>
  )
}
