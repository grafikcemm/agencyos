import { supabaseAdmin as supabase } from '@/lib/supabase'
import { HeroCard } from '@/components/dashboard/HeroCard'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ModuleCard } from '@/components/dashboard/ModuleCard'
import { RightPanel } from '@/components/layout/RightPanel'

export const revalidate = 0

export default async function DashboardPage() {
  const { data: settingsData } = await supabase.from('settings').select('*')
  const settings: Record<string, string> = {}
  settingsData?.forEach((s: { key: string; value: string }) => { settings[s.key] = s.value })

  const revenueTarget = parseInt(settings.monthly_revenue_target_tl || '120000')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const weekStarts = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (3 - i) * 7 - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })

  const { data: monthlyRevenueData } = await supabase
    .from('projects')
    .select('revenue_tl, created_at')
    .eq('revenue_collected', true)
    .gte('created_at', startOfMonth.toISOString())

  const monthlyRevenue = monthlyRevenueData?.reduce((acc: number, p: { revenue_tl: number }) => acc + (p.revenue_tl || 0), 0) || 0

  const { data: lastMonthData } = await supabase
    .from('projects')
    .select('revenue_tl')
    .eq('revenue_collected', true)
    .gte('created_at', startOfLastMonth.toISOString())
    .lte('created_at', endOfLastMonth.toISOString())

  const lastMonthRevenue = lastMonthData?.reduce((acc: number, p: { revenue_tl: number }) => acc + (p.revenue_tl || 0), 0) || 0

  const { data: allRevenueData } = await supabase
    .from('projects')
    .select('revenue_tl, created_at')
    .eq('revenue_collected', true)
    .gte('created_at', weekStarts[0].toISOString())

  const weeklyRevenue = weekStarts.map((weekStart, i) => {
    const weekEnd = i < 3 ? weekStarts[i + 1] : new Date(now.getTime() + 86400000)
    return allRevenueData?.filter((p: { created_at: string; revenue_tl: number }) => {
      const d = new Date(p.created_at)
      return d >= weekStart && d < weekEnd
    }).reduce((acc: number, p: { revenue_tl: number }) => acc + (p.revenue_tl || 0), 0) || 0
  })

  const { count: hotLeadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .or('score.gte.60,potential_score.gte.60')

  const { count: activeProjectsCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  const { count: totalLeadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  const { data: aiCostData } = await supabase
    .from('ai_cost_logs')
    .select('cost_tl')
    .gte('created_at', startOfMonth.toISOString())

  const aiMonthlyCost = aiCostData?.reduce((acc: number, log: { cost_tl: number }) => acc + (log.cost_tl || 0), 0) || 0

  const { count: pendingFollowUps } = await supabase
    .from('follow_ups')
    .select('*', { count: 'exact', head: true })
    .eq('is_done', false)

  const { count: pipelineOfferCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'proposal')

  const revenueTrend = lastMonthRevenue > 0
    ? `%${(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(0)} geçen aya göre`
    : undefined

  const revenueDown = lastMonthRevenue > 0 && monthlyRevenue < lastMonthRevenue

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        <div className="space-y-5">
          <HeroCard
            agencyName="Grafikcem Agency"
            monthlyRevenue={monthlyRevenue}
            targetRevenue={revenueTarget}
            hotLeadsCount={hotLeadsCount || 0}
            pendingFollowUps={pendingFollowUps || 0}
            weeklyRevenue={weeklyRevenue}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              title="Aylık Gelir"
              value={`₺${monthlyRevenue.toLocaleString('tr-TR')}`}
              trendText={revenueTrend}
              trendDown={revenueDown}
            />
            <MetricCard
              title="Sıcak Lead"
              value={(hotLeadsCount || 0).toString()}
            />
            <MetricCard
              title="Aktif Proje"
              value={(activeProjectsCount || 0).toString()}
            />
            <MetricCard
              title="AI Maliyeti"
              value={`₺${aiMonthlyCost.toFixed(2)}`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <ModuleCard
              number="01"
              title="Lead Radar"
              description="Harita taraması ve AI analizi"
              badge={`${totalLeadsCount || 0} lead`}
              href="/radar"
            />
            <ModuleCard
              number="02"
              title="Müşteri Akışı"
              description="Pipeline ve teklif takibi"
              badge={`${pipelineOfferCount || 0} teklif`}
              href="/pipeline"
            />
            <ModuleCard
              number="03"
              title="Hizmetlerim"
              description="₺ bazlı hizmet paketleri"
              badge="paketler"
              href="/services"
            />
            <ModuleCard
              number="04"
              title="Proje Takibi"
              description="Aktif işler ve tahsilat"
              badge={`${activeProjectsCount || 0} aktif`}
              href="/projects"
            />
            <ModuleCard
              number="05"
              title="Mini Audit"
              description="Lead için AI analiz raporu"
              badge="pro"
              href="/radar"
            />
            <ModuleCard
              number="06"
              title="Pitch Kütüphanesi"
              description="DM, e-posta, LinkedIn taslakları"
              badge="hazır"
              href="/pipeline"
            />
          </div>
        </div>
      </div>

      {/* Right panel — only on dashboard */}
      <aside className="w-[240px] shrink-0 border-l border-[var(--border-subtle)] overflow-y-auto">
        <RightPanel />
      </aside>
    </div>
  )
}
