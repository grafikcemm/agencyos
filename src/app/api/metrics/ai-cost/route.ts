import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiUser } from '@/lib/auth'

// GET /api/metrics/ai-cost?month=YYYY-MM
// Aylık AI maliyetini SERVER-side aggregate eder (tier kırılımı + bütçe). Eskiden
// dashboard tüm ai_cost_logs satırlarını cliente çekip orada toplardı (M11) — bu
// endpoint yalnız gerekli kolonları okur ve toplu sonucu döner.

interface CostBreakdown {
  light: number
  medium: number
  heavy: number
  total: number
  budget: number
}

function monthRange(monthParam: string | null): { start: string; end: string } {
  const now = new Date()
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth() // 0-indexed
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    year = y
    month = m - 1
  }
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function GET(req: Request) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const { searchParams } = new URL(req.url)
    const { start, end } = monthRange(searchParams.get('month'))

    const [{ data: logs, error: logErr }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from('ai_cost_logs')
        .select('model_tier, cost_tl')
        .gte('created_at', start)
        .lt('created_at', end)
        .limit(50000),
      supabaseAdmin.from('settings').select('key, value').eq('key', 'ai_monthly_budget_tl').maybeSingle(),
    ])
    if (logErr) throw logErr

    const breakdown: CostBreakdown = { light: 0, medium: 0, heavy: 0, total: 0, budget: 100 }
    for (const log of (logs ?? []) as Array<{ model_tier: string | null; cost_tl: number | null }>) {
      const tier = (log.model_tier ?? 'light').toLowerCase()
      const cost = log.cost_tl ?? 0
      if (tier === 'light' || tier === 'medium' || tier === 'heavy') breakdown[tier] += cost
      breakdown.total += cost
    }
    const budgetRaw = (settings as { value?: string } | null)?.value
    if (budgetRaw) {
      const parsed = parseInt(budgetRaw, 10)
      if (Number.isFinite(parsed) && parsed > 0) breakdown.budget = parsed
    }

    return NextResponse.json(breakdown)
  } catch (error: unknown) {
    console.error('AI cost metrics error:', (error as Error)?.message)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
