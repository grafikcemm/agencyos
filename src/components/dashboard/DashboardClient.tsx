"use client"

import { useMemo, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Cpu, Flame, Clock, Activity, Search, Filter, ArrowRight, Wallet, CheckCircle, Star, AlertTriangle, ChevronRight } from 'lucide-react'
import { LeadDrawer } from '@/components/map/LeadDrawer'
import type { EnrichedLead } from '@/lib/enrichLead'
import { fetchProjects } from '@/lib/repositories/projects'
import { dbGet } from '@/lib/repositories/base'

// Recharts ağır — ana bundle'dan ayır, yalnız client'ta yükle (M11).
const CashFlowChart = dynamic(() => import('./CashFlowChart'), { ssr: false })

const MONTH_LABELS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
// USD/TRY — env ile override edilebilir (stale hardcode riskini azaltır).
const USD_TO_TL = Number(process.env.NEXT_PUBLIC_USD_TO_TL) || 38

// Kategori adından 3 harfli kısa kod (cüzdan rozeti).
function walletCode(name: string): string {
  return (name || '—').slice(0, 3).toLocaleUpperCase('tr-TR')
}

// TL kısa formatı (kuruşsuz).
const walletTL = (amount: number): string =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

interface CashFlowPoint {
  name: string
  inflow: number
  outflow: number
}

interface CostLogRow {
  cost_tl?: number | null
  cost_usd?: number | null
  created_at?: string | null
}

// Build a last-6-months cash-flow series from real projects (recurring MRR) and
// ai_cost_logs (monthly AI spend). No fabricated numbers — empty data yields zeros.
function buildCashFlow(
  projects: { status: string; monthly_fee?: number | null; created_at?: string | null }[],
  costLogs: CostLogRow[]
): CashFlowPoint[] {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  // Recurring revenue: active projects contribute their monthly_fee to every month
  // at or after their start (created_at) — that is when the recurring fee began.
  const activeProjects = projects.filter((p) => p.status === 'active')

  // AI cost grouped by year-month.
  const costByMonth = new Map<string, number>()
  for (const log of costLogs) {
    if (!log.created_at) continue
    const d = new Date(log.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const tl = (log.cost_tl ?? 0) || (log.cost_usd ?? 0) * USD_TO_TL
    costByMonth.set(key, (costByMonth.get(key) ?? 0) + tl)
  }

  return months.map(({ year, month }) => {
    const monthStart = new Date(year, month, 1)
    const inflow = activeProjects.reduce((sum, p) => {
      const started = p.created_at ? new Date(p.created_at) : null
      // Count MRR for any month from the project's start month onward.
      if (!started || started <= new Date(year, month + 1, 0, 23, 59, 59)) {
        return sum + (p.monthly_fee ?? 0)
      }
      return sum
    }, 0)
    const outflow = costByMonth.get(`${year}-${month}`) ?? 0
    return {
      name: MONTH_LABELS_TR[monthStart.getMonth()],
      inflow,
      outflow: -outflow,
    }
  })
}

interface DashboardProject {
  id: string
  business_name?: string
  title?: string
  status: string
  notes?: string
  monthly_fee?: number
  setup_fee?: number
}

interface DashboardFollowUp {
  id: string
  title?: string
  note?: string
  due_date?: string
}

interface DashboardActivity {
  id: string
  business_name: string
  status: string
  created_at: string
}

interface DashboardClientProps {
  monthlyRevenue: number
  revenueTarget: number
  revenueTrend: string
  revenueUp: boolean
  revenuePercent: number
  hotLeadsCount: number
  activeProjectsCount: number
  totalLeadsCount: number
  pendingFollowUps: number
  newLeadsThisMonth: number
  weeklyRevenue: number[]
  aiStats: { spentUsd: number; capUsd: number; percentUsed: number }
  recentProjects: DashboardProject[]
  recentLeadActivity: DashboardActivity[]
  followUps: DashboardFollowUp[]
  actionLeads?: EnrichedLead[]
  sectorSuggestions?: { sector: string; query: string; reason: string }[]
  sectorWallets?: { name: string; amount: number; share: number }[]
}

// Status colors mirror the Calm Operator Console semantic tokens (globals.css).
// Hex (not var()) is required here because these values are interpolated into
// hex-alpha suffixes (`${color}1f`) and inline styles where var()-inside-color-mix
// is unreliable cross-browser (Safari/Firefox). Keep in sync with globals.css.
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktif', color: '#30d158' },        // --success
  completed: { label: 'Tamamlandı', color: '#64d2ff' }, // --info
  pending: { label: 'Bekliyor', color: '#ffd60a' },     // --warning
  cancelled: { label: 'İptal', color: '#ff453a' },      // --danger
  new: { label: 'Yeni', color: '#64d2ff' },             // --info
  contacted: { label: 'İletişim', color: '#ffd60a' },   // --warning
  converted: { label: 'Kazanıldı', color: '#30d158' },  // --success
  proposal: { label: 'Teklif', color: '#30d158' },      // --accent
}

