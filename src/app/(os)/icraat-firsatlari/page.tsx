"use client"

import { useMemo, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import { ArrowRight, CreditCard, Gauge, Lock, Radio, Target, TrendingUp, Search, ArrowUpDown, Rocket, Loader2 } from 'lucide-react'
import { ActionTier, MOCK_OPPORTUNITIES, Opportunity, OpportunityStatus, STAGE_CHECKLISTS } from '@/lib/opportunities'
import { OpportunityCard } from '@/components/opportunities/OpportunityCard'
import { OpportunityDetailModal } from '@/components/opportunities/OpportunityDetailModal'
import { TrendRadar } from '@/components/opportunities/TrendRadar'
import { TurkeyGapCards } from '@/components/opportunities/TurkeyGapCards'
import { useDirective } from '@/lib/useDirective'
import { DirectiveResultModal } from '@/components/agentic/DirectiveResultModal'

const ACTION_COLUMNS: { id: ActionTier; label: string; helper: string }[] = [
  { id: 'launch_now', label: 'Aktif sprint', helper: 'Sadece satışa en yakın işler' },
  { id: 'next_bet', label: 'Sıradaki ürün', helper: 'İlk satıştan sonra açılır' },
  { id: 'incubate', label: 'Kuluçka', helper: 'Kanıt bekleyen fikirler' },
  { id: 'park', label: 'Park', helper: 'Şimdilik aksiyon yok' }
]

type OppSortKey = 'order' | 'score' | 'revenue'

const OPP_SORT_LABEL: Record<OppSortKey, string> = {
  order: 'Öncelik sırası',
  score: 'Skora göre ↓',
  revenue: 'Gelir potansiyeli ↓',
}

// Hands a single opportunity to the agent engine: turn the next action into
// concrete tasks distributed across the specialist agents.
function buildOpportunityDirective(o: Opportunity): string {
  return [
    `İcraat fırsatı: "${o.title}".`,
    `Sıradaki aksiyon: ${o.nextAction}`,
    `Problem: ${o.problem}`,
    `Çözüm: ${o.solution}`,
    `Para planı: ${o.paymentPlan}`,
    'Bu fırsatı icraata dök: somut görevleri uzman ajanlara dağıt ve ilk satışa giden yolu netleştir.',
  ].join(' ')
}

// Dispatches the whole active sprint (all launch_now items) in one directive.
function buildSprintDirective(items: Opportunity[]): string {
  const lines = items.map((o, i) => `${i + 1}. "${o.title}" — sıradaki aksiyon: ${o.nextAction}`).join(' ')
  return `Aktif sprintteki tüm fırsatları icraata dök. ${lines} Her fırsat için görevleri uygun uzman ajanlara dağıt, çakışmaları çöz ve en yüksek getirili olanı önceliklendir.`
}

export default function IcraatFirsatlariPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(MOCK_OPPORTUNITIES)
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null)
  const [activeTab, setActiveTab] = useState<'pipeline' | 'radar' | 'gaps'>('pipeline')
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({
    incubate: false,
    park: false
  })
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<OppSortKey>('order')

  const directive = useDirective()

  const toggleColumn = (id: string) => {
    setCollapsedColumns(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = opportunities.filter(o => {
      if (!q) return true
      return `${o.title} ${o.description} ${o.problem} ${o.tags.join(' ')}`.toLowerCase().includes(q)
    })
    return [...list].sort((a, b) => {
      if (sortBy === 'score') return b.score.total - a.score.total
      if (sortBy === 'revenue') return b.revenueProjection.monthlyRevenuePotential - a.revenueProjection.monthlyRevenuePotential
      return a.order - b.order
    })
  }, [opportunities, query, sortBy])

  const launchNowItems = useMemo(() => [...opportunities].filter(o => o.actionTier === 'launch_now').sort((a, b) => a.order - b.order), [opportunities])
  const active = launchNowItems[0]

  const dispatchOpportunity = (o: Opportunity) => directive.run(buildOpportunityDirective(o), o.title)
  const dispatchSprint = () => {
    if (launchNowItems.length > 0) directive.run(buildSprintDirective(launchNowItems), 'Aktif sprint')
  }

  const stats = useMemo(() => {
    const launchNow = opportunities.filter(o => o.actionTier === 'launch_now')
    const cashPotential = launchNow.reduce((sum, o) => sum + o.revenueProjection.monthlyRevenuePotential, 0)

    return {
      total: opportunities.length,
      launchNow: launchNow.length,
      next: opportunities.filter(o => o.actionTier === 'next_bet').length,
      parked: opportunities.filter(o => o.actionTier === 'park').length,
      avgScore: Math.round(opportunities.reduce((sum, o) => sum + o.score.total, 0) / opportunities.length),
      cashPotential
    }
  }, [opportunities])

  const handleStatusChange = (newStatus: OpportunityStatus) => {
    if (!selectedOpp) return

    const updated = opportunities.map(o =>
      o.id === selectedOpp.id
        ? { ...o, status: newStatus, currentStageChecklist: STAGE_CHECKLISTS[newStatus].map(label => ({ label, checked: false })) }
        : o
    )

    setOpportunities(updated)
    setSelectedOpp(updated.find(o => o.id === selectedOpp.id) || null)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)] z-10">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-[var(--text-primary)] flex items-center gap-2">
                <Target className="w-6 h-6 text-[var(--accent)]" />
                Opportunity Intelligence OS
              </h1>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-1">
                Trend sinyallerini izle, fırsatları puanla, kanıtı olmayan fikirleri otomatik park et.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                className="px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold rounded-md hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
                onClick={() => active && setSelectedOpp(active)}
              >
                Aktif işi aç
              </button>
              <button
                type="button"
                disabled={directive.running || launchNowItems.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] text-black text-xs font-black rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity whitespace-nowrap cursor-pointer"
                onClick={dispatchSprint}
              >
                {directive.running && directive.label === 'Aktif sprint'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Devrediliyor…</>
                  : <><Rocket className="w-3.5 h-3.5" /> Sprint'i ajanlara devret</>}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <StatCard label="Toplam" value={stats.total} icon={Target} />
            <StatCard label="Aktif" value={stats.launchNow} icon={ArrowRight} />
            <StatCard label="Sıradaki" value={stats.next} icon={TrendingUp} />
            <StatCard label="Park" value={stats.parked} icon={Lock} />
            <StatCard label="Ortalama skor" value={stats.avgScore} icon={Gauge} />
            <StatCard label="İlk fiyat" value="$4.99" icon={CreditCard} />
          </div>

          {/* Active Product Spotlight */}
          {active && (
            <div className="rounded-lg border border border-[var(--accent)]/25 bg-[var(--accent-muted)] p-4 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_auto] gap-4 items-center">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] mb-1">Bugünün tek odağı</div>
                <div className="text-base font-black text-[var(--text-primary)] leading-tight">{active.title}</div>
                <div className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">{active.nextAction}</div>
              </div>
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">Para alma planı</div>
                <div className="text-xs font-bold text-[var(--text-primary)] leading-snug line-clamp-3">{active.paymentPlan}</div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  type="button"
                  disabled={directive.running}
                  className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-[var(--accent)] text-black text-xs font-black whitespace-nowrap cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  onClick={() => dispatchOpportunity(active)}
                >
                  {directive.running && directive.label === active.title
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Devrediliyor…</>
                    : <><Rocket className="w-3.5 h-3.5" /> Ajanlara devret</>}
                </button>
                <button
                  type="button"
                  className="h-9 px-4 rounded-md bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold whitespace-nowrap cursor-pointer hover:border-[var(--accent)] transition-colors"
                  onClick={() => setSelectedOpp(active)}
                >
                  Detayı aç
                </button>
              </div>
            </div>
          )}

          {/* Tab Navigation + pipeline arama/sıralama */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-[var(--bg-surface)] rounded-lg p-1 border border-[var(--border-subtle)] w-fit">
              <TabButton active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} icon={Target} label="Ürün Pipeline" />
              <TabButton active={activeTab === 'radar'} onClick={() => setActiveTab('radar')} icon={Radio} label="Trend Radar" />
              <TabButton active={activeTab === 'gaps'} onClick={() => setActiveTab('gaps')} icon={TrendingUp} label="Türkiye Açığı" />
            </div>

            {activeTab === 'pipeline' && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-md px-2 min-w-[180px] focus-within:border-[var(--accent)] transition-colors">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Fırsat ara…"
                    aria-label="Fırsat ara"
                    className="bg-transparent text-[11px] py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none w-full"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as OppSortKey)}
                    aria-label="Sırala"
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] py-1.5 px-2 rounded-md text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                  >
                    {(Object.keys(OPP_SORT_LABEL) as OppSortKey[]).map(k => (
                      <option key={k} value={k}>{OPP_SORT_LABEL[k]}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1600px] mx-auto">
          {activeTab === 'pipeline' && (
            <div className="flex gap-4 h-full min-w-max pb-4" style={{ minHeight: 'calc(100vh - 450px)' }}>
              {ACTION_COLUMNS.map(col => {
                const colOpps = ordered.filter(o => o.actionTier === col.id)
                const isCollapsed = collapsedColumns[col.id] ?? false

                if (isCollapsed) {
                  return (
                    <section
                      key={col.id}
                      className="w-[50px] flex flex-col bg-[var(--bg-surface)]/30 rounded-lg border border-[var(--border-subtle)] overflow-hidden transition-all duration-300 select-none shrink-0"
                    >
                      <button
                        onClick={() => toggleColumn(col.id)}
                        className="flex-1 flex flex-col items-center justify-between p-3 py-6 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer w-full text-center"
                        title={`${col.label} sütununu genişlet`}
                      >
                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] [writing-mode:vertical-lr] rotate-180 mb-2">
                          {col.label}
                        </div>
                        <span className="text-[10px] font-black bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full text-[var(--text-muted)]">
                          {colOpps.length}
                        </span>
                      </button>
                    </section>
                  )
                }

                const canCollapse = col.id === 'incubate' || col.id === 'park'

                return (
                  <section key={col.id} className="w-[360px] flex flex-col bg-[var(--bg-surface)]/50 rounded-lg border border-[var(--border-subtle)] overflow-hidden transition-all duration-300 shrink-0">
                    <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)] truncate">{col.label}</h2>
                          <span className="text-[10px] font-black bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full text-[var(--text-muted)] shrink-0">
                            {colOpps.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1 truncate">{col.helper}</p>
                      </div>
                      {canCollapse && (
                        <button
                          onClick={() => toggleColumn(col.id)}
                          className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all shrink-0 cursor-pointer text-[9px] font-black"
                          title="Sütunu daralt"
                        >
                          Kapat
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                      {colOpps.map(opp => (
                        <div key={opp.id} className="group/opp relative">
                          <OpportunityCard
                            opp={opp}
                            onClick={() => setSelectedOpp(opp)}
                          />
                          <button
                            type="button"
                            disabled={directive.running}
                            onClick={() => dispatchOpportunity(opp)}
                            title="Bu fırsatı ajanlara devret"
                            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--accent)] text-black text-[9px] font-black opacity-0 group-hover/opp:opacity-100 disabled:opacity-50 transition-opacity shadow-lg cursor-pointer"
                          >
                            {directive.running && directive.label === opp.title
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <><Rocket className="w-3 h-3" /> Devret</>}
                          </button>
                        </div>
                      ))}
                      {colOpps.length === 0 && (
                        <div className="text-[10px] text-center text-[var(--text-muted)] font-medium p-4 border border-dashed border-[var(--border-subtle)] rounded-lg">
                          Bu sütunda fırsat yok
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {activeTab === 'radar' && <TrendRadar />}
          {activeTab === 'gaps' && <TurkeyGapCards />}
        </div>
      </div>

      {selectedOpp && (
        <OpportunityDetailModal
          opp={selectedOpp}
          onClose={() => setSelectedOpp(null)}
          onStatusChange={handleStatusChange}
        />
      )}

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

function TabButton({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
        active
          ? 'bg-[var(--accent)] text-black shadow-sm'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
      }`}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string, value: number | string, icon: ComponentType<{ className?: string; style?: CSSProperties }> }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-3 flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[9px] font-bold uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-xl font-black text-[var(--text-primary)] truncate">{value}</div>
    </div>
  )
}
