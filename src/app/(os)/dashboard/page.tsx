import { supabaseAdmin as supabase } from '@/lib/supabase'
import { getMonthlyAiStats } from '@/lib/openrouter'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { enrichLead, EnrichedLead } from '@/lib/enrichLead'
import { getTopScanSuggestions } from '@/lib/sectorOpportunityEngine'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface DashboardProject {
  id: string
  business_name?: string
  title?: string
  status: string
  notes?: string
  monthly_fee?: number
  setup_fee?: number
  revenue_tl?: number | null
  created_at?: string
  category?: string | null
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

export default async function DashboardPage() {
  let monthlyRevenue = 0
  let lastMonthRevenue = 0
  let weeklyRevenue = [0, 0, 0, 0]
  let hotLeadsCount = 0
  let activeProjectsCount = 0
  let totalLeadsCount = 0
  let pendingFollowUps = 0
  let newLeadsThisMonth = 0
  let aiStats = { spentUsd: 0, capUsd: 20, percentUsed: 0 }
  let recentProjects: DashboardProject[] = []
  let recentLeadActivity: DashboardActivity[] = []
  let followUps: DashboardFollowUp[] = []
  let allLeadsRaw: unknown[] = []
  let revenueTarget = 120000

  try {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safe = <T,>(p: any, fallback: T): Promise<T> =>
      Promise.resolve(p).catch(() => fallback)

    const [
      settingsRes, monthlyRevenueRes, lastMonthRes, allRevenueRes,
      hotLeadsRes, activeProjectsRes, totalLeadsRes, aiStatsRes,
      pendingFollowUpsRes, recentProjectsRes, recentLeadsRes,
      followUpsRes, newLeadsRes,
    ] = await Promise.all([
      safe(supabase.from('settings').select('*'), { data: null } as unknown as { data: { key: string; value: string }[] | null }),
      safe(supabase.from('projects').select('revenue_tl, created_at, category').eq('revenue_collected', true).gte('created_at', startOfMonth.toISOString()), { data: null } as unknown as { data: { revenue_tl: number | null; created_at: string; category: string | null }[] | null }),
      safe(supabase.from('projects').select('revenue_tl').eq('revenue_collected', true).gte('created_at', startOfLastMonth.toISOString()).lte('created_at', endOfLastMonth.toISOString()), { data: null } as unknown as { data: { revenue_tl: number | null }[] | null }),
      safe(supabase.from('projects').select('revenue_tl, created_at').eq('revenue_collected', true).gte('created_at', weekStarts[0].toISOString()), { data: null } as unknown as { data: { revenue_tl: number | null; created_at: string }[] | null }),
      safe(supabase.from('leads').select('*', { count: 'exact', head: true }).or('score.gte.60,potential_score.gte.60'), { count: null } as unknown as { count: number | null }),
      safe(supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'), { count: null } as unknown as { count: number | null }),
      safe(supabase.from('leads').select('*', { count: 'exact', head: true }), { count: null } as unknown as { count: number | null }),
      getMonthlyAiStats().catch(() => ({ spentUsd: 0, capUsd: 20, percentUsed: 0 })),
      safe(supabase.from('follow_ups').select('*', { count: 'exact', head: true }).eq('is_done', false), { count: null } as unknown as { count: number | null }),
      safe(supabase.from('projects').select('*').order('created_at', { ascending: false }).limit(5), { data: null } as unknown as { data: DashboardProject[] | null }),
      safe(supabase.from('leads').select('id, business_name, status, created_at').order('created_at', { ascending: false }).limit(8), { data: null } as unknown as { data: DashboardActivity[] | null }),
      safe(supabase.from('follow_ups').select('*').eq('is_done', false).order('due_date').limit(5), { data: null } as unknown as { data: DashboardFollowUp[] | null }),
      safe(supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString()), { count: null } as unknown as { count: number | null }),
    ])

    // Tüm lead'leri çek (Bugünün Satış Planı için)
    const allLeadsRes = await safe(
      supabase.from('leads').select('*').order('quality_score', { ascending: false }).limit(80),
      { data: null } as unknown as { data: unknown[] | null }
    )
    allLeadsRaw = allLeadsRes?.data ?? []

    // Parse settings
    const settingsData = settingsRes?.data
    if (settingsData) {
      settingsData.forEach((s: { key: string; value: string }) => {
        if (s.key === 'monthly_revenue_target_tl') revenueTarget = parseInt(s.value) || 120000
      })
    }

    // Revenue
    const monthlyRevenueData = monthlyRevenueRes?.data
    monthlyRevenue = monthlyRevenueData?.reduce((acc: number, p: { revenue_tl?: number | null }) => acc + (p.revenue_tl || 0), 0) || 0
    lastMonthRevenue = lastMonthRes?.data?.reduce((acc: number, p: { revenue_tl?: number | null }) => acc + (p.revenue_tl || 0), 0) || 0

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {}
    monthlyRevenueData?.forEach((p: { category?: string | null; revenue_tl?: number | null }) => {
      const cat = p.category || 'Diğer'
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (p.revenue_tl || 0)
    })

    // Weekly revenue
    const allRevenueData = allRevenueRes?.data
    weeklyRevenue = weekStarts.map((weekStart, i) => {
      const weekEnd = i < 3 ? weekStarts[i + 1] : new Date(now.getTime() + 86400000)
      return allRevenueData?.filter((p: { created_at?: string }) => {
        const d = p.created_at ? new Date(p.created_at) : new Date(0)
        return d >= weekStart && d < weekEnd
      }).reduce((acc: number, p: { revenue_tl?: number | null }) => acc + (p.revenue_tl || 0), 0) || 0
    })

    // Counts
    hotLeadsCount = hotLeadsRes?.count ?? 0
    activeProjectsCount = activeProjectsRes?.count ?? 0
    totalLeadsCount = totalLeadsRes?.count ?? 0
    pendingFollowUps = pendingFollowUpsRes?.count ?? 0
    newLeadsThisMonth = newLeadsRes?.count ?? 0
    aiStats = aiStatsRes as { spentUsd: number; capUsd: number; percentUsed: number }
    recentProjects = recentProjectsRes?.data ?? []
    recentLeadActivity = recentLeadsRes?.data ?? []
    followUps = followUpsRes?.data ?? []

  } catch (error) {
    console.error('Dashboard data fetch error:', error)
  }

  const revenueTrend = lastMonthRevenue > 0
    ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(0)
    : '0'
  const revenueUp = lastMonthRevenue === 0 || monthlyRevenue >= lastMonthRevenue
  const revenuePercent = revenueTarget > 0 ? Math.min((monthlyRevenue / revenueTarget) * 100, 100) : 0

  // Enrich tüm lead'leri client'a göndermeden önce
  const enrichedLeads = allLeadsRaw
    .filter((l): l is { id: string; business_name: string } => {
      const val = l as { id?: string; business_name?: string }
      return !!(val && val.id && val.business_name)
    })
    .map(l => {
      try { return enrichLead(l) } catch { return null }
    })
    .filter(Boolean)

  return (
    <DashboardClient
      monthlyRevenue={monthlyRevenue}
      revenueTarget={revenueTarget}
      revenueTrend={revenueTrend}
      revenueUp={revenueUp}
      revenuePercent={revenuePercent}
      hotLeadsCount={hotLeadsCount}
      activeProjectsCount={activeProjectsCount}
      totalLeadsCount={totalLeadsCount}
      pendingFollowUps={pendingFollowUps}
      newLeadsThisMonth={newLeadsThisMonth}
      weeklyRevenue={weeklyRevenue}
      aiStats={aiStats}
      recentProjects={recentProjects}
      recentLeadActivity={recentLeadActivity}
      followUps={followUps}
      actionLeads={enrichedLeads as EnrichedLead[]}
      sectorSuggestions={getTopScanSuggestions(3)}
    />
  )
}
