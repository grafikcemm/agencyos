"use client"

import { useMemo, useState } from 'react'
import { Package, Clock, Target, TrendingUp, Wallet, AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Filter, Search, ArrowUpDown, Rocket, Loader2 } from 'lucide-react'
import { OFFERS } from '@/lib/offers'
import { SECTOR_PROFILES } from '@/lib/sectorPriority'
import type { Offer, OfferCategory } from '@/lib/types'
import { useDirective } from '@/lib/useDirective'
import { DirectiveResultModal } from '@/components/agentic/DirectiveResultModal'

type SortKey = 'annual' | 'monthly' | 'setup' | 'fast'

const SORT_LABEL: Record<SortKey, string> = {
  annual: 'Yıllık değer ↓',
  monthly: 'Aylık gelir ↓',
  setup: 'Kurulum ↓',
  fast: 'En hızlı teslim',
}

// Builds a Turkish operator directive that hands an offer to the agent engine:
// find matching leads, draft personalised outreach, plan the follow-up.
function buildOfferDirective(o: Offer, sectorNames: string[]): string {
  const sectors = sectorNames.length > 0 ? sectorNames.join(', ') : 'tüm uygun sektörler'
  const monthly = o.monthlyPrice > 0 ? `aylık ${o.monthlyPrice} TL` : 'tek seferlik'
  return [
    `"${o.name}" hizmetini satışa çıkar.`,
    `Hedef sektörler: ${sectors}.`,
    `Çözdüğü problem: ${o.problemSolved}`,
    `Satış vaadi: "${o.salesPromise}".`,
    `Fiyat: kurulum ${o.setupPrice} TL, ${monthly}.`,
    'Bu hizmete uygun mevcut leadleri tara, en yüksek potansiyelli olanları seç ve her biri için kişiselleştirilmiş outreach taslağı ile takip planı hazırla.',
  ].join(' ')
}

const CATEGORY_LABEL: Record<OfferCategory, string> = {
  revenue: 'Para Kazandıran Paketler',
  operations: 'Operasyon Tasarrufu',
  creative: 'Kreatif & Tasarım',
}

const CATEGORY_COLOR: Record<OfferCategory, string> = {
  revenue: '#5ee6b0',
  operations: '#5ac8fa',
  creative: '#8b5cf6',
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
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('annual')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const directive = useDirective()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = OFFERS.filter(o => {
      if (category !== 'all' && o.category !== category) return false
      if (sectorFilter !== 'all' && !o.targetSectors.includes(sectorFilter)) return false
      if (q) {
        const haystack = `${o.name} ${o.description} ${o.problemSolved} ${o.salesPromise}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    return [...list].sort((a, b) => {
      if (sortBy === 'monthly') return b.monthlyPrice - a.monthlyPrice
      if (sortBy === 'setup') return b.setupPrice - a.setupPrice
      if (sortBy === 'fast') return a.deliveryDays - b.deliveryDays
      return annualValue(b) - annualValue(a)
    })
  }, [category, sectorFilter, query, sortBy])

  const launchCampaign = (offer: Offer) => {
    const names = offer.targetSectors
      .map(sid => SECTOR_PROFILES.find(s => s.id === sid)?.displayName)
      .filter((n): n is string => Boolean(n))
    directive.run(buildOfferDirective(offer, names), offer.name)
  }

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
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">Hizmet Kataloğu</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{filtered.length} / {OFFERS.length} hizmet · kategori ve sektöre göre filtrele</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat icon={Package} label="Toplam hizmet" value={String(summary.total)} color="#5ac8fa" />
          <SummaryStat icon={TrendingUp} label="Para kazandıran" value={String(summary.revenueOffers)} color="#5ee6b0" />
          <SummaryStat icon={Wallet} label="Toplam aylık potansiyel" value={formatTL(summary.totalMonthly)} color="#e5b567" accent />
          <SummaryStat icon={Target} label="Ortalama yıllık" value={formatTL(summary.avgAnnual)} color="#8b5cf6" />
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

          <div className="flex items-center gap-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-md px-2 flex-1 min-w-[160px] focus-within:border-[var(--accent)] transition-colors">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hizmet ara…"
              aria-label="Hizmet ara"
              className="bg-transparent text-[11px] py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none w-full"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sırala"
              className="bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px] py-1 px-2 rounded-md text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(offer => {
            const isOpen = expanded === offer.id
            const color = CATEGORY_COLOR[offer.category]
            return (
              <div key={offer.id} className="group/card bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20 hover:border-[var(--accent)]/40">
                <div className="p-4 border-b border-[var(--border-subtle)] space-y-2 relative">
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity" style={{ background: color }} />
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
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--danger)] flex items-center gap-1">
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
                      onClick={() => launchCampaign(offer)}
                      disabled={directive.running}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-black rounded-md transition-opacity"
                    >
                      {directive.running && directive.label === offer.name
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Ajanlara devrediliyor…</>
                        : <><Rocket className="w-3 h-3" /> Ajanlarla kampanya başlat</>}
                    </button>

                    <button
                      onClick={() => copyText(offer.id, `${offer.name}\n\n${offer.salesPromise}\n\nKurulum: ${formatTL(offer.setupPrice)}\nAylık: ${formatTL(offer.monthlyPrice)}`)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--accent)] hover:text-white text-[10px] font-bold text-[var(--text-primary)] rounded-md transition-all"
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

      <DirectiveResultModal
        running={directive.running}
        result={directive.result}
        error={directive.error}
        label={directive.label}
        onClose={directive.reset}
      />
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
        <div className={`num text-sm font-black truncate ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
      </div>
    </div>
  )
}

function PriceCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
      <div className={`num text-[11px] font-black mt-0.5 ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  )
}

function FilterChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[9px] font-bold rounded transition-all ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
      style={active && color ? { background: color, color: '#fff' } : undefined}
    >
      {children}
    </button>
  )
}
