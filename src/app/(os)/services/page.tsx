"use client"

import { useState, useEffect } from 'react'
import { Plus, Package, Copy, ExternalLink } from 'lucide-react'
import { Playbook } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'

const CATEGORIES = [
  { id: 'all', name: 'Tümü' },
  { id: 'Tasarım', name: 'Tasarım' },
  { id: 'Otomasyon', name: 'Otomasyon' },
  { id: 'Dijital', name: 'Dijital' },
  { id: 'Strateji', name: 'Strateji' },
  { id: 'Paket', name: 'Paket' },
]

export default function ServicesPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPlaybooks() {
      try {
        const res = await fetch('/api/db/playbooks')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setPlaybooks(Array.isArray(data) ? data.filter((p: Playbook) => p.is_active) : [])
      } catch (err) {
        console.error('Fetch error in ServicesPage:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPlaybooks()
  }, [])

  const filteredPlaybooks = activeCategory === 'all'
    ? playbooks
    : playbooks.filter(p => p.category === activeCategory)

  const handleCopyPitch = (pb: Playbook) => {
    const text = pb.pitch_template || `Merhaba, ${pb.name} paketimizi tanıtmak istiyorum. ${pb.description || ''} Kurulum: ₺${pb.setup_fee?.toLocaleString('tr-TR') || 0} ${pb.monthly_fee > 0 ? `/ Aylık: ₺${pb.monthly_fee.toLocaleString('tr-TR')}` : ''}`
    navigator.clipboard.writeText(text)
    setCopiedId(pb.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Hizmet Paketleri</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Standart hizmetler ve pitch kütüphanesi</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-hover)] rounded-lg transition-all">
            <Plus className="w-3.5 h-3.5" /> Yeni Paket
          </button>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 border-b border-[var(--border-subtle)]">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-all ${
                activeCategory === cat.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-56 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredPlaybooks.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-[var(--border-subtle)] rounded-xl">
            <Package className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">Henüz hizmet paketi yok</p>
            <p className="text-xs text-[var(--text-muted)]">Ayarlar sayfasından varsayılan paketleri yükleyin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {filteredPlaybooks.map(pb => (
              <div key={pb.id} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 flex flex-col hover:border-[var(--border-highlight)] transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <Badge variant="muted">{pb.category}</Badge>
                  <Package className="w-4 h-4 text-[var(--text-muted)]" />
                </div>

                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5 group-hover:text-[var(--accent)] transition-colors">{pb.name}</h3>
                <p className="text-xs leading-relaxed text-[var(--text-muted)] mb-5 flex-1 line-clamp-3">
                  {pb.description}
                </p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg">
                    <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Kurulum</div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {pb.setup_fee > 0 ? `₺${pb.setup_fee.toLocaleString('tr-TR')}` : 'Ücretsiz'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg">
                    <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Aylık</div>
                    <div className="text-xs font-semibold text-[var(--accent)]">
                      {pb.monthly_fee > 0 ? `₺${pb.monthly_fee.toLocaleString('tr-TR')}` : 'Tek Seferlik'}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] hover:border-[var(--border-highlight)] text-xs rounded-lg transition-all text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    <ExternalLink className="w-3 h-3" /> Detay
                  </button>
                  <button
                    onClick={() => handleCopyPitch(pb)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[var(--accent-muted)] text-[var(--accent)] text-xs rounded-lg transition-all hover:bg-[var(--accent)] hover:text-black"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedId === pb.id ? 'Kopyalandı!' : 'Pitch'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
