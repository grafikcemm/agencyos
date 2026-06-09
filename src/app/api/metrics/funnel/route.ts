// Funnel metrics — kapalı döngü dönüşüm görünümü.
// Lead durum dağılımı, tier dağılımı, sektör bazlı dönüşüm ve tarama verimi.

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

interface LeadRow {
  status: string
  lead_tier: string | null
  normalized_sector: string | null
  sector: string | null
  expected_monthly_value_tl: number | null
}

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('status, lead_tier, normalized_sector, sector, expected_monthly_value_tl')
      .limit(2000)

    if (error) throw error

    const rows = (leads ?? []) as LeadRow[]

    const statusCounts: Record<string, number> = {}
    const tierCounts: Record<string, number> = {}
    const bySector: Record<string, { total: number; contacted: number; converted: number; pipelineValueTl: number }> = {}

    for (const l of rows) {
      statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1
      const tier = l.lead_tier ?? 'unknown'
      tierCounts[tier] = (tierCounts[tier] ?? 0) + 1

      const sectorKey = l.normalized_sector || l.sector || 'Diğer'
      bySector[sectorKey] ??= { total: 0, contacted: 0, converted: 0, pipelineValueTl: 0 }
      bySector[sectorKey].total++
      if (['contacted', 'responded', 'meeting', 'proposal', 'converted'].includes(l.status)) {
        bySector[sectorKey].contacted++
      }
      if (l.status === 'converted') bySector[sectorKey].converted++
      bySector[sectorKey].pipelineValueTl += l.expected_monthly_value_tl ?? 0
    }

    const sectors = Object.entries(bySector)
      .map(([sector, s]) => ({
        sector,
        ...s,
        contactRate: s.total ? Math.round((s.contacted / s.total) * 100) : 0,
        conversionRate: s.contacted ? Math.round((s.converted / s.contacted) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)

    // Tarama geçmişi (son 30 gün) — tablo henüz yoksa boş dön.
    let scanRuns: Array<Record<string, unknown>> = []
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: runs } = await supabaseAdmin
        .from('scan_runs')
        .select('created_at, sector, city, district, source, inserted_count, updated_count, skipped_count')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100)
      scanRuns = runs ?? []
    } catch {
      scanRuns = []
    }

    return NextResponse.json({
      success: true,
      totalLeads: rows.length,
      statusCounts,
      tierCounts,
      sectors,
      scanRuns,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
