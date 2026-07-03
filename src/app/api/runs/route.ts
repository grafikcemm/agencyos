// GET /api/runs — kanonik run listesi (runs view = directives). Faz 4 trace UI besler.
// ?mode=shadow|active  ?limit= (default 50). Salt-okuma.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

    let query = supabaseAdmin
      .from('runs')
      .select('id, operator_input, intent, channel, mode, status, cost_usd, created_at, finished_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (mode) query = query.eq('mode', mode)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, data: { runs: data ?? [] } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
