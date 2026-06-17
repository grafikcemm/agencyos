'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle, Clock, ExternalLink, Globe, MessageSquare, Newspaper, Radio, ShieldAlert, TrendingUp, XCircle } from 'lucide-react'

interface TrendSignalRow {
  id: string
  source: string
  source_url: string | null
  title: string
  summary: string | null
  confidence_score: number
  relevance_score: number
  linked_product_id: string | null
  status: string
  collected_at: string
}

interface ProductRef {
  id: string
  title: string
}

interface SourceHealth {
  id: string
  name: string
  type: string
  is_active: boolean
  trust_score: number
  last_status: string
  last_checked_at: string | null
  notes: string | null
}

const SOURCE_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  product_hunt: { icon: TrendingUp, label: 'Product Hunt', color: '#da552f' },
  hacker_news: { icon: Newspaper, label: 'Hacker News', color: '#ff6600' },
  reddit: { icon: MessageSquare, label: 'Reddit', color: '#ff4500' },
  google_trends: { icon: Globe, label: 'Google Trends', color: '#4285f4' },
  turkey_gap: { icon: Radio, label: 'Türkiye Açığı', color: '#10b981' }
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--text-muted)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-black tabular-nums" style={{ color }}>{score}</span>
    </div>
  )
}

export function TrendRadar() {
  const [signals, setSignals] = useState<TrendSignalRow[]>([])
  const [products, setProducts] = useState<ProductRef[]>([])
  const [sources, setSources] = useState<SourceHealth[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'actionable' | 'reviewed' | 'parked'>('actionable')

  useEffect(() => {
    let active = true
    fetch('/api/opportunities/signals')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (!active) return
        setSignals(data.signals ?? [])
        setProducts(data.products ?? [])
        setSources(data.sources ?? [])
        setLastScan(data.lastScan ?? null)
        setLoading(false)
      })
      .catch(err => {
        if (!active) return
        setError(String(err))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleAction = async (id: string, newStatus: string, productId?: string | null) => {
    try {
      const res = await fetch('/api/opportunities/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: newStatus,
          ...(productId !== undefined ? { linked_product_id: productId } : {})
        })
      })
      if (!res.ok) throw new Error('API request failed')
      
      // Update local state instantly
      setSignals(prev => prev.map(s => 
        s.id === id 
          ? { 
              ...s, 
              status: newStatus,
              ...(productId !== undefined ? { linked_product_id: productId } : {})
            } 
          : s
      ))
    } catch (err) {
      alert('İşlem başarısız oldu: ' + String(err))
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-subtle)]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
          ))}
        </div>
      </div>
    )
  }

  // Filtered signals for display
  const displayedSignals = signals.filter(s => s.status === activeFilter)

  return (
    <div className="space-y-4">
      {/* Header and Sources Status Bar */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[var(--accent)] animate-pulse" />
            <h2 className="text-base font-black text-[var(--text-primary)]">Fırsat Takip & Sinyal Radarı</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
            <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Son Otomatik Tarama:</span>
            <span className="text-[var(--text-primary)] font-bold">
              {lastScan 
                ? new Date(lastScan).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                : 'Tarama Yapılmadı'
              }
            </span>
          </div>
        </div>

        {/* Source Health Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {sources.map(src => {
            const config = SOURCE_CONFIG[src.id] ?? { icon: Activity, label: src.name, color: '#71717a' }
            const Icon = config.icon
            const isOk = src.last_status === 'ok'
            const statusColor = isOk ? 'text-[var(--success)] bg-[var(--success)]/10' : 'text-[var(--warning)] bg-[var(--warning)]/10'
            
            return (
              <div 
                key={src.id} 
                className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                title={`${src.name}: ${src.notes || 'Aktif'}`}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                <span className="text-[10px] font-black text-[var(--text-secondary)]">{config.label}</span>
                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase ${statusColor}`}>
                  {src.last_status}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error state alert */}
      {error && (
        <div className="rounded-lg border border-[var(--danger)]/20 bg-[var(--danger)]/10 p-3 text-xs font-semibold text-[var(--danger)] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          <span>Veri çekilirken hata oluştu: {error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 shrink-0">
        <div className="flex items-center gap-1 bg-[var(--bg-elevated)] p-1 rounded-lg border border-[var(--border-subtle)]">
          {(['actionable', 'reviewed', 'parked'] as const).map(f => {
            const label = f === 'actionable' ? 'Aksiyon Bekleyen' : f === 'reviewed' ? 'İncelenmiş' : 'Park Edilmiş'
            const count = signals.filter(s => s.status === f).length
            const isSelected = activeFilter === f

            return (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected 
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {label}
                <span className={`text-[10px] font-black px-1.5 rounded-full ${isSelected ? 'bg-black/10 text-black' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Signals Cards Grid */}
      {displayedSignals.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {displayedSignals.map(signal => {
            const config = SOURCE_CONFIG[signal.source] ?? { icon: Activity, label: signal.source, color: '#71717a' }
            const SourceIcon = config.icon

            return (
              <div
                key={signal.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between gap-3 hover:border-[var(--accent)]/30 transition-colors"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${config.color}20` }}
                      >
                        <SourceIcon className="w-3.5 h-3.5" style={{ color: config.color }} />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">
                        {config.label}
                      </span>
                    </div>
                    {signal.source_url && (
                      <a
                        href={signal.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Title & Summary */}
                  <div className="space-y-1">
                    <h3 className="text-[13px] font-bold text-[var(--text-primary)] leading-snug line-clamp-2" title={signal.title}>
                      {signal.title}
                    </h3>
                    {signal.summary && (
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                        {signal.summary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
                  {/* Confidence Bar */}
                  <ConfidenceBar score={signal.confidence_score} />

                  {/* Linked Product Selection */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                      Bağlı Ürün/Fikir:
                    </label>
                    <select
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                      value={signal.linked_product_id ?? ''}
                      onChange={(e) => handleAction(signal.id, signal.status, e.target.value || null)}
                    >
                      <option value="">-- Bağımsız Sinyal --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => handleAction(signal.id, 'actionable')}
                      disabled={signal.status === 'actionable'}
                      className={`flex-1 py-1.5 rounded text-[10px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        signal.status === 'actionable'
                          ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/25 cursor-default'
                          : 'bg-[var(--bg-elevated)] hover:bg-[var(--success)]/15 hover:text-[var(--success)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      <CheckCircle className="w-3 h-3" />
                      Aksiyona Al
                    </button>
                    <button
                      onClick={() => handleAction(signal.id, 'parked')}
                      disabled={signal.status === 'parked'}
                      className={`flex-1 py-1.5 rounded text-[10px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        signal.status === 'parked'
                          ? 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/25 cursor-default'
                          : 'bg-[var(--bg-elevated)] hover:bg-[var(--warning)]/15 hover:text-[var(--warning)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      Park Et
                    </button>
                    <button
                      onClick={() => handleAction(signal.id, 'dismissed')}
                      className="px-2.5 py-1.5 rounded text-[10px] font-black bg-[var(--bg-elevated)] hover:bg-[var(--danger)]/15 hover:text-[var(--danger)] text-[var(--text-muted)] border border-[var(--border-subtle)] transition-all cursor-pointer"
                      title="Reddet / Yoksay"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty State with instructions */
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto border border-[var(--border-subtle)]">
            <Radio className="w-6 h-6 text-[var(--text-muted)] opacity-50" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <p className="text-sm font-black text-[var(--text-primary)]">Bu kategoride trend sinyali bulunmuyor</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Mevcut veritabanında &quot;{activeFilter}&quot; durumunda kayıt yok veya otomatik tarama henüz veri toplamadı.
            </p>
          </div>
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-4 max-w-lg mx-auto text-left space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
              📡 Manuel Tarama ve Test Komutları
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Sinyalleri internetten toplamak ve veritabanına yazmak için terminalinizde şu komutları kullanabilirsiniz:
            </p>
            <div className="space-y-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between p-1.5 bg-[var(--bg-elevated)] rounded border border-[var(--border-subtle)]">
                <span className="text-[var(--text-primary)]">npm run opportunity:scan -- --dryRun</span>
                <span className="text-[var(--text-muted)]">Sadece önizleme (DB&apos;ye yazmaz)</span>
              </div>
              <div className="flex items-center justify-between p-1.5 bg-[var(--bg-elevated)] rounded border border-[var(--border-subtle)]">
                <span className="text-[var(--text-primary)]">npm run opportunity:scan</span>
                <span className="text-[var(--text-muted)]">Gerçek tarama (DB&apos;ye kaydeder)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
