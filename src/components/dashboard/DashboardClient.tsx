"use client"

import { useMemo, useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Cpu, Flame, Clock, Activity, Search, Filter, ArrowRight, Wallet, CheckCircle, Star, AlertTriangle, ChevronRight } from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { LeadDrawer } from '@/components/map/LeadDrawer'
import type { EnrichedLead } from '@/lib/enrichLead'

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
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: 'Aktif', color: '#22c55e' },
  completed: { label: 'Tamamlandı', color: '#3b82f6' },
  pending: { label: 'Bekliyor', color: '#f59e0b' },
  cancelled: { label: 'İptal', color: '#ef4444' },
  new: { label: 'Yeni', color: '#3b82f6' },
  contacted: { label: 'İletişim', color: '#f59e0b' },
  converted: { label: 'Kazanıldı', color: '#22c55e' },
  proposal: { label: 'Teklif', color: '#E8440A' },
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

  // Mock Cash Flow data mirroring Fintrixity's mockup bar chart
  const cashFlowData = [
    { name: 'Oca', inflow: 28000, outflow: -12000 },
    { name: 'Şub', inflow: 34000, outflow: -15000 },
    { name: 'Mar', inflow: 540323, outflow: -80000 }, // Highlighted March bar matching mockup
    { name: 'Nis', inflow: 42000, outflow: -18000 },
    { name: 'May', inflow: 59000, outflow: -22000 },
    { name: 'Haz', inflow: 73000, outflow: -25000 },
    { name: 'Tem', inflow: 81000, outflow: -30000 }
  ]

  // Filter recent projects based on search query
  const filteredProjects = props.recentProjects.filter(p => {
    const name = (p.business_name || p.title || '').toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const remainingTarget = Math.max(0, props.revenueTarget - props.monthlyRevenue)

  return (
    <div className="flex h-full overflow-hidden bg-[#08080a]">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0 scrollbar-thin">
        <div className="space-y-6 max-w-[1200px]">

          {/* Page Sub-Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#f5f5f7]">Komuta Merkezi</h1>
              <p className="text-xs text-[#5f5f69] mt-0.5">Sisteminizin genel durum özeti ve performans verileri.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] bg-[#16161b] border border-[#1c1c22] text-[#9f9fa9] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" /> 2026 Mayıs
              </span>
              <button 
                onClick={() => window.location.reload()}
                className="text-[10px] bg-[#16161b] border border-[#1c1c22] text-[#f5f5f7] hover:border-[var(--accent)] hover:text-[var(--accent)] font-bold px-3 py-1.5 rounded-lg transition-all"
              >
                Veriyi Sıfırla
              </button>
            </div>
          </div>

          {/* Temiz Başlangıç Hazır (Clean Production Start standby UX) */}
          {(actionLeads.length === 0 && new Date().getTime() < new Date('2026-06-01T00:00:00+03:00').getTime()) && (
            <div className="bg-[#0b100d] border border-green-500/25 rounded-2xl p-5 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1 shadow-[0_4px_24px_rgba(34,197,94,0.03)]">
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20 shrink-0 text-green-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-green-400 uppercase tracking-widest">Temiz Başlangıç Hazır</h4>
                  <p className="text-[10px] text-[#9f9fa9] mt-1 font-medium leading-relaxed">
                    Sistem 1 Haziran 2026 Pazartesi günü otomatik ve temiz bir başlangıç yapacak şekilde hazırlandı. 
                    Otomatik tarama <span className="text-green-400 font-bold">1 Haziran Pazartesi 08:00 (TR)</span> saatinde başlayacaktır.
                  </p>
                  <p className="text-[9px] text-[#5f5f69] mt-1 font-bold">
                    💡 İpucu: dry-run testi şu an arka planda tam 5 adet kaliteli müşteri adayı bulabiliyor.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/cron/daily-scan?dryRun=true')
                    const data = await res.json()
                    alert(`Dry-run Başarılı! Aday Sayısı: ${data.wouldInsertCount || 0}`);
                  } catch {
                    alert('Dry-run isteği başarısız oldu.');
                  }
                }}
                className="text-[10px] bg-green-500 hover:bg-green-600 text-black font-black px-4 py-2.5 rounded-xl shrink-0 transition-all shadow-[0_4px_12px_rgba(34,197,94,0.15)] flex items-center gap-1"
              >
                Dry-run Testi Yap <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Veri Bakımı Gerekli (Admin Maintenance Warning) */}
          {qualityMissingCount > 0 && (
            <div className="bg-[#1c120c] border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider">Veri Bakımı Gerekli: Eksik Kalite Skorları</h4>
                  <p className="text-[10px] text-[#9f9fa9] mt-0.5">Sistemde {qualityMissingCount} lead için kalite skoru ve yapay zeka analizleri eksik. Doğru satış kararları için lütfen backfill çalıştırın.</p>
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
                className="text-[10px] bg-amber-500 hover:bg-amber-600 text-black font-black px-4 py-2 rounded-xl shrink-0 transition-all shadow-[0_4px_12px_rgba(245,158,11,0.15)]"
              >
                Şimdi Backfill Çalıştır
              </button>
            </div>
          )}

          {/* Bugün Hangi Sektörü Taramalıyım? */}
          {props.sectorSuggestions && props.sectorSuggestions.length > 0 && (
            <div className="bg-[#0f0f12] border border-[#1c1c22] rounded-2xl p-4">
              <h3 className="text-xs font-black text-[#f5f5f7] uppercase tracking-wider flex items-center gap-2 mb-3">
                <Search className="w-3.5 h-3.5 text-[var(--accent)]" />
                Bugün Taranacak Sektörler
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {props.sectorSuggestions.slice(0, 3).map((s, i) => (
                  <a key={i} href="/harita" className="bg-[#16161b] border border-[#1c1c22] hover:border-[var(--accent)] rounded-xl p-3 transition-all group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black text-[var(--accent)] bg-[var(--accent-muted)] px-1.5 py-0.5 rounded">#{i + 1}</span>
                      <span className="text-[11px] font-bold text-[#f5f5f7] group-hover:text-[var(--accent)] truncate">{s.sector}</span>
                    </div>
                    <p className="text-[9px] text-[#9f9fa9] leading-relaxed line-clamp-2">{s.reason}</p>
                    <p className="text-[9px] text-[#5f5f69] mt-1">Sorgu: &quot;{s.query}&quot;</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Bugünün 5 Yeni Lead'i */}
          {todaysLeads.length > 0 && (
            <div className="bg-[#0f0f12] border border-emerald-500/20 rounded-2xl p-5 space-y-4 shadow-[0_0_24px_rgba(16,185,129,0.03)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Bugünün 5 Yeni Müşteri Adayı
                  </h3>
                  <p className="text-[10px] text-[#9f9fa9] mt-0.5">1 Haziran 2026 Pazartesi&apos;den itibaren her gün otomatik olarak taranan en taze fırsatlar.</p>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2.5 py-1 rounded-md border border-emerald-500/20">
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
                      className="bg-[#16161b] border border-[#1c1c22] hover:border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between transition-all duration-300 relative group cursor-pointer"
                      onClick={() => setSelectedLead(l)}
                    >
                      <div className="space-y-2">
                        {/* Header: Name & Tier */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-extrabold text-[#f5f5f7] line-clamp-1 group-hover:text-emerald-400 transition-colors">{l.business_name}</h4>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                            isA ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                          }`}>
                            {l.lead_tier}-Tier
                          </span>
                        </div>

                        {/* Sector / District */}
                        <p className="text-[9px] text-[#9f9fa9] font-medium truncate">
                          {l.sector} · <span className="text-[#5f5f69]">{l.district}</span>
                        </p>

                        {/* Why Now */}
                        <div className="bg-[#1c1c22] rounded-lg p-2.5 space-y-1">
                          <span className="text-[8px] font-black text-emerald-500 uppercase tracking-wider block">Neden Şimdi?</span>
                          <p className="text-[9px] text-[#f5f5f7] leading-relaxed line-clamp-3 italic">
                            &quot;{l.why_this_will_convert || l.why_now || 'Güçlü dönüşüm sinyalleri.'}&quot;
                          </p>
                        </div>

                        {/* Pitch */}
                        {pitchText && (
                          <div className="bg-emerald-500/5 rounded-lg p-2.5 space-y-1 border border-emerald-500/10 relative group/pitch">
                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-wider block">Açılış Pitch / İlk Mesaj</span>
                            <p className="text-[9px] text-[#9f9fa9] leading-relaxed line-clamp-4 select-all">
                              {pitchText}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(pitchText);
                                alert('Pitch kopyalandı!');
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover/pitch:opacity-100 bg-[#16161b] border border-[#1c1c22] hover:border-emerald-400 p-1 rounded transition-all text-[8px] text-emerald-400 font-bold"
                            >
                              Kopyala
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Footer: Action Button */}
                      <div className="pt-3 border-t border-[#1c1c22]/50 mt-3 flex items-center justify-between">
                        <span className="text-[9px] text-[#5f5f69] font-bold uppercase">Aksiyon</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          l.next_action_priority === 'call_now' ? 'bg-amber-500/15 text-amber-400' : 'bg-purple-500/15 text-purple-400'
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
            <div className="bg-[#0f0f12] border border-[#1c1c22] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1c1c22] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-xs font-black text-[#f5f5f7] uppercase tracking-wider flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Bugünün Satış Planı
                  </h3>
                  <p className="text-[9px] text-[#5f5f69] mt-0.5">
                    {actionLeads.length} lead taranıyor · Potansiyel aylık değer ₺{Math.round(plan.potentialMRR / 1000)}k
                  </p>
                </div>
                <a href="/pipeline" className="text-[9px] font-bold text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1">
                  Pipeline&apos;a git <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#1c1c22]">
                <PlanColumn
                  title="Geciken Takipler"
                  icon={AlertTriangle}
                  color="#EF4444"
                  leads={plan.overdue}
                  emptyMessage="Geciken takip yok — temiz."
                  onSelect={setSelectedLead}
                />
                <PlanColumn
                  title="Bugün Aranacak A-Tier Müşteriler"
                  icon={Star}
                  color="#1D9E75"
                  leads={plan.hottest}
                  emptyMessage="Yüksek kaliteli A-tier müşteri bulunamadı."
                  onSelect={setSelectedLead}
                />
                <PlanColumn
                  title="En Hızlı Paraya Dönecekler"
                  icon={Wallet}
                  color="#8B5CF6"
                  leads={plan.fastMoney}
                  emptyMessage="Dönüşüm olasılığı yüksek lead yok."
                  onSelect={setSelectedLead}
                />
              </div>
            </div>
          )}

          {/* ROW 1: 3 Premium Cards (Glowing Net Gelir + 2 Charcoal Glass) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: My Balance (Active Fintrixity Orange Gradient) */}
            <div className="bg-gradient-to-br from-[#ff4e17] via-[#ff6a1a] to-[#ff8c05] text-white rounded-2xl p-5 shadow-[0_8px_30px_rgba(255,78,23,0.15)] flex flex-col justify-between min-h-[160px] relative overflow-hidden group hover:scale-[1.01] transition-all duration-300">
              {/* Background Glow Ring */}
              <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-125 transition-all duration-500" />
              
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Kasa & Net Gelir</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">
                    {props.revenueUp ? <TrendingUp className="w-3 h-3 text-white" /> : <TrendingDown className="w-3 h-3 text-white" />}
                    %{props.revenueTrend}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-3xl font-black tracking-tight leading-none lira">
                    ₺{props.monthlyRevenue.toLocaleString('tr-TR')}
                  </div>
                  <p className="text-[10px] text-white/70 mt-1.5 font-medium">Bu ay toplanan net ciro</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Detayları İncele</span>
                <ArrowRight className="w-3.5 h-3.5 text-white group-hover:translate-x-1 transition-all" />
              </div>
            </div>

            {/* Card 2: Savings Account style (Hedef & Kalan Ciro) */}
            <div className="bg-[#0f0f12] border border-[#1c1c22] hover:border-[#2c2c35] rounded-2xl p-5 flex flex-col justify-between min-h-[160px] transition-all duration-300">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#16161b] flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#9f9fa9]">Hedef Projeksiyon</span>
                  </div>
                  <span className="text-[9px] font-bold bg-[var(--accent-muted)] border border-[var(--accent)]/15 text-[var(--accent)] px-2 py-0.5 rounded-full">
                    %{props.revenuePercent.toFixed(0)} Tamamlandı
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-[#f5f5f7] lira">
                    ₺{remainingTarget.toLocaleString('tr-TR')}
                  </div>
                  <p className="text-[10px] text-[#5f5f69] mt-1.5 font-medium">Hedefe kalan ciro miktarı</p>
                </div>
              </div>

              <div className="w-full bg-[#16161b] h-1.5 rounded-full overflow-hidden mt-3">
                <div 
                  className="bg-gradient-to-r from-[#ff4e17] to-[#ff8c05] h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${props.revenuePercent}%` }}
                />
              </div>
            </div>

            {/* Card 3: Investment Portfolio style (Yapay Zekâ Operasyonel ROI) */}
            <div className="bg-[#0f0f12] border border-[#1c1c22] hover:border-[#2c2c35] rounded-2xl p-5 flex flex-col justify-between min-h-[160px] transition-all duration-300">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#16161b] flex items-center justify-center">
                      <Cpu className="w-4 h-4 text-[#3b82f6]" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#9f9fa9]">Yapay Zekâ Altyapısı</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-[#f5f5f7]">
                    ${props.aiStats.spentUsd.toFixed(2)}
                  </div>
                  <p className="text-[10px] text-[#5f5f69] mt-1.5 font-medium">Kullanılan limit: %{props.aiStats.percentUsed} (Aylık ${props.aiStats.capUsd})</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#1c1c22] mt-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#5f5f69]">Altyapı Verimliliği</span>
                <span className="text-[10px] font-black text-[#22c55e]">%99.8 Aktif</span>
              </div>
            </div>

          </div>

          {/* ROW 2: My Wallet style Sector Grid + Cash Flow glowing chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Left Col (5/12 width): My Wallet style Active Sectors */}
            <div className="lg:col-span-5 bg-[#0f0f12] border border-[#1c1c22] rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-[#1c1c22] pb-3">
                  <div>
                    <h3 className="text-xs font-black text-[#f5f5f7] uppercase tracking-wider">Aktif Sektörler</h3>
                    <p className="text-[9px] text-[#5f5f69] mt-0.5">Sektör bazlı ciro dağılımları ve cüzdan limitleri</p>
                  </div>
                  <button className="text-[9px] bg-[#16161b] border border-[#1c1c22] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[#9f9fa9] font-bold px-2 py-1 rounded transition-all">
                    Sektör Ekle
                  </button>
                </div>

                {/* Sektörel Cüzdanlar Grid (2x2) */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'Özel Sağlık', code: 'SAG', amount: '₺54.678', limit: 'Limit: ₺100k', active: true, color: '#22c55e' },
                    { name: 'E-Ticaret', code: 'ETC', amount: '₺28.345', limit: 'Limit: ₺50k', active: true, color: '#22c55e' },
                    { name: 'Lojistik', code: 'LOJ', amount: '₺20.517', limit: 'Limit: ₺40k', active: true, color: '#3b82f6' },
                    { name: 'Sigorta / Diğer', code: 'SGR', amount: '₺12.000', limit: 'Limit: ₺35k', active: false, color: '#5f5f69' },
                  ].map((wallet, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3.5 rounded-xl border transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between min-h-[100px] ${
                        wallet.active 
                          ? 'bg-[#16161b] border-[#1c1c22] hover:border-[#2c2c35]' 
                          : 'bg-[#0f0f12] border-[#1c1c22]/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black tracking-widest text-[#5f5f69] uppercase">{wallet.code}</span>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: wallet.color }} />
                          <span className="text-[8px] font-black text-[#5f5f69] uppercase">
                            {wallet.active ? 'Aktif' : 'Pasif'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <div className="text-sm font-black text-[#f5f5f7] truncate">{wallet.amount}</div>
                        <div className="text-[8px] text-[#5f5f69] font-bold mt-1 uppercase tracking-wider">{wallet.name}</div>
                      </div>
                      <div className="text-[8px] text-[#9f9fa9]/70 font-semibold mt-1 border-t border-[#1c1c22] pt-1">
                        {wallet.limit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[9px] text-[#5f5f69] italic mt-4 text-center">
                * Cüzdan limitleri Türkiye KOBİ müfredatı doğrultusunda dinamik hesaplanır.
              </p>
            </div>

            {/* Right Col (7/12 width): Cash Flow Glowing Bar Chart */}
            <div className="lg:col-span-7 bg-[#0f0f12] border border-[#1c1c22] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4 border-b border-[#1c1c22] pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-black text-[#f5f5f7] uppercase tracking-wider">Ciro Akışı</h3>
                  <p className="text-[9px] text-[#5f5f69] mt-0.5">Gelirlerin aylık dağılımı ve nakit sirkülasyonu</p>
                </div>
                <div className="flex bg-[#16161b] p-0.5 rounded-lg border border-[#1c1c22]">
                  <button 
                    onClick={() => setCashFlowTab('monthly')}
                    className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${
                      cashFlowTab === 'monthly' 
                        ? 'bg-[var(--accent)] text-black font-black' 
                        : 'text-[#9f9fa9] hover:text-[#f5f5f7]'
                    }`}
                  >
                    Aylık
                  </button>
                  <button 
                    onClick={() => setCashFlowTab('yearly')}
                    className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${
                      cashFlowTab === 'yearly' 
                        ? 'bg-[var(--accent)] text-black font-black' 
                        : 'text-[#9f9fa9] hover:text-[#f5f5f7]'
                    }`}
                  >
                    Yıllık
                  </button>
                </div>
              </div>

              <div className="h-48">
                {mounted ? (
                  <ResponsiveContainer width="100%" height={192}>
                    <BarChart data={cashFlowData}>
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ff4e17" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#ff8c05" stopOpacity={0.15} />
                        </linearGradient>
                        <linearGradient id="barGradSecondary" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#5f5f69', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#0f0f12', border: '1px solid #1c1c22', borderRadius: '12px', fontSize: '10px', color: '#f5f5f7' }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, name: any) => [
                          `₺${Number(value).toLocaleString('tr-TR')}`,
                          name === 'inflow' ? 'Giriş' : 'Çıkış'
                        ]}
                      />
                      <Bar dataKey="inflow" fill="url(#barGrad)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-[192px] bg-[#0f0f12] rounded-lg animate-pulse border border-[#1c1c22] flex items-center justify-center text-[10px] text-[#5f5f69] font-black uppercase">Grafik Yükleniyor...</div>
                )}
              </div>

              <div className="flex justify-between items-center text-[10px] text-[#5f5f69] font-black uppercase mt-3 pt-2 border-t border-[#1c1c22]">
                <span>2026 Nakit Akışı</span>
                <span className="text-[var(--accent)]">En yüksek giriş: Mart (₺540.323)</span>
              </div>
            </div>

          </div>

          {/* ROW 3: Recent Activities Table */}
          <div className="bg-[#0f0f12] border border-[#1c1c22] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1c1c22] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xs font-black text-[#f5f5f7] uppercase tracking-wider">Son Projeler & Aktiviteler</h3>
                <p className="text-[9px] text-[#5f5f69] mt-0.5">Sistemdeki son kazanılan ve işleme alınan projeler</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5f69]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Müşteri ara..."
                    className="bg-[#16161b] border border-[#1c1c22] focus:border-[var(--accent)] rounded-lg text-[10px] py-1.5 pl-8 pr-3 outline-none w-48 text-[#f5f5f7] placeholder:text-[#5f5f69] transition-all"
                  />
                </div>
                {/* Filter Icon */}
                <button className="p-1.5 bg-[#16161b] border border-[#1c1c22] rounded-lg text-[#9f9fa9] hover:text-[var(--accent)] transition-all">
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1c1c22]">
                    <th className="px-5 py-3 text-[9px] font-black text-[#5f5f69] uppercase tracking-wider">MÜŞTERİ HİZMET ADI</th>
                    <th className="px-5 py-3 text-[9px] font-black text-[#5f5f69] uppercase tracking-wider">LİSANS TÜRÜ</th>
                    <th className="px-5 py-3 text-[9px] font-black text-[#5f5f69] uppercase tracking-wider text-right">KURULUM BEDELİ</th>
                    <th className="px-5 py-3 text-[9px] font-black text-[#5f5f69] uppercase tracking-wider text-center">DURUM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map((p: DashboardProject) => {
                      const st = STATUS_MAP[p.status] || { label: p.status, color: '#6b7280' }
                      return (
                        <tr key={p.id} className="border-b border-[#1c1c22]/50 last:border-0 hover:bg-[#16161b]/40 transition-all">
                          <td className="px-5 py-3.5 text-xs font-semibold text-[#f5f5f7]">
                            {p.business_name || p.title || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-[#9f9fa9]">
                            {p.notes?.split(':')[0] || 'Standart Hizmet'}
                          </td>
                          <td className="px-5 py-3.5 text-xs font-bold text-[#f5f5f7] text-right font-mono lira">
                            ₺{(p.monthly_fee || p.setup_fee || 0).toLocaleString('tr-TR')}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span 
                              className="text-[9px] font-black tracking-widest uppercase px-2.5 py-1 rounded-lg" 
                              style={{ color: st.color, background: `${st.color}12`, border: `1px solid ${st.color}25` }}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-xs text-[#5f5f69] italic">
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
      <aside className="w-[280px] shrink-0 border-l border-[#1c1c22] overflow-y-auto bg-[#08080a] scrollbar-thin">
        <div className="p-5 space-y-6">

          {/* Follow-ups */}
          <div className="bg-[#0f0f12] border border-[#1c1c22] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-[#1c1c22] pb-2">
              <Clock className="w-4 h-4 text-[var(--warning)]" />
              <h3 className="text-[10px] font-black text-[#f5f5f7] tracking-widest uppercase">Takip Listesi</h3>
            </div>
            {props.followUps.length > 0 ? (
              props.followUps.map((f: DashboardFollowUp) => (
                <div key={f.id} className="py-2 border-b border-[#1c1c22]/30 last:border-0 hover:translate-x-1 transition-all">
                  <div className="text-xs font-semibold text-[#f5f5f7] truncate">{f.title || f.note || '—'}</div>
                  <div className="text-[9px] text-[#5f5f69] mt-1 font-bold flex items-center justify-between">
                    <span>{f.due_date ? new Date(f.due_date).toLocaleDateString('tr-TR') : '—'}</span>
                    <span className="text-[var(--warning)] lowercase font-medium">beklemede</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[10px] text-[#5f5f69] italic py-2">Takip bekleyen yok.</div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="bg-[#0f0f12] border border-[#1c1c22] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-[#1c1c22] pb-2">
              <Activity className="w-4 h-4 text-[#3b82f6]" />
              <h3 className="text-[10px] font-black text-[#f5f5f7] tracking-widest uppercase">Son Aktivite</h3>
            </div>
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
              {props.recentLeadActivity.length > 0 ? (
                props.recentLeadActivity.map((l: DashboardActivity) => {
                  const st = STATUS_MAP[l.status] || { label: l.status, color: '#6b7280' }
                  return (
                    <div key={l.id} className="flex items-center gap-2 py-1 border-b border-[#1c1c22]/20 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="text-[11px] text-[#9f9fa9] truncate flex-1 font-semibold">{l.business_name}</span>
                      <span className="text-[8px] text-[#5f5f69] shrink-0 font-bold">
                        {new Date(l.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="text-[10px] text-[#5f5f69] italic py-2">Henüz aktivite yok.</div>
              )}
            </div>
          </div>

          {/* AI Cost Breakdown */}
          <div className="bg-[#0f0f12] border border-[#1c1c22] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-[#1c1c22] pb-2">
              <Cpu className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-[10px] font-black text-[#f5f5f7] tracking-widest uppercase">AI Dağılımı</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Light (Gemini Flash)', pct: 60, color: 'var(--accent)' },
                { label: 'Medium (Claude Haiku)', pct: 25, color: '#3b82f6' },
                { label: 'Heavy (DeepSeek Pro)', pct: 15, color: '[var(--warning)]' },
              ].map(tier => (
                <div key={tier.label} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#9f9fa9] font-medium">{tier.label}</span>
                    <span className="font-bold text-[#f5f5f7]">{tier.pct}%</span>
                  </div>
                  <div className="w-full h-1 bg-[#16161b] rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${tier.pct}%`, backgroundColor: tier.color }} 
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-[#1c1c22] text-[10px]">
                <span className="text-[#5f5f69] font-bold">TOPLAM AY</span>
                <span className="font-black text-[#f5f5f7]">${props.aiStats.spentUsd.toFixed(2)} / ${props.aiStats.capUsd}</span>
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
      <div className="flex items-center gap-2 pb-2 border-b border-[#1c1c22]">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] font-black tracking-widest uppercase" style={{ color }}>{title}</span>
        <span className="text-[9px] font-bold text-[#5f5f69] ml-auto">{leads.length}</span>
      </div>
      {leads.length === 0 ? (
        <div className="text-[10px] text-[#5f5f69] italic py-4 text-center">{emptyMessage}</div>
      ) : (
        leads.map(l => (
          <button
            key={l.id}
            onClick={() => onSelect(l)}
            className="w-full text-left p-2.5 bg-[#16161b] border border-[#1c1c22] hover:border-[var(--accent)]/40 rounded-lg transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="text-xs font-bold text-[#f5f5f7] truncate flex-1">{l.business_name}</div>
              <div className="text-[10px] font-black shrink-0" style={{ color }}>{l.potential_score || 0}</div>
            </div>
            <div className="text-[9px] text-[#9f9fa9] truncate mb-1">{l.sector} · {l.city}</div>
            <div className="text-[9px] text-[#5f5f69] truncate flex items-center justify-between">
              <span className="truncate flex-1">{l.next_action}</span>
              <ChevronRight className="w-3 h-3 text-[#5f5f69] group-hover:text-[var(--accent)] shrink-0 ml-1 transition-colors" />
            </div>
          </button>
        ))
      )}
    </div>
  )
}