export function DashboardClient(props: DashboardClientProps) {
  const [cashFlowTab, setCashFlowTab] = useState<'monthly' | 'yearly'>('monthly')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLead, setSelectedLead] = useState<EnrichedLead | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => {
      setMounted(true)
    })
  }, [])

  const actionLeads = useMemo(() => props.actionLeads || [], [props.actionLeads])

  const qualityMissingCount = useMemo(() => {
    return actionLeads.filter(l => !l.quality_score || l.quality_score === 0).length
  }, [actionLeads])

  // Bugünün 5 Yeni Lead'i (calculated directly on render, ultra-fast and avoids compiler memoization issues)
  const todayStr = new Date().toISOString().split('T')[0]
  const todayLeads = actionLeads.filter(l => l.created_at && l.created_at.startsWith(todayStr))
  
  const todaysLeads = todayLeads.length > 0
    ? todayLeads.slice(0, 5)
    : [...actionLeads]
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 5)

  // Bugünün Satış Planı verisi
  const plan = useMemo(() => {
    const q = (l: EnrichedLead) => l.quality_score || 0
    const overdue = actionLeads
      .filter(l => l.nextAction?.isOverdue && l.status !== 'converted' && l.status !== 'lost')
      .sort((a, b) => q(b) - q(a))
      .slice(0, 5)
    const hottest = actionLeads
      .filter(l => l.lead_tier === 'A' && !l.disqualification_reason && (l.status === 'new' || l.status === 'contacted'))
      .sort((a, b) => q(b) - q(a))
      .slice(0, 5)
    const fastMoney = actionLeads
      .filter(l => !l.disqualification_reason && (l.status === 'new' || l.status === 'contacted'))
      .sort((a, b) => {
        const aConv = a.conversion_probability || 0
        const bConv = b.conversion_probability || 0
        if (bConv !== aConv) return bConv - aConv
        const aVal = a.estimated_monthly_value || 0
        const bVal = b.estimated_monthly_value || 0
        return bVal - aVal
      })
      .slice(0, 5)
    const potentialMRR = actionLeads
      .filter(l => l.status !== 'lost' && l.status !== 'converted')
      .reduce((s, l) => s + (l.estimated_monthly_value || 0), 0)
    return { overdue, hottest, fastMoney, potentialMRR }
  }, [actionLeads])

  // Live Cash Flow: derived from real projects (MRR) + ai_cost_logs (monthly cost).
  const {
    data: cashFlowData = [],
    isLoading: cashFlowLoading,
    isError: cashFlowError,
  } = useQuery({
    queryKey: ['cash-flow'],
    queryFn: async (): Promise<CashFlowPoint[]> => {
      const [projects, costLogs] = await Promise.all([
        fetchProjects({ limit: 500 }),
        dbGet<CostLogRow>('ai_cost_logs', { limit: 1000 }),
      ])
      return buildCashFlow(projects, costLogs)
    },
  })

  const hasCashFlow = cashFlowData.some((p) => p.inflow !== 0 || p.outflow !== 0)
  const peakInflow = cashFlowData.reduce(
    (max, p) => (p.inflow > max.inflow ? p : max),
    { name: '—', inflow: 0, outflow: 0 } as CashFlowPoint
  )

  // Filter recent projects based on search query
  const filteredProjects = props.recentProjects.filter(p => {
    const name = (p.business_name || p.title || '').toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const remainingTarget = Math.max(0, props.revenueTarget - props.monthlyRevenue)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0 scrollbar-thin">
        <div className="space-y-6 max-w-[1200px]">

          {/* Page Sub-Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)]">Komuta <span className="italic font-normal">Merkezi</span></h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Sisteminizin genel durum özeti ve performans verileri.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" /> {new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })}
              </span>
              <button
                onClick={() => window.location.reload()}
                className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] font-bold px-3 py-1.5 rounded-lg transition-all"
              >
                Veriyi Sıfırla
              </button>
            </div>
          </div>

          {/* Veri Bakımı Gerekli (Admin Maintenance Warning) */}
          {qualityMissingCount > 0 && (
            <div className="bg-[color-mix(in_srgb,var(--warning)_7%,var(--bg-base))] border border-[var(--warning)]/30 rounded-2xl p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-[var(--warning)] shrink-0" />
                <div>
                  <h4 className="text-xs font-black text-[var(--warning)] uppercase tracking-wider">Veri Bakımı Gerekli: Eksik Kalite Skorları</h4>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Sistemde {qualityMissingCount} lead için kalite skoru ve yapay zeka analizleri eksik. Doğru satış kararları için lütfen backfill çalıştırın.</p>
                </div>
              </div>
              <button 
                onClick={async () => {
                  try {
                    const res = await fetch('/api/leads/backfill', { method: 'POST' })
                    const data = await res.json()
                    if (data.success) {
                      alert(`Zenginleştirme başarıyla tamamlandı: ${data.processed} lead güncellendi.`);
                      window.location.reload()
                    } else {
                      alert(`Hata: ${data.error}`);
                    }
                  } catch {
                    alert('Ağ hatası oluştu.');
                  }
                }}
                className="text-[10px] bg-[var(--warning)] hover:brightness-110 text-white font-black px-4 py-2 rounded-xl shrink-0 transition-all shadow-[0_4px_12px_color-mix(in_srgb,var(--warning)_25%,transparent)]"
              >
                Şimdi Backfill Çalıştır
              </button>
            </div>
          )}

          {/* Bugün Hangi Sektörü Taramalıyım? */}
          {props.sectorSuggestions && props.sectorSuggestions.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2 mb-3">
                <Search className="w-3.5 h-3.5 text-[var(--accent)]" />
                Bugün Taranacak Sektörler
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {props.sectorSuggestions.slice(0, 3).map((s, i) => (
                  <a key={i} href="/harita" className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] rounded-xl p-3 transition-all group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="num text-[9px] font-black text-[var(--accent)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded">#{i + 1}</span>
                      <span className="text-[11px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate">{s.sector}</span>
                    </div>
                    <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.reason}</p>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1">Sorgu: &quot;{s.query}&quot;</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Bugünün 5 Yeni Lead'i */}
          {todaysLeads.length > 0 && (
            <div className="bg-[var(--bg-surface)] border border-[var(--success)]/20 rounded-2xl p-5 space-y-4 shadow-soft">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-[var(--success)] uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Bugünün 5 Yeni Müşteri Adayı
                  </h3>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">1 Haziran 2026 Pazartesi&apos;den itibaren her gün otomatik olarak taranan en taze fırsatlar.</p>
                </div>
                <span className="text-[10px] bg-[var(--success)]/10 text-[var(--success)] font-bold px-2.5 py-1 rounded-md border border-[var(--success)]/20">
                  {todaysLeads.length} Yeni Lead
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {todaysLeads.map((l) => {
                  const isA = l.lead_tier === 'A'
                  const actionLabel = l.next_action_priority === 'call_now' ? 'Bugün Ara' : 'Mini Audit Gönder'
                  const pitchText = l.first_30_seconds_pitch || l.first_message || ''
                  
                  return (
                    <div
                      key={l.id}
                      className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--success)]/30 rounded-xl p-4 flex flex-col justify-between transition-all duration-300 relative group cursor-pointer"
                      onClick={() => setSelectedLead(l)}
                    >
                      <div className="space-y-2">
                        {/* Header: Name & Tier */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-extrabold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--success)] transition-colors">{l.business_name}</h4>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                            isA ? 'bg-[var(--success)]/15 text-[var(--success)] border border-[var(--success)]/20' : 'bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/20'
                          }`}>
                            {l.lead_tier}-Tier
                          </span>
                        </div>

                        {/* Sector / District */}
                        <p className="text-[9px] text-[var(--text-secondary)] font-medium truncate">
                          {l.sector} · <span className="text-[var(--text-muted)]">{l.district}</span>
                        </p>

                        {/* Why Now */}
                        <div className="bg-[var(--bg-elevated)] rounded-lg p-2.5 space-y-1">
                          <span className="text-[8px] font-black text-[var(--success)] uppercase tracking-wider block">Neden Şimdi?</span>
                          <p className="text-[9px] text-[var(--text-primary)] leading-relaxed line-clamp-3 italic">
                            &quot;{l.why_this_will_convert || l.why_now || 'Güçlü dönüşüm sinyalleri.'}&quot;
                          </p>
                        </div>

                        {/* Pitch */}
                        {pitchText && (
                          <div className="bg-[var(--success)]/5 rounded-lg p-2.5 space-y-1 border border-[var(--success)]/10 relative group/pitch">
                            <span className="text-[8px] font-black text-[var(--success)] uppercase tracking-wider block">Açılış Pitch / İlk Mesaj</span>
                            <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed line-clamp-4 select-all">
                              {pitchText}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(pitchText);
                                alert('Pitch kopyalandı!');
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover/pitch:opacity-100 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--success)] p-1 rounded transition-all text-[8px] text-[var(--success)] font-bold"
                            >
                              Kopyala
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Footer: Action Button */}
                      <div className="pt-3 border-t border-[var(--border-subtle)]/50 mt-3 flex items-center justify-between">
                        <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase">Aksiyon</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          l.next_action_priority === 'call_now' ? 'bg-[var(--warning)]/15 text-[var(--warning)]' : 'bg-purple-500/15 text-purple-400'
                        }`}>
                          {l.next_action_priority === 'call_now' ? '📞 ' : '📋 '}
                          {actionLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bugünün Satış Planı */}
          {(plan.overdue.length > 0 || plan.hottest.length > 0 || plan.fastMoney.length > 0) && (
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Bugünün Satış Planı
                  </h3>
                  <p className="text-[9px] text-[var(--text-muted)] mt-0.5">
                    {actionLeads.length} lead taranıyor · Potansiyel aylık değer ₺{Math.round(plan.potentialMRR / 1000)}k
                  </p>
                </div>
                <a href="/pipeline" className="text-[9px] font-bold text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1">
                  Pipeline&apos;a git <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)]">
                <PlanColumn
                  title="Geciken Takipler"
                  icon={AlertTriangle}
                  color="var(--danger)"
                  leads={plan.overdue}
                  emptyMessage="Geciken takip yok — temiz."
                  onSelect={setSelectedLead}
                />
                <PlanColumn
                  title="Bugün Aranacak A-Tier Müşteriler"
                  icon={Star}
                  color="var(--success)"
                  leads={plan.hottest}
                  emptyMessage="Yüksek kaliteli A-tier müşteri bulunamadı."
                  onSelect={setSelectedLead}
                />
                <PlanColumn
                  title="En Hızlı Paraya Dönecekler"
                  icon={Wallet}
                  color="#a78bfa"
                  leads={plan.fastMoney}
                  emptyMessage="Dönüşüm olasılığı yüksek lead yok."
                  onSelect={setSelectedLead}
                />
              </div>
            </div>
          )}

          {/* ROW 1: 3 Premium Cards (Glowing Net Gelir + 2 Charcoal Glass) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Kasa & Net Gelir (Framer violet gradient spotlight imzası) */}
            <div className="gradient-spotlight gradient-spotlight-violet text-white p-5 flex flex-col justify-between min-h-[160px] overflow-hidden group hover:scale-[1.01] transition-transform duration-200">
              {/* Background Glow Ring */}
              <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-110 transition-transform duration-300" />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Kasa & Net Gelir</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black bg-white/10 px-2 py-0.5 rounded-full num">
                    {props.revenueUp ? <TrendingUp className="w-3 h-3 text-white" /> : <TrendingDown className="w-3 h-3 text-white" />}
                    %{props.revenueTrend}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-3xl font-black tracking-tight leading-none num lira">
                    ₺{props.monthlyRevenue.toLocaleString('tr-TR')}
                  </div>
                  <p className="text-[10px] text-white/60 mt-1.5 font-medium">Bu ay toplanan net ciro</p>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/10 mt-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/70">Detayları İncele</span>
                <ArrowRight className="w-3.5 h-3.5 text-white group-hover:translate-x-1 transition-all" />
              </div>
            </div>

            {/* Card 2: Savings Account style (Hedef & Kalan Ciro) */}
            <div className="glass-card rounded-2xl p-5 flex flex-col justify-between min-h-[160px] transition-all duration-300 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Hedef Projeksiyon</span>
                  </div>
                  <span className="num text-[9px] font-bold bg-[var(--accent-muted)] border border-[var(--accent)]/15 text-[var(--accent)] px-2 py-0.5 rounded-full">
                    %{props.revenuePercent.toFixed(0)} Tamamlandı
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-[var(--text-primary)] num lira">
                    ₺{remainingTarget.toLocaleString('tr-TR')}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5 font-medium">Hedefe kalan ciro miktarı</p>
                </div>
              </div>

              <div className="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] h-full rounded-full transition-all duration-1000"
                  style={{ width: `${props.revenuePercent}%` }}
                />
              </div>
            </div>

            {/* Card 3: Investment Portfolio style (Yapay Zekâ Operasyonel ROI) */}
            <div className="glass-card rounded-2xl p-5 flex flex-col justify-between min-h-[160px] transition-all duration-300 hover:-translate-y-0.5">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                      <Cpu className="w-4 h-4 text-[var(--info)]" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Yapay Zekâ Altyapısı</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-[var(--success)] shadow-[0_0_0_3px_rgba(48,209,88,0.15)]" />
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-[var(--text-primary)] num">
                    ${props.aiStats.spentUsd.toFixed(2)}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5 font-medium">Kullanılan limit: %{props.aiStats.percentUsed} (Aylık ${props.aiStats.capUsd})</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] mt-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Altyapı Verimliliği</span>
                <span className="num text-[10px] font-black text-[var(--success)]">%99.8 Aktif</span>
              </div>
            </div>

          </div>

          {/* ROW 2: My Wallet style Sector Grid + Cash Flow glowing chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Left Col (5/12 width): My Wallet style Active Sectors */}
            <div className="lg:col-span-5 glass-card rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-3">
                  <div>
                    <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Aktif Sektörler</h3>
                    <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Sektör bazlı ciro dağılımları ve cüzdan limitleri</p>
                  </div>
                  <button className="text-[9px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-secondary)] font-bold px-2 py-1 rounded transition-all">
                    Sektör Ekle
                  </button>
                </div>

                {/* Sektörel Cüzdanlar Grid (2x2) — gerçek kategori ciroları (bu ay tahsil edilen) */}
                {props.sectorWallets && props.sectorWallets.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {props.sectorWallets.map((wallet, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:border-[var(--border-highlight)] transition-colors duration-200 flex flex-col justify-between min-h-[100px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase">{walletCode(wallet.name)}</span>
                          <span className="num text-[8px] font-black text-[var(--accent)] uppercase">%{wallet.share}</span>
                        </div>
                        <div className="mt-2.5">
                          <div className="num lira text-sm font-black text-[var(--text-primary)] truncate">{walletTL(wallet.amount)}</div>
                          <div className="text-[8px] text-[var(--text-muted)] font-bold mt-1 uppercase tracking-wider truncate">{wallet.name}</div>
                        </div>
                        <div className="text-[8px] text-[var(--text-secondary)]/70 font-semibold mt-1 border-t border-[var(--border-subtle)] pt-1">
                          Bu ay tahsil edilen ciro
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-10 px-3">
                    <Wallet className="w-6 h-6 text-[var(--border-highlight)] mb-2" />
                    <p className="text-[11px] text-[var(--text-secondary)] font-semibold">Henüz sektör cirosu yok</p>
                    <p className="text-[9px] text-[var(--text-muted)] mt-1 leading-relaxed">Proje geliri tahsil edildikçe sektör dağılımı burada görünecek.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Col (7/12 width): Cash Flow Glowing Bar Chart */}
            <div className="lg:col-span-7 glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 border-b border-[var(--border-subtle)] pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Ciro Akışı</h3>
                  <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Gelirlerin aylık dağılımı ve nakit sirkülasyonu</p>
                </div>
                <div className="flex bg-[var(--bg-elevated)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                  <button
                    onClick={() => setCashFlowTab('monthly')}
                    className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${
                      cashFlowTab === 'monthly'
                        ? 'bg-[var(--accent)] text-white font-black'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Aylık
                  </button>
                  <button
                    onClick={() => setCashFlowTab('yearly')}
                    className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${
                      cashFlowTab === 'yearly'
                        ? 'bg-[var(--accent)] text-white font-black'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Yıllık
                  </button>
                </div>
              </div>

              <div className="h-48">
                {!mounted || cashFlowLoading ? (
                  <div className="w-full h-[192px] bg-[var(--bg-base)] rounded-lg animate-pulse border border-[var(--border-subtle)] flex items-center justify-center text-[10px] text-[var(--text-muted)] font-black uppercase">Grafik Yükleniyor...</div>
                ) : cashFlowError ? (
                  <div className="w-full h-[192px] bg-[var(--bg-base)] rounded-lg border border-[var(--danger)]/20 flex items-center justify-center text-[10px] text-[var(--danger)] font-bold uppercase tracking-wider">Ciro akışı yüklenemedi</div>
                ) : !hasCashFlow ? (
                  <div className="w-full h-[192px] bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)] flex flex-col items-center justify-center gap-1 text-[var(--text-muted)]">
                    <span className="text-[10px] font-black uppercase tracking-wider">Henüz ciro verisi yok</span>
                    <span className="text-[9px] text-[var(--text-muted)]/70">Aktif proje eklendiğinde MRR burada görünecek.</span>
                  </div>
                ) : (
                  <CashFlowChart data={cashFlowData} />
                )}
              </div>

              <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] font-black uppercase mt-3 pt-2 border-t border-[var(--border-subtle)]">
                <span>{new Date().getFullYear()} Nakit Akışı (Son 6 Ay)</span>
                {hasCashFlow && (
                  <span className="num text-[var(--accent)]">
                    En yüksek giriş: {peakInflow.name} (₺{peakInflow.inflow.toLocaleString('tr-TR')})
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* ROW 3: Recent Activities Table */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Son Projeler & Aktiviteler</h3>
                <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Sistemdeki son kazanılan ve işleme alınan projeler</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Müşteri ara..."
                    className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[var(--accent)] rounded-lg text-[10px] py-1.5 pl-8 pr-3 outline-none w-48 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all"
                  />
                </div>
                {/* Filter Icon */}
                <button className="p-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all">
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">MÜŞTERİ HİZMET ADI</th>
                    <th className="px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">LİSANS TÜRÜ</th>
                    <th className="px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider text-right">KURULUM BEDELİ</th>
                    <th className="px-5 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider text-center">DURUM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map((p: DashboardProject) => {
                      const st = STATUS_MAP[p.status] || { label: p.status, color: 'var(--text-muted)' }
                      return (
                        <tr key={p.id} className="border-b border-[var(--border-subtle)]/50 last:border-0 hover:bg-[var(--bg-surface)]/40 transition-all">
                          <td className="px-5 py-3.5 text-xs font-semibold text-[var(--text-primary)]">
                            {p.business_name || p.title || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-[var(--text-secondary)]">
                            {p.notes?.split(':')[0] || 'Standart Hizmet'}
                          </td>
                          <td className="px-5 py-3.5 text-xs font-bold text-[var(--text-primary)] text-right num lira">
                            ₺{(p.monthly_fee || p.setup_fee || 0).toLocaleString('tr-TR')}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className="text-[9px] font-black tracking-widest uppercase px-2.5 py-1 rounded-lg"
                              style={{ color: st.color, background: `${st.color}1f`, border: `1px solid ${st.color}40` }}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-xs text-[var(--text-muted)] italic">
                        Sonuç bulunamadı
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* Right Column: Follow-ups & Activity Sidebar */}
      <aside className="w-[280px] shrink-0 border-l border-[var(--border-subtle)] overflow-y-auto bg-[var(--bg-base)] scrollbar-thin">
        <div className="p-5 space-y-6">

          {/* Follow-ups */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
              <Clock className="w-4 h-4 text-[var(--warning)]" />
              <h3 className="text-[10px] font-black text-[var(--text-primary)] tracking-widest uppercase">Takip Listesi</h3>
            </div>
            {props.followUps.length > 0 ? (
              props.followUps.map((f: DashboardFollowUp) => (
                <div key={f.id} className="py-2 border-b border-[var(--border-subtle)]/30 last:border-0 hover:translate-x-1 transition-all">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{f.title || f.note || '—'}</div>
                  <div className="text-[9px] text-[var(--text-muted)] mt-1 font-bold flex items-center justify-between">
                    <span>{f.due_date ? new Date(f.due_date).toLocaleDateString('tr-TR') : '—'}</span>
                    <span className="text-[var(--warning)] lowercase font-medium">beklemede</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[10px] text-[var(--text-muted)] italic py-2">Takip bekleyen yok.</div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
              <Activity className="w-4 h-4 text-[var(--info)]" />
              <h3 className="text-[10px] font-black text-[var(--text-primary)] tracking-widest uppercase">Son Aktivite</h3>
            </div>
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
              {props.recentLeadActivity.length > 0 ? (
                props.recentLeadActivity.map((l: DashboardActivity) => {
                  const st = STATUS_MAP[l.status] || { label: l.status, color: 'var(--text-muted)' }
                  return (
                    <div key={l.id} className="flex items-center gap-2 py-1 border-b border-[var(--border-subtle)]/20 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 font-semibold">{l.business_name}</span>
                      <span className="num text-[8px] text-[var(--text-muted)] shrink-0 font-bold">
                        {new Date(l.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="text-[10px] text-[var(--text-muted)] italic py-2">Henüz aktivite yok.</div>
              )}
            </div>
          </div>

          {/* AI Cost Breakdown */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
              <Cpu className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-[10px] font-black text-[var(--text-primary)] tracking-widest uppercase">AI Dağılımı</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Light (Gemini Flash)', pct: 60, color: 'var(--accent)' },
                { label: 'Medium (Claude Haiku)', pct: 25, color: 'var(--info)' },
                { label: 'Heavy (DeepSeek Pro)', pct: 15, color: 'var(--warning)' },
              ].map(tier => (
                <div key={tier.label} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-secondary)] font-medium">{tier.label}</span>
                    <span className="num font-bold text-[var(--text-primary)]">{tier.pct}%</span>
                  </div>
                  <div className="w-full h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${tier.pct}%`, backgroundColor: tier.color }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-[10px]">
                <span className="text-[var(--text-muted)] font-bold">TOPLAM AY</span>
                <span className="num font-black text-[var(--text-primary)]">${props.aiStats.spentUsd.toFixed(2)} / ${props.aiStats.capUsd}</span>
              </div>
            </div>
          </div>

        </div>
      </aside>

      {selectedLead && (
        <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  )
}

function PlanColumn({
  title, icon: Icon, color, leads, emptyMessage, onSelect,
}: {
  title: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
  leads: EnrichedLead[]
  emptyMessage: string
  onSelect: (l: EnrichedLead) => void
}) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] font-black tracking-widest uppercase" style={{ color }}>{title}</span>
        <span className="num text-[9px] font-bold text-[var(--text-muted)] ml-auto">{leads.length}</span>
      </div>
      {leads.length === 0 ? (
        <div className="text-[10px] text-[var(--text-muted)] italic py-4 text-center">{emptyMessage}</div>
      ) : (
        leads.map(l => (
          <button
            key={l.id}
            onClick={() => onSelect(l)}
            className="w-full text-left p-2.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/40 rounded-lg transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="text-xs font-bold text-[var(--text-primary)] truncate flex-1">{l.business_name}</div>
              <div className="num text-[10px] font-black shrink-0" style={{ color }}>{l.potential_score || 0}</div>
            </div>
            <div className="text-[9px] text-[var(--text-secondary)] truncate mb-1">{l.sector} · {l.city}</div>
            <div className="text-[9px] text-[var(--text-muted)] truncate flex items-center justify-between">
              <span className="truncate flex-1">{l.next_action}</span>
              <ChevronRight className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0 ml-1 transition-colors" />
            </div>
          </button>
        ))
      )}
    </div>
  )
}
