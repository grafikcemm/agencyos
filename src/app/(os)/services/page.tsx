"use client"

import { useMemo, useState } from 'react'
import { Package, Clock, Target, TrendingUp, Wallet, AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Filter } from 'lucide-react'
import { OFFERS } from '@/lib/offers'
import { SECTOR_PROFILES } from '@/lib/sectorPriority'
import type { Offer, OfferCategory } from '@/lib/types'

const CATEGORY_LABEL: Record<OfferCategory, string> = {
  revenue: 'Para Kazandıran Paketler',
  operations: 'Operasyon Tasarrufu',
  creative: 'Kreatif & Tasarım',
}

const CATEGORY_COLOR: Record<OfferCategory, string> = {
  revenue: '#1D9E75',
  operations: '#378ADD',
  creative: '#8B5CF6',
}

const DIFFICULTY_LABEL: Record<string, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
}

function formatTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)
}

function annualValue(o: Offer): number {
  return o.setupPrice + o.monthlyPrice * 12
}

export default function ServicesPage() {
  const [category, setCategory] = useState<'all' | OfferCategory>('all')
  const [sectorFilter, setSectorFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return OFFERS.filter(o => {
      if (category !== 'all' && o.category !== category) return false
      if (sectorFilter !== 'all' && !o.targetSectors.includes(sectorFilter)) return false
      return true
    })
  }, [category, sectorFilter])

  const summary = useMemo(() => {
    const total = OFFERS.length
    const revenueOffers = OFFERS.filter(o => o.category === 'revenue').length
    const totalMonthly = OFFERS.reduce((s, o) => s + o.monthlyPrice, 0)
    const avgAnnual = OFFERS.reduce((s, o) => s + annualValue(o), 0) / total
    return { total, revenueOffers, totalMonthly, avgAnnual }
  }, [])

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-thin">
      <div className="space-y-5 max-w-[1400px]">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Hizmet Kataloğu</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{filtered.length} / {OFFERS.length} hizmet · kategori ve sektöre göre filtrele</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat icon={Package} label="Toplam hizmet" value={String(summary.total)} color="#378ADD" />
          <SummaryStat icon={TrendingUp} label="Para kazandıran" value={String(summary.revenueOffers)} color="#1D9E75" />
          <SummaryStat icon={Wallet} label="Toplam aylık potansiyel" value={formatTL(summary.totalMonthly)} color="#BA7517" accent />
          <SummaryStat icon={Target} label="Ortalama yıllık" value={formatTL(summary.avgAnnual)} color="#8B5CF6" />
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Filtre</span>
          </div>
          <div className="flex gap-1 bg-[var(--bg-base)] p-0.5 rounded-md border border-[var(--border-subtle)]">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>Tümü</FilterChip>
            <FilterChip active={category === 'revenue'} onClick={() => setCategory('revenue')} color={CATEGORY_COLOR.revenue}>Gelir</FilterChip>
            <FilterChip active={category === 'operations'} onClick={() => setCategory('operations')} color={CATEGORY_COLOR.operations}>Operasyon</FilterChip>
            <FilterChip active={category === 'creative'} onClick={() => setCategory('creative')} color={CATEGORY_COLOR.creative}>Kreatif</FilterChip>
          </div>
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px] py-1 px-2 rounded-md text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="all">Tüm sektörler</option>
            {SECTOR_PROFILES.map(s => (
              <option key={s.id} value={s.id}>{s.displayName}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(offer => {
            const isOpen = expanded === offer.id
            const color = CATEGORY_COLOR[offer.category]
            return (
              <div key={offer.id} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                          {CATEGORY_LABEL[offer.category]}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{offer.name}</h3>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{offer.description}</p>
                </div>

                <div className="px-4 py-3 grid grid-cols-3 gap-2 bg-[var(--bg-base)]/40">
                  <PriceCell label="Kurulum" value={formatTL(offer.setupPrice)} />
                  <PriceCell label="Aylık" value={offer.monthlyPrice > 0 ? formatTL(offer.monthlyPrice) : '—'} accent />
                  <PriceCell label="Süre" value={`${offer.deliveryDays} gün`} />
                </div>

                <div className="p-4 space-y-2 flex-1">
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Çözdüğü problem</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{offer.problemSolved}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Satış vaadi</div>
                    <div className="text-[11px] text-[var(--text-primary)] font-medium italic">&ldquo;{offer.salesPromise}&rdquo;</div>
                  </div>

                  {offer.targetSectors.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Uygun sektörler</div>
                      <div className="flex flex-wrap gap-1">
                        {offer.targetSectors.slice(0, 3).map(sid => {
                          const sec = SECTOR_PROFILES.find(s => s.id === sid)
                          return sec ? (
                            <span key={sid} className="text-[9px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded text-[var(--text-secondary)]">
                              {sec.displayName.split(' / ')[0]}
                            </span>
                          ) : null
                        })}
                        {offer.targetSectors.length > 3 && (
                          <span className="text-[9px] text-[var(--text-muted)]">+{offer.targetSectors.length - 3}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[9px] text-[var(--text-muted)]">Zorluk: <span className="font-bold text-[var(--text-secondary)]">{DIFFICULTY_LABEL[offer.difficulty]}</span></span>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--accent)]">{formatTL(annualValue(offer))} / yıl</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/40 space-y-3">
                    <div className="space-y-1">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Teslimat checklist&apos;i</div>
                      <ul className="space-y-1">
                        {offer.checklist.map((item, i) => (
                          <li key={i} className="text-[10px] text-[var(--text-secondary)] flex items-start gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {offer.upsells.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Upsell önerileri</div>
                        <div className="flex flex-wrap gap-1">
                          {offer.upsells.map(uid => {
                            const u = OFFERS.find(o => o.id === uid)
                            return u ? (
                              <span key={uid} className="text-[9px] bg-[var(--accent-muted)] border border-[var(--accent)]/20 text-[var(--accent)] px-1.5 py-0.5 rounded">
                                {u.name}
                              </span>
                            ) : null
                          })}
                        </div>
                      </div>
                    )}

                    {offer.antiPatterns.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[#EF4444] flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Anti-pattern
                        </div>
                        <ul className="space-y-1">
                          {offer.antiPatterns.map((ap, i) => (
                            <li key={i} className="text-[10px] text-[var(--text-secondary)] italic">— {ap}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => copyText(offer.id, `${offer.name}\n\n${offer.salesPromise}\n\nKurulum: ${formatTL(offer.setupPrice)}\nAylık: ${formatTL(offer.monthlyPrice)}`)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--accent)] hover:text-black text-[10px] font-bold text-[var(--text-primary)] rounded-md transition-all"
                    >
                      {copiedId === offer.id ? <><Check className="w-3 h-3" /> Kopyalandı</> : <><Copy className="w-3 h-3" /> Hızlı sunum metnini kopyala</>}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setExpanded(isOpen ? null : offer.id)}
                  className="w-full py-2 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] border-t border-[var(--border-subtle)] flex items-center justify-center gap-1 transition-colors"
                >
                  {isOpen ? <>Kapat <ChevronUp className="w-3 h-3" /></> : <>Detay <ChevronDown className="w-3 h-3" /></>}
                </button>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl">
            <div className="text-sm text-[var(--text-muted)] mb-2">Bu filtreye uygun hizmet yok</div>
            <div className="text-[10px] text-[var(--text-muted)]">Filtreleri sıfırlamayı dene.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryStat({ icon: Icon, label, value, color, accent }: { icon: any; label: string; value: string; color: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</div>
        <div className={`text-sm font-black truncate ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
      </div>
    </div>
  )
}

function PriceCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
      <div className={`text-[11px] font-black mt-0.5 ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  )
}

function FilterChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[9px] font-bold rounded transition-all ${
        active
          ? 'bg-[var(--accent)] text-black'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
      style={active && color ? { background: color, color: '#fff' } : undefined}
    >
      {children}
    </button>
  )
}
