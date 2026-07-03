// GET /api/admin/lead-intel-comparison?days=7 — shadow haftası karşılaştırma yüzeyi.
// Gün bazında: eski kapının seçtikleri (o gün oluşturulan lead'ler) vs v2'nin
// selected=true assessment'ları, kesişim, skor/kanıt kapsamı ve GERÇEKLEŞEN maliyet.
// Cutover kararı bu veriyle verilir (7 gün sonra settings → active).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
})

interface DayComparison {
  date: string
  legacyPicks: Array<{ id: string; business_name: string; lead_tier: string | null; quality_score: number | null }>
  v2Selected: Array<{
    business_name: string
    lead_id: string | null
    design_score: number | null
    ai_score: number | null
    verified_evidence_count: number
    mode: string
    primary_service_slug: string | null
  }>
  overlapCount: number
  runStage: string | null
  costUsd: number
}

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { searchParams } = new URL(req.url)
    const parsed = QuerySchema.safeParse({ days: searchParams.get('days') ?? undefined })
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Geçersiz days parametresi' }, { status: 400 })
    }
    const days = parsed.data.days

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceDate = since.toISOString().slice(0, 10)

    // v2 koşuları + assessment'lar (tablolar yoksa boş döner — soft).
    const [runsRes, assessRes, leadsRes] = await Promise.all([
      supabaseAdmin.from('lead_intel_runs').select('run_date, stage, cost_usd, mode').gte('run_date', sinceDate),
      supabaseAdmin
        .from('lead_assessments')
        .select('run_date, lead_id, candidate, selected, mode, design_score, ai_score, verified_evidence_count, chair_verdict')
        .eq('selected', true)
        .gte('run_date', sinceDate),
      supabaseAdmin
        .from('leads')
        .select('id, business_name, lead_tier, quality_score, created_at')
        .gte('created_at', `${sinceDate}T00:00:00Z`)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    const runs = (runsRes.data ?? []) as Array<{ run_date: string; stage: string; cost_usd: number; mode: string }>
    const assessments = (assessRes.data ?? []) as Array<{
      run_date: string
      lead_id: string | null
      candidate: { businessName?: string } | null
      selected: boolean
      mode: string
      design_score: number | null
      ai_score: number | null
      verified_evidence_count: number
      chair_verdict: { primary_service_slug?: string } | null
    }>
    const leads = (leadsRes.data ?? []) as Array<{
      id: string
      business_name: string
      lead_tier: string | null
      quality_score: number | null
      created_at: string
    }>

    // Gün listesi (bugünden geriye).
    const daysList: string[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      daysList.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d))
    }

    const comparison: DayComparison[] = daysList.map((date) => {
      const legacyPicks = leads
        .filter((l) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(l.created_at)) === date)
        .map(({ id, business_name, lead_tier, quality_score }) => ({ id, business_name, lead_tier, quality_score }))

      const v2Selected = assessments
        .filter((a) => a.run_date === date)
        .map((a) => ({
          business_name: a.candidate?.businessName ?? legacyPicks.find((l) => l.id === a.lead_id)?.business_name ?? 'bilinmeyen',
          lead_id: a.lead_id,
          design_score: a.design_score,
          ai_score: a.ai_score,
          verified_evidence_count: a.verified_evidence_count,
          mode: a.mode,
          primary_service_slug: a.chair_verdict?.primary_service_slug ?? null,
        }))

      const legacyIds = new Set(legacyPicks.map((l) => l.id))
      const overlapCount = v2Selected.filter((v) => v.lead_id && legacyIds.has(v.lead_id)).length
      const run = runs.find((r) => r.run_date === date)

      return {
        date,
        legacyPicks,
        v2Selected,
        overlapCount,
        runStage: run?.stage ?? null,
        costUsd: run?.cost_usd ?? 0,
      }
    })

    const totalCost = comparison.reduce((s, d) => s + d.costUsd, 0)
    return NextResponse.json({
      success: true,
      data: {
        days: comparison,
        totals: {
          costUsd: Math.round(totalCost * 10000) / 10000,
          v2SelectedCount: comparison.reduce((s, d) => s + d.v2Selected.length, 0),
          legacyPickCount: comparison.reduce((s, d) => s + d.legacyPicks.length, 0),
          overlapCount: comparison.reduce((s, d) => s + d.overlapCount, 0),
        },
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
